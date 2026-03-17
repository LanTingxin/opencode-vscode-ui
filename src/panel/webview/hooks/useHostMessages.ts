import React from "react"
import type { ComposerPathResult, HostMessage, SessionSnapshot } from "../../../bridge/types"
import type { SessionEvent } from "../../../core/sdk"
import { reduceSessionSnapshot } from "../../shared/session-reducer"
import { summarizeSessionSnapshot } from "../../shared/session-summary"
import { bootstrapFromSnapshot, normalizeSnapshotPayload, type AppState, type VsCodeApi } from "../app/state"
import { beginHostMessageTrace, completeHostMessageTrace, countChangedMessages, countReplacedMessages, formatHostMessageTrace, SLOW_HOST_MESSAGE_MS, summarizeSnapshotFieldChanges } from "../lib/host-message-trace"

export function dispatchHostMessage(message: HostMessage, handlers: {
  fileRefStatus: Map<string, boolean>
  onFileSearchResults: (payload: { requestID: string; query: string; results: ComposerPathResult[] }) => void
  onRestoreComposer: (payload: { parts: import("../../../bridge/types").ComposerPromptPart[] }) => void
  onShellCommandSucceeded: () => void
  setPendingMcpActions: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setState: React.Dispatch<React.SetStateAction<AppState>>
  vscode: VsCodeApi
}) {
  const trace = beginHostMessageTrace(message)

  if (message?.type === "bootstrap") {
    handlers.setState((current) => ({ ...current, bootstrap: message.payload, error: "" }))
    return
  }

  if (message?.type === "snapshot") {
    handlers.setState((current) => {
      const normalizeStartedAt = timestamp()
      const nextSnapshot = normalizeSnapshotPayload(message.payload, current.snapshot)
      const normalizeMs = timestamp() - normalizeStartedAt
      const changedFields = summarizeSnapshotFieldChanges(asSessionSnapshot(current), message.payload)
      const completed = completeHostMessageTrace(trace, {
        reduceMs: 0,
        normalizeMs,
        messagesBefore: current.snapshot.messages.length,
        messagesAfter: nextSnapshot.messages.length,
        changedMessages: countChangedMessages(current.snapshot.messages, nextSnapshot.messages),
        replacedMessages: countReplacedMessages(current.snapshot.messages, nextSnapshot.messages),
        changedFields,
      })
      const next = {
        ...current,
        bootstrap: bootstrapFromSnapshot(message.payload),
        snapshot: nextSnapshot,
        hostTraceID: completed?.id ?? current.hostTraceID,
        error: "",
      }
      if (completed && normalizeMs >= SLOW_HOST_MESSAGE_MS) {
        handlers.vscode.postMessage({
          type: "debugLog",
          scope: "host-message",
          message: formatHostMessageTrace(completed),
        })
      }

      return next
    })
    return
  }

  if (message?.type === "sessionEvent") {
    handlers.setState((current) => {
      logSessionEventAnomaly(message.event, asSessionSnapshot(current), handlers.vscode)
      const reduceStartedAt = timestamp()
      const nextSnapshotState = reduceSessionSnapshot(asSessionSnapshot(current), message.event)
      const reduceMs = timestamp() - reduceStartedAt
      if (!nextSnapshotState) {
        return current
      }

      const normalizeStartedAt = timestamp()
      const nextSnapshot = normalizeSnapshotPayload(nextSnapshotState)
      const normalizeMs = timestamp() - normalizeStartedAt
      const changedFields = summarizeSnapshotFieldChanges(asSessionSnapshot(current), nextSnapshotState)
      const completed = completeHostMessageTrace(trace, {
        reduceMs,
        normalizeMs,
        messagesBefore: current.snapshot.messages.length,
        messagesAfter: nextSnapshot.messages.length,
        changedMessages: countChangedMessages(current.snapshot.messages, nextSnapshot.messages),
        replacedMessages: countReplacedMessages(current.snapshot.messages, nextSnapshot.messages),
        changedFields,
      })
      const next = {
        ...current,
        bootstrap: {
          ...bootstrapFromSnapshot(nextSnapshotState),
          message: summarizeSessionSnapshot(nextSnapshotState),
        },
        snapshot: nextSnapshot,
        hostTraceID: completed?.id ?? current.hostTraceID,
        error: "",
      }
      if (completed && reduceMs + normalizeMs >= SLOW_HOST_MESSAGE_MS) {
        handlers.vscode.postMessage({
          type: "debugLog",
          scope: "host-message",
          message: formatHostMessageTrace(completed),
        })
      }

      return next
    })
    return
  }

  if (message?.type === "deferredUpdate") {
    handlers.setState((current) => {
      const completed = completeHostMessageTrace(trace, {
        reduceMs: 0,
        normalizeMs: 0,
        messagesBefore: current.snapshot.messages.length,
        messagesAfter: current.snapshot.messages.length,
        changedMessages: 0,
        replacedMessages: 0,
        changedFields: Object.keys(message.payload),
      })
      const nextSnapshot = {
        ...current.snapshot,
        ...message.payload,
      }
      return {
        ...current,
        bootstrap: {
          ...current.bootstrap,
          message: summarizeSessionSnapshot({
            ...nextSnapshot,
            status: current.bootstrap.status,
            workspaceName: current.bootstrap.workspaceName,
            sessionRef: current.bootstrap.sessionRef,
          }),
        },
        snapshot: {
          ...nextSnapshot,
        },
        hostTraceID: completed?.id ?? current.hostTraceID,
        error: "",
      }
    })
    return
  }

  if (message?.type === "submitting") {
    handlers.setState((current) => ({
      ...current,
      bootstrap: {
        ...current.bootstrap,
        message: summarizeSessionSnapshot({
          ...current.snapshot,
          submitting: message.value,
          status: current.bootstrap.status,
          workspaceName: current.bootstrap.workspaceName,
          sessionRef: current.bootstrap.sessionRef,
        }),
      },
      snapshot: {
        ...current.snapshot,
        submitting: message.value,
      },
    }))
    return
  }

  if (message?.type === "error") {
    handlers.setState((current) => ({ ...current, error: message.message || "Unknown error" }))
    return
  }

  if (message?.type === "fileRefsResolved") {
    for (const item of message.refs) {
      handlers.fileRefStatus.set(item.key, item.exists)
    }
    window.dispatchEvent(new CustomEvent("oc-file-refs-updated"))
    return
  }

  if (message?.type === "fileSearchResults") {
    handlers.onFileSearchResults(message)
    return
  }

  if (message?.type === "restoreComposer") {
    handlers.onRestoreComposer(message)
    return
  }

  if (message?.type === "shellCommandSucceeded") {
    handlers.onShellCommandSucceeded()
    return
  }

  if (message?.type === "mcpActionFinished") {
    handlers.setPendingMcpActions((current) => {
      if (!current[message.name]) {
        return current
      }
      const next = { ...current }
      delete next[message.name]
      return next
    })
  }
}

function logSessionEventAnomaly(event: SessionEvent, snapshot: SessionSnapshot, vscode: VsCodeApi) {
  if (event.type === "message.part.updated") {
    const props = event.properties as { part: { sessionID: string; messageID: string; id: string } }
    if (!snapshot.relatedSessionIds.includes(props.part.sessionID)) {
      return
    }

    if (!findMessage(snapshot, props.part.sessionID, props.part.messageID)) {
      vscode.postMessage({
        type: "debugLog",
        scope: "host-message",
        message: `anomaly message.part.updated missing-message session=${props.part.sessionID} message=${props.part.messageID} part=${props.part.id}`,
      })
    }
    return
  }

  if (event.type !== "message.part.delta") {
    return
  }

  const props = event.properties as {
    sessionID: string
    messageID: string
    partID: string
    field: string
  }
  if (!snapshot.relatedSessionIds.includes(props.sessionID)) {
    return
  }

  const targetMessage = findMessage(snapshot, props.sessionID, props.messageID)
  if (!targetMessage) {
    vscode.postMessage({
      type: "debugLog",
      scope: "host-message",
      message: `anomaly message.part.delta missing-message session=${props.sessionID} message=${props.messageID} part=${props.partID} field=${props.field}`,
    })
    return
  }

  const targetPart = targetMessage.parts.find((part) => part.id === props.partID)
  if (!targetPart) {
    vscode.postMessage({
      type: "debugLog",
      scope: "host-message",
      message: `anomaly message.part.delta missing-part session=${props.sessionID} message=${props.messageID} part=${props.partID} field=${props.field}`,
    })
    return
  }

  const current = targetPart[props.field as keyof typeof targetPart]
  if (typeof current !== "string") {
    vscode.postMessage({
      type: "debugLog",
      scope: "host-message",
      message: `anomaly message.part.delta non-string-field session=${props.sessionID} message=${props.messageID} part=${props.partID} field=${props.field}`,
    })
  }
}

function findMessage(snapshot: SessionSnapshot, sessionID: string, messageID: string) {
  const messages = sessionID === snapshot.sessionRef.sessionId
    ? snapshot.messages
    : snapshot.childMessages[sessionID] ?? []
  return messages.find((item) => item.info.id === messageID)
}

function asSessionSnapshot(state: AppState): SessionSnapshot {
  return {
    ...state.snapshot,
    status: state.bootstrap.status,
    workspaceName: state.bootstrap.workspaceName,
    sessionRef: state.bootstrap.sessionRef,
    session: state.snapshot.session,
    message: state.bootstrap.message || "",
  }
}

export function useHostMessages({
  fileRefStatus,
  onFileSearchResults,
  onRestoreComposer,
  onShellCommandSucceeded,
  setPendingMcpActions,
  setState,
  vscode,
}: {
  fileRefStatus: Map<string, boolean>
  onFileSearchResults: (payload: { requestID: string; query: string; results: ComposerPathResult[] }) => void
  onRestoreComposer: (payload: { parts: import("../../../bridge/types").ComposerPromptPart[] }) => void
  onShellCommandSucceeded: () => void
  setPendingMcpActions: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setState: React.Dispatch<React.SetStateAction<AppState>>
  vscode: VsCodeApi
}) {
  const fileSearchHandlerRef = React.useRef(onFileSearchResults)
  const restoreComposerHandlerRef = React.useRef(onRestoreComposer)
  const shellSucceededHandlerRef = React.useRef(onShellCommandSucceeded)

  React.useEffect(() => {
    fileSearchHandlerRef.current = onFileSearchResults
  }, [onFileSearchResults])

  React.useEffect(() => {
    restoreComposerHandlerRef.current = onRestoreComposer
  }, [onRestoreComposer])

  React.useEffect(() => {
    shellSucceededHandlerRef.current = onShellCommandSucceeded
  }, [onShellCommandSucceeded])

  React.useEffect(() => {
    const handler = (event: MessageEvent<HostMessage>) => {
      dispatchHostMessage(event.data, {
        fileRefStatus,
        onFileSearchResults: (payload) => fileSearchHandlerRef.current(payload),
        onRestoreComposer: (payload) => restoreComposerHandlerRef.current(payload),
        onShellCommandSucceeded: () => shellSucceededHandlerRef.current(),
        setPendingMcpActions,
        setState,
        vscode,
      })
    }

    window.addEventListener("message", handler)
    vscode.postMessage({ type: "ready" })
    return () => window.removeEventListener("message", handler)
  }, [fileRefStatus, setPendingMcpActions, setState, vscode])
}

function timestamp() {
  return globalThis.performance?.now() ?? Date.now()
}
