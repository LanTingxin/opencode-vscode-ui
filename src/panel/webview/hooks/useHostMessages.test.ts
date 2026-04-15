import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { Dispatch, SetStateAction } from "react"

import type { HostMessage } from "../../../bridge/types"
import { dispatchHostMessage } from "./useHostMessages"
import { createInitialState, type AppState } from "../app/state"

function applyStateUpdate(update: SetStateAction<AppState>, state: AppState) {
  return typeof update === "function"
    ? (update as (current: AppState) => AppState)(state)
    : update
}

describe("dispatchHostMessage", () => {
  test("dispatches shellCommandSucceeded to callback", () => {
    let called = 0
    const fileRefStatus = new Map<string, boolean>()

    dispatchHostMessage({ type: "shellCommandSucceeded" } satisfies HostMessage, {
      fileRefStatus,
      onFileSearchResults: () => {},
      onRestoreComposer: () => {},
      onShellCommandSucceeded: () => {
        called += 1
      },
      setPendingMcpActions: (() => {}) as Dispatch<SetStateAction<Record<string, boolean>>>,
      setState: (() => {}) as Dispatch<SetStateAction<AppState>>,
    })

    assert.equal(called, 1)
  })

  test("dispatches restoreComposer to callback", () => {
    let restored: string | null = null
    const fileRefStatus = new Map<string, boolean>()

    dispatchHostMessage({
      type: "restoreComposer",
      parts: [{ type: "text", text: "echo hi" }],
    } satisfies HostMessage, {
      fileRefStatus,
      onFileSearchResults: () => {},
      onRestoreComposer: (payload) => {
        restored = payload.parts.map((p) => p.type === "text" ? p.text : "").join("")
      },
      onShellCommandSucceeded: () => {},
      setPendingMcpActions: (() => {}) as Dispatch<SetStateAction<Record<string, boolean>>>,
      setState: (() => {}) as Dispatch<SetStateAction<AppState>>,
    })

    assert.equal(restored, "echo hi")
  })

  test("applies sessionEvent incrementally and preserves unchanged message references", () => {
    const fileRefStatus = new Map<string, boolean>()
    let state = createInitialState({
      workspaceId: "file:///workspace",
      dir: "/workspace",
      sessionId: "session-1",
    })

    const userMessage = {
      info: {
        id: "m1",
        sessionID: "session-1",
        role: "user" as const,
        time: { created: 1 },
      },
      parts: [{
        id: "p1",
        sessionID: "session-1",
        messageID: "m1",
        type: "text" as const,
        text: "hello",
      }],
    }
    const assistantText = {
      id: "p2",
      sessionID: "session-1",
      messageID: "m2",
      type: "text" as const,
      text: "before",
    }
    const assistantMessage = {
      info: {
        id: "m2",
        sessionID: "session-1",
        role: "assistant" as const,
        time: { created: 2 },
      },
      parts: [assistantText],
    }

    dispatchHostMessage({
      type: "snapshot",
      reason: "test:snapshot",
      payload: {
        status: "ready",
        workspaceName: "workspace",
        sessionRef: state.bootstrap.sessionRef,
        session: {
          id: "session-1",
          directory: "/workspace",
          title: "session-1",
          time: { created: 0, updated: 0 },
        },
        message: "ready",
        display: {
          showInternals: false,
          showThinking: true,
          diffMode: "unified" as const,
          panelTheme: "default" as const,
        },
        sessionStatus: { type: "idle" },
        messages: [userMessage, assistantMessage],
        childMessages: {},
        childSessions: {},
        submitting: false,
        todos: [],
        diff: [],
        permissions: [],
        questions: [],
        agents: [],
        defaultAgent: undefined,
        providers: [],
        providerDefault: undefined,
        configuredModel: undefined,
        mcp: {},
        mcpResources: {},
        lsp: [],
        commands: [],
        relatedSessionIds: ["session-1"],
        agentMode: "build",
        navigation: {},
      },
    } satisfies HostMessage, {
      fileRefStatus,
      onFileSearchResults: () => {},
      onRestoreComposer: () => {},
      onShellCommandSucceeded: () => {},
      setPendingMcpActions: (() => {}) as Dispatch<SetStateAction<Record<string, boolean>>>,
      setState: ((update: SetStateAction<AppState>) => {
        state = applyStateUpdate(update, state)
      }) as Dispatch<SetStateAction<AppState>>,
    })

    const previousUser = state.snapshot.messages[0]
    const previousAssistant = state.snapshot.messages[1]
    const previousAssistantText = previousAssistant?.parts[0]

    dispatchHostMessage({
      type: "sessionEvent",
      event: {
        type: "message.part.delta",
        properties: {
          sessionID: "session-1",
          messageID: "m2",
          partID: "p2",
          field: "text",
          delta: " after",
        },
      },
    } satisfies HostMessage, {
      fileRefStatus,
      onFileSearchResults: () => {},
      onRestoreComposer: () => {},
      onShellCommandSucceeded: () => {},
      setPendingMcpActions: (() => {}) as Dispatch<SetStateAction<Record<string, boolean>>>,
      setState: ((update: SetStateAction<AppState>) => {
        state = applyStateUpdate(update, state)
      }) as Dispatch<SetStateAction<AppState>>,
    })

    assert.strictEqual(state.snapshot.messages[0], previousUser)
    assert.notStrictEqual(state.snapshot.messages[1], previousAssistant)
    assert.notStrictEqual(state.snapshot.messages[1]?.parts[0], previousAssistantText)
    assert.equal(state.snapshot.messages[1]?.parts[0]?.type, "text")
    assert.equal(state.snapshot.messages[1]?.parts[0]?.type === "text" ? state.snapshot.messages[1].parts[0].text : undefined, "before after")
  })

  test("reconciles full snapshot updates and preserves unchanged message references", () => {
    const fileRefStatus = new Map<string, boolean>()
    let state = createInitialState({
      workspaceId: "file:///workspace",
      dir: "/workspace",
      sessionId: "session-1",
    })

    const userMessage = {
      info: {
        id: "m1",
        sessionID: "session-1",
        role: "user" as const,
        time: { created: 1 },
      },
      parts: [{
        id: "p1",
        sessionID: "session-1",
        messageID: "m1",
        type: "text" as const,
        text: "hello",
      }],
    }
    const assistantMessage = {
      info: {
        id: "m2",
        sessionID: "session-1",
        role: "assistant" as const,
        time: { created: 2 },
      },
      parts: [{
        id: "p2",
        sessionID: "session-1",
        messageID: "m2",
        type: "text" as const,
        text: "before",
      }],
    }

    const basePayload = {
      status: "ready" as const,
      workspaceName: "workspace",
      sessionRef: state.bootstrap.sessionRef,
      session: {
        id: "session-1",
        directory: "/workspace",
        title: "session-1",
        time: { created: 0, updated: 0 },
      },
      message: "ready",
      display: {
        showInternals: false,
        showThinking: true,
        diffMode: "unified" as const,
        panelTheme: "default" as const,
      },
      sessionStatus: { type: "idle" as const },
      messages: [userMessage, assistantMessage],
      childMessages: {},
      childSessions: {},
      submitting: false,
      todos: [],
      diff: [],
      permissions: [],
      questions: [],
      agents: [],
      defaultAgent: undefined,
      providers: [],
      providerDefault: undefined,
      configuredModel: undefined,
      mcp: {},
      mcpResources: {},
      lsp: [],
      commands: [],
      relatedSessionIds: ["session-1"],
      agentMode: "build" as const,
      navigation: {},
    }

    dispatchHostMessage({
      type: "snapshot",
      reason: "test:initial",
      payload: basePayload,
    } satisfies HostMessage, {
      fileRefStatus,
      onFileSearchResults: () => {},
      onRestoreComposer: () => {},
      onShellCommandSucceeded: () => {},
      setPendingMcpActions: (() => {}) as Dispatch<SetStateAction<Record<string, boolean>>>,
      setState: ((update: SetStateAction<AppState>) => {
        state = applyStateUpdate(update, state)
      }) as Dispatch<SetStateAction<AppState>>,
    })

    const previousUser = state.snapshot.messages[0]
    const previousAssistant = state.snapshot.messages[1]
    const previousAssistantPart = previousAssistant?.parts[0]

    dispatchHostMessage({
      type: "snapshot",
      reason: "test:session-updated",
      payload: {
        ...basePayload,
        session: {
          ...basePayload.session,
          title: "session-1 renamed",
        },
        messages: [
          {
            info: { ...userMessage.info, time: { ...userMessage.info.time } },
            parts: [{ ...userMessage.parts[0] }],
          },
          {
            info: { ...assistantMessage.info, time: { ...assistantMessage.info.time } },
            parts: [{ ...assistantMessage.parts[0] }],
          },
        ],
      },
    } satisfies HostMessage, {
      fileRefStatus,
      onFileSearchResults: () => {},
      onRestoreComposer: () => {},
      onShellCommandSucceeded: () => {},
      setPendingMcpActions: (() => {}) as Dispatch<SetStateAction<Record<string, boolean>>>,
      setState: ((update: SetStateAction<AppState>) => {
        state = applyStateUpdate(update, state)
      }) as Dispatch<SetStateAction<AppState>>,
    })

    assert.strictEqual(state.snapshot.messages[0], previousUser)
    assert.strictEqual(state.snapshot.messages[1], previousAssistant)
    assert.strictEqual(state.snapshot.messages[1]?.parts[0], previousAssistantPart)
    assert.equal(state.snapshot.session?.title, "session-1 renamed")
  })

  test("preserves unchanged child message list references across metadata-only snapshots", () => {
    const fileRefStatus = new Map<string, boolean>()
    let state = createInitialState({
      workspaceId: "file:///workspace",
      dir: "/workspace",
      sessionId: "session-1",
    })

    const childMessage = {
      info: {
        id: "cm1",
        sessionID: "child-1",
        role: "assistant" as const,
        time: { created: 3 },
      },
      parts: [{
        id: "cp1",
        sessionID: "child-1",
        messageID: "cm1",
        type: "text" as const,
        text: "child message",
      }],
    }

    const payload = {
      status: "ready" as const,
      workspaceName: "workspace",
      sessionRef: state.bootstrap.sessionRef,
      session: {
        id: "session-1",
        directory: "/workspace",
        title: "session-1",
        time: { created: 0, updated: 0 },
      },
      message: "ready",
      display: {
        showInternals: false,
        showThinking: true,
        diffMode: "unified" as const,
        panelTheme: "default" as const,
      },
      sessionStatus: { type: "idle" as const },
      messages: [],
      childMessages: {
        "child-1": [childMessage],
      },
      childSessions: {
        "child-1": {
          id: "child-1",
          directory: "/workspace",
          parentID: "session-1",
          title: "child-1",
          time: { created: 0, updated: 0 },
        },
      },
      submitting: false,
      todos: [],
      diff: [],
      permissions: [],
      questions: [],
      agents: [],
      defaultAgent: undefined,
      providers: [],
      providerDefault: undefined,
      configuredModel: undefined,
      mcp: {},
      mcpResources: {},
      lsp: [],
      commands: [],
      relatedSessionIds: ["session-1", "child-1"],
      agentMode: "build" as const,
      navigation: {},
    }

    dispatchHostMessage({
      type: "snapshot",
      reason: "test:initial-child",
      payload,
    } satisfies HostMessage, {
      fileRefStatus,
      onFileSearchResults: () => {},
      onRestoreComposer: () => {},
      onShellCommandSucceeded: () => {},
      setPendingMcpActions: (() => {}) as Dispatch<SetStateAction<Record<string, boolean>>>,
      setState: ((update: SetStateAction<AppState>) => {
        state = applyStateUpdate(update, state)
      }) as Dispatch<SetStateAction<AppState>>,
    })

    const previousChildMessages = state.snapshot.childMessages["child-1"]
    const previousChildPart = previousChildMessages?.[0]?.parts[0]

    dispatchHostMessage({
      type: "snapshot",
      reason: "test:metadata-only-child",
      payload: {
        ...payload,
        sessionStatus: { type: "busy" as const },
        childMessages: {
          "child-1": [{
            info: { ...childMessage.info, time: { ...childMessage.info.time } },
            parts: [{ ...childMessage.parts[0] }],
          }],
        },
      },
    } satisfies HostMessage, {
      fileRefStatus,
      onFileSearchResults: () => {},
      onRestoreComposer: () => {},
      onShellCommandSucceeded: () => {},
      setPendingMcpActions: (() => {}) as Dispatch<SetStateAction<Record<string, boolean>>>,
      setState: ((update: SetStateAction<AppState>) => {
        state = applyStateUpdate(update, state)
      }) as Dispatch<SetStateAction<AppState>>,
    })

    assert.strictEqual(state.snapshot.childMessages["child-1"], previousChildMessages)
    assert.strictEqual(state.snapshot.childMessages["child-1"]?.[0]?.parts[0], previousChildPart)
    assert.equal(state.snapshot.sessionStatus?.type, "busy")
  })

  test("keeps newer transcript text when a stale snapshot arrives after incremental streaming", () => {
    const fileRefStatus = new Map<string, boolean>()
    let state = createInitialState({
      workspaceId: "file:///workspace",
      dir: "/workspace",
      sessionId: "session-1",
    })

    const assistantMessage = {
      info: {
        id: "m1",
        sessionID: "session-1",
        role: "assistant" as const,
        time: { created: 1 },
      },
      parts: [{
        id: "p1",
        sessionID: "session-1",
        messageID: "m1",
        type: "text" as const,
        text: "before",
      }],
    }

    const payload = {
      status: "ready" as const,
      workspaceName: "workspace",
      sessionRef: state.bootstrap.sessionRef,
      session: {
        id: "session-1",
        directory: "/workspace",
        title: "session-1",
        time: { created: 0, updated: 0 },
      },
      message: "ready",
      display: {
        showInternals: false,
        showThinking: true,
        diffMode: "unified" as const,
        panelTheme: "default" as const,
      },
      sessionStatus: { type: "busy" as const },
      messages: [assistantMessage],
      childMessages: {},
      childSessions: {},
      submitting: false,
      todos: [],
      diff: [],
      permissions: [],
      questions: [],
      agents: [],
      defaultAgent: undefined,
      providers: [],
      providerDefault: undefined,
      configuredModel: undefined,
      mcp: {},
      mcpResources: {},
      lsp: [],
      commands: [],
      relatedSessionIds: ["session-1"],
      agentMode: "build" as const,
      navigation: {},
    }

    dispatchHostMessage({
      type: "snapshot",
      reason: "test:stream-initial",
      payload,
    } satisfies HostMessage, {
      fileRefStatus,
      onFileSearchResults: () => {},
      onRestoreComposer: () => {},
      onShellCommandSucceeded: () => {},
      setPendingMcpActions: (() => {}) as Dispatch<SetStateAction<Record<string, boolean>>>,
      setState: ((update: SetStateAction<AppState>) => {
        state = applyStateUpdate(update, state)
      }) as Dispatch<SetStateAction<AppState>>,
    })

    dispatchHostMessage({
      type: "sessionEvent",
      event: {
        type: "message.part.delta",
        properties: {
          sessionID: "session-1",
          messageID: "m1",
          partID: "p1",
          field: "text",
          delta: " after",
        },
      },
    } satisfies HostMessage, {
      fileRefStatus,
      onFileSearchResults: () => {},
      onRestoreComposer: () => {},
      onShellCommandSucceeded: () => {},
      setPendingMcpActions: (() => {}) as Dispatch<SetStateAction<Record<string, boolean>>>,
      setState: ((update: SetStateAction<AppState>) => {
        state = applyStateUpdate(update, state)
      }) as Dispatch<SetStateAction<AppState>>,
    })

    dispatchHostMessage({
      type: "snapshot",
      reason: "test:stream-stale",
      payload: {
        ...payload,
        session: {
          ...payload.session,
          title: "session-1 renamed",
        },
        messages: [{
          info: { ...assistantMessage.info, time: { ...assistantMessage.info.time } },
          parts: [{ ...assistantMessage.parts[0] }],
        }],
      },
    } satisfies HostMessage, {
      fileRefStatus,
      onFileSearchResults: () => {},
      onRestoreComposer: () => {},
      onShellCommandSucceeded: () => {},
      setPendingMcpActions: (() => {}) as Dispatch<SetStateAction<Record<string, boolean>>>,
      setState: ((update: SetStateAction<AppState>) => {
        state = applyStateUpdate(update, state)
      }) as Dispatch<SetStateAction<AppState>>,
    })

    assert.equal(state.snapshot.messages[0]?.parts[0]?.type, "text")
    assert.equal(state.snapshot.messages[0]?.parts[0]?.type === "text" ? state.snapshot.messages[0].parts[0].text : undefined, "before after")
    assert.equal(state.snapshot.session?.title, "session-1 renamed")
  })
})
