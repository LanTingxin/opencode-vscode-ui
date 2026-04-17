import * as vscode from "vscode"
import type { SessionPanelRef } from "../bridge/types"
import { EventHub } from "../core/events"
import type { Client, FileDiff, SessionEvent, SessionInfo, SessionMessage, SessionStatus, Todo } from "../core/sdk"
import { WorkspaceManager } from "../core/workspace"
import { SessionPanelManager } from "../panel/provider"
import { appendDelta, removePart, sortMessages, upsertMessage, upsertPart } from "../panel/provider/mutations"
import { summarizeSubagentActivity } from "./subagent-activity"

export type FocusedSubagentItem = {
  session: SessionInfo
  status: SessionStatus
  activity: string
}

export type FocusedSessionState = {
  status: "idle" | "loading" | "ready" | "error"
  ref?: SessionPanelRef
  session?: SessionInfo
  todos: Todo[]
  diff: FileDiff[]
  subagents: FocusedSubagentItem[]
  childMessages: Record<string, SessionMessage[]>
  branch?: string
  defaultBranch?: string
  error?: string
}

const idleState: FocusedSessionState = {
  status: "idle",
  todos: [],
  diff: [],
  subagents: [],
  childMessages: {},
}

export class FocusedSessionStore implements vscode.Disposable {
  private readonly change = new vscode.EventEmitter<void>()
  private state: FocusedSessionState = idleState
  private run = 0
  private activeRef: SessionPanelRef | undefined
  private selectedRef: SessionPanelRef | undefined
  private ignoredNextActiveRef: SessionPanelRef | undefined

  readonly onDidChange = this.change.event

  constructor(
    private mgr: WorkspaceManager,
    private panels: SessionPanelManager,
    private events: EventHub,
    private out: vscode.OutputChannel,
  ) {
    this.panels.onDidChangeActiveSession((ref) => {
      if (sameRef(ref, this.ignoredNextActiveRef)) {
        this.ignoredNextActiveRef = undefined
        void this.focus(this.resolveRef())
        return
      }

      this.ignoredNextActiveRef = undefined
      this.activeRef = ref
      if (ref) {
        this.selectedRef = ref
      }
      void this.focus(this.resolveRef())
    })

    this.events.onDidEvent((item) => {
      void this.handle(item.workspaceId, item.event)
    })

    this.mgr.onDidChange(() => {
      const ref = this.state.ref
      if (!ref) {
        return
      }

      const rt = this.mgr.get(ref.workspaceId)
      if (rt?.state === "ready" && rt.sdk) {
        if (this.state.status === "loading") {
          void this.focus(this.resolveRef())
        }
        return
      }

      if (!rt || (rt.state !== "ready" && this.state.status !== "loading")) {
        this.set({
          status: "loading",
          ref,
          session: this.state.session,
          todos: [],
          diff: [],
          subagents: [],
          childMessages: {},
        })
      }
    })

    this.activeRef = this.panels.activeSession()
    if (this.activeRef) {
      this.selectedRef = this.activeRef
    }
    void this.focus(this.resolveRef())
  }

  snapshot() {
    return this.state
  }

  selectSession(ref?: SessionPanelRef) {
    this.ignoredNextActiveRef = undefined
    this.selectedRef = ref
    void this.focus(this.resolveRef())
  }

  preserveFocusForNextActive(ref?: SessionPanelRef) {
    this.ignoredNextActiveRef = ref
  }

  dispose() {
    this.change.dispose()
  }

  private async focus(ref?: SessionPanelRef) {
    if (!ref) {
      this.set(idleState)
      return
    }

    if (sameRef(this.state.ref, ref) && this.state.status === "ready") {
      return
    }

    const run = ++this.run
    this.set({
      status: "loading",
      ref,
      session: this.state.session?.id === ref.sessionId ? this.state.session : undefined,
      todos: [],
      diff: [],
      subagents: [],
      childMessages: {},
    })

    const rt = this.mgr.get(ref.workspaceId)
    if (!rt || rt.state !== "ready" || !rt.sdk) {
      this.set({
        status: "loading",
        ref,
        session: this.state.session?.id === ref.sessionId ? this.state.session : undefined,
        todos: [],
        diff: [],
        subagents: [],
        childMessages: {},
      })
      return
    }

    try {
      const loaded = await loadFocusedSessionState({
        ref,
        runtime: {
          dir: rt.dir,
          sdk: rt.sdk,
        },
      })

      if (run !== this.run || !sameRef(this.state.ref, ref)) {
        return
      }

      this.set({
        status: "ready",
        ref,
        ...loaded,
      })
    } catch (err) {
      const message = text(err)
      this.log(`focused session load failed: ${message}`)
      if (run !== this.run || !sameRef(this.state.ref, ref)) {
        return
      }
      this.set({
        status: "error",
        ref,
        todos: [],
        diff: [],
        subagents: [],
        childMessages: {},
        error: message,
      })
    }
  }

  private async handle(workspaceId: string, event: SessionEvent) {
    const ref = this.state.ref
    if (!ref || ref.workspaceId !== workspaceId) {
      return
    }

    if (event.type === "server.instance.disposed") {
      await this.focus(ref)
      return
    }

    if (event.type === "todo.updated") {
      const props = event.properties as { sessionID: string; todos: Todo[] }
      if (props.sessionID !== ref.sessionId) {
        return
      }
      this.set({
        ...this.state,
        status: "ready",
        todos: props.todos,
      })
      return
    }

    if (event.type === "session.diff") {
      const props = event.properties as { sessionID: string; diff: FileDiff[] }
      if (props.sessionID !== ref.sessionId) {
        return
      }
      this.set({
        ...this.state,
        status: "ready",
        diff: props.diff,
      })
      return
    }

    if (event.type === "session.status") {
      const props = event.properties as { sessionID: string; status: SessionStatus }
      if (!props.sessionID || !this.state.subagents.some((item) => item.session.id === props.sessionID)) {
        return
      }

      this.set({
        ...this.state,
        status: "ready",
        subagents: this.state.subagents.map((item) => item.session.id === props.sessionID
          ? {
              ...item,
              status: props.status,
              activity: summarizeSubagentActivity(props.status, this.state.childMessages[props.sessionID] ?? []),
            }
          : item),
      })
      return
    }

    if (event.type === "session.updated" || event.type === "session.created") {
      const props = event.properties as { info: SessionInfo }
      if (props.info?.id !== ref.sessionId) {
        if (!isTrackedSubagent(ref.sessionId, props.info)) {
          if (this.state.subagents.some((item) => item.session.id === props.info?.id)) {
            this.set({
              ...this.state,
              status: "ready",
              subagents: removeSubagent(this.state.subagents, props.info.id),
              childMessages: removeSubagentMessages(this.state.childMessages, props.info.id),
            })
          }
          return
        }

        this.set({
          ...this.state,
          status: "ready",
          subagents: upsertSubagent(this.state.subagents, props.info),
        })
        return
      }
      if (props.info.time.archived) {
        this.clearRef(props.info.id, workspaceId)
        await this.focus(this.resolveRef())
        return
      }
      this.set({
        ...this.state,
        session: props.info,
      })
      return
    }

    if (event.type === "session.deleted") {
      const props = event.properties as { info: SessionInfo }
      if (props.info?.id !== ref.sessionId) {
        if (!this.state.subagents.some((item) => item.session.id === props.info?.id)) {
          return
        }

        this.set({
          ...this.state,
          status: "ready",
          subagents: removeSubagent(this.state.subagents, props.info.id),
          childMessages: removeSubagentMessages(this.state.childMessages, props.info.id),
        })
        return
      }
      this.clearRef(props.info.id, workspaceId)
      await this.focus(this.resolveRef())
      return
    }

    if (event.type === "message.updated") {
      const props = event.properties as { info: SessionMessage["info"] }
      if (!this.state.subagents.some((item) => item.session.id === props.info.sessionID)) {
        return
      }

      const messages = upsertMessage(this.state.childMessages[props.info.sessionID] ?? [], props.info)
      this.set(updateSubagentMessages(this.state, props.info.sessionID, messages))
      return
    }

    if (event.type === "message.removed") {
      const props = event.properties as { sessionID: string; messageID: string }
      if (!this.state.subagents.some((item) => item.session.id === props.sessionID)) {
        return
      }

      const messages = (this.state.childMessages[props.sessionID] ?? []).filter((item) => item.info.id !== props.messageID)
      this.set(updateSubagentMessages(this.state, props.sessionID, messages))
      return
    }

    if (event.type === "message.part.updated") {
      const props = event.properties as { part: SessionMessage["parts"][number] }
      if (!this.state.subagents.some((item) => item.session.id === props.part.sessionID)) {
        return
      }

      const messages = upsertPart(this.state.childMessages[props.part.sessionID] ?? [], props.part)
      this.set(updateSubagentMessages(this.state, props.part.sessionID, messages))
      return
    }

    if (event.type === "message.part.removed") {
      const props = event.properties as { messageID: string; partID: string }
      const nextMessages: Record<string, SessionMessage[]> = {}
      let changed = false

      for (const item of this.state.subagents) {
        const current = this.state.childMessages[item.session.id] ?? []
        const next = removePart(current, props.messageID, props.partID)
        nextMessages[item.session.id] = next
        if (next !== current) {
          changed = true
        }
      }

      if (!changed) {
        return
      }

      let nextState = {
        ...this.state,
        childMessages: {
          ...this.state.childMessages,
          ...nextMessages,
        },
      }

      for (const item of this.state.subagents) {
        nextState = updateSubagentMessages(nextState, item.session.id, nextMessages[item.session.id] ?? [])
      }
      this.set(nextState)
      return
    }

    if (event.type === "message.part.delta") {
      const props = event.properties as {
        sessionID: string
        messageID: string
        partID: string
        field: string
        delta: string
      }
      if (!this.state.subagents.some((item) => item.session.id === props.sessionID)) {
        return
      }

      const messages = appendDelta(this.state.childMessages[props.sessionID] ?? [], props.messageID, props.partID, props.field, props.delta)
      this.set(updateSubagentMessages(this.state, props.sessionID, messages))
    }
  }

  private set(next: FocusedSessionState) {
    this.state = next
    this.change.fire()
  }

  private log(message: string) {
    this.out.appendLine(`[focused-session] ${message}`)
  }

  private resolveRef() {
    return this.activeRef ?? this.selectedRef
  }

  private clearRef(sessionId: string, workspaceId: string) {
    if (this.activeRef?.workspaceId === workspaceId && this.activeRef.sessionId === sessionId) {
      this.activeRef = undefined
    }

    if (this.selectedRef?.workspaceId === workspaceId && this.selectedRef.sessionId === sessionId) {
      this.selectedRef = undefined
    }
  }
}

export async function loadFocusedSessionState(input: {
  ref: SessionPanelRef
  runtime: {
    dir: string
    sdk: Client
  }
}) {
  const [sessionRes, todoRes, diffRes, vcsRes] = await Promise.all([
    input.runtime.sdk.session.get({
      sessionID: input.ref.sessionId,
      directory: input.ref.dir,
    }),
    input.runtime.sdk.session.todo({
      sessionID: input.ref.sessionId,
      directory: input.ref.dir,
    }),
    input.runtime.sdk.session.diff({
      sessionID: input.ref.sessionId,
      directory: input.ref.dir,
    }),
    input.runtime.sdk.vcs.get({
      directory: input.ref.dir,
    }),
  ])
  const { childMessages, subagents } = await loadSubagents(input.runtime.sdk, input.ref.dir, input.ref.sessionId)

  return {
    session: sessionRes.data,
    todos: todoRes.data ?? [],
    diff: diffRes.data ?? [],
    subagents,
    childMessages,
    branch: vcsRes.data?.branch,
    defaultBranch: vcsRes.data?.default_branch,
  }
}

async function loadSubagents(sdk: Client, dir: string, sessionID: string) {
  if (typeof sdk.session.children !== "function" || typeof sdk.session.status !== "function") {
    return {
      subagents: [],
      childMessages: {},
    }
  }

  const res = await sdk.session.children({
    sessionID,
    directory: dir,
  })
  const sessions = (res.data ?? []).filter((session) => !session.time.archived)
  const statusMap = (await sdk.session.status({
    directory: dir,
  })).data ?? {}
  const childMessages = typeof sdk.session.messages === "function"
    ? Object.fromEntries(await Promise.all(sessions.map(async (session) => {
        const messages = await sdk.session.messages({
          sessionID: session.id,
          directory: dir,
          limit: 200,
        })
        return [session.id, sortMessages(messages.data ?? [])]
      })))
    : {}

  return {
    childMessages,
    subagents: sessions.map((session) => {
      const status = statusMap[session.id] ?? idleStatus()
      return {
        session,
        status,
        activity: summarizeSubagentActivity(status, childMessages[session.id] ?? []),
      }
    }),
  }
}

function idleStatus(): SessionStatus {
  return { type: "idle" }
}

function isTrackedSubagent(rootSessionID: string, info?: SessionInfo) {
  if (!info || info.time.archived) {
    return false
  }

  return info.parentID === rootSessionID
}

function upsertSubagent(subagents: FocusedSubagentItem[], info: SessionInfo) {
  const next = subagents.filter((item) => item.session.id !== info.id)
  const existing = subagents.find((item) => item.session.id === info.id)
  next.push({
    session: info,
    status: existing?.status ?? idleStatus(),
    activity: existing?.activity ?? "",
  })
  return next
}

function removeSubagent(subagents: FocusedSubagentItem[], sessionID: string) {
  return subagents.filter((item) => item.session.id !== sessionID)
}

function removeSubagentMessages(childMessages: Record<string, SessionMessage[]>, sessionID: string) {
  const next = { ...childMessages }
  delete next[sessionID]
  return next
}

function updateSubagentMessages(state: FocusedSessionState, sessionID: string, messages: SessionMessage[]) {
  return {
    ...state,
    status: "ready" as const,
    childMessages: {
      ...state.childMessages,
      [sessionID]: messages,
    },
    subagents: state.subagents.map((item) => item.session.id === sessionID
      ? {
          ...item,
          activity: summarizeSubagentActivity(item.status, messages),
        }
      : item),
  }
}

function sameRef(a?: SessionPanelRef, b?: SessionPanelRef) {
  return a?.workspaceId === b?.workspaceId && a?.sessionId === b?.sessionId
}

function text(err: unknown) {
  if (err instanceof Error) {
    return err.message
  }

  return String(err)
}
