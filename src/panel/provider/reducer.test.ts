import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { SessionSnapshot } from "../../bridge/types"
import type { SessionEvent, SessionInfo } from "../../core/sdk"
import { needsRefresh } from "./reducer"

function session(id: string, options?: Partial<SessionInfo>): SessionInfo {
  return {
    id,
    directory: "/workspace",
    title: id,
    time: {
      created: 0,
      updated: 0,
      archived: options?.time?.archived,
    },
    ...options,
  }
}

function snapshot(current: SessionInfo, relatedSessionIds: string[]): SessionSnapshot {
  return {
    status: "ready",
    sessionRef: {
      workspaceId: "file:///workspace",
      dir: "/workspace",
      sessionId: current.id,
    },
    workspaceName: "workspace",
    session: current,
    message: "",
    sessionStatus: { type: "idle" },
    messages: [],
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
    relatedSessionIds,
    agentMode: "build",
    navigation: {},
  }
}

function sessionEvent(info: SessionInfo): SessionEvent {
  return {
    type: "session.created",
    properties: { info },
  }
}

describe("needsRefresh", () => {
  test("refreshes root panels when a grandchild is created under a known child", () => {
    const payload = snapshot(session("root"), ["root", "child-a"])
    const event = sessionEvent(session("grandchild-a", { parentID: "child-a" }))

    assert.equal(needsRefresh(event, payload), true)
  })

  test("refreshes child panels when a sibling is created", () => {
    const payload = snapshot(session("child-a", { parentID: "root" }), ["child-a"])
    const event = sessionEvent(session("child-b", { parentID: "root" }))

    assert.equal(needsRefresh(event, payload), true)
  })

  test("refreshes child panels when a descendant is created", () => {
    const payload = snapshot(session("child-a", { parentID: "root" }), ["child-a"])
    const event = sessionEvent(session("grandchild-a", { parentID: "child-a" }))

    assert.equal(needsRefresh(event, payload), true)
  })
})
