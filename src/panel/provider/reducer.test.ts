import assert from "node:assert/strict"
import { describe, test } from "node:test"

import type { SessionSnapshot } from "../../bridge/types"
import { needsRefresh } from "./reducer"

function snapshot(parentID?: string): SessionSnapshot {
  return {
    status: "ready",
    workspaceName: "workspace",
    sessionRef: { workspaceId: "file:///workspace", dir: "/workspace", sessionId: parentID ? "child" : "root" },
    session: {
      id: parentID ? "child" : "root",
      directory: "/workspace",
      parentID,
      title: parentID ? "child" : "root",
      time: { created: 1, updated: 1 },
    },
    message: "ready",
    display: {
      showInternals: false,
      showThinking: true,
      diffMode: "unified",
      panelTheme: "default",
    },
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
    relatedSessionIds: parentID ? ["child"] : ["root", "child"],
    agentMode: "build",
    navigation: {},
  }
}

describe("needsRefresh session tree events", () => {
  test("root panel does not refresh for child session changes", () => {
    assert.equal(needsRefresh({
      type: "session.created",
      properties: { info: { id: "child", parentID: "root" } },
    } as never, snapshot()), false)
    assert.equal(needsRefresh({
      type: "session.updated",
      properties: { info: { id: "child", parentID: "root" } },
    } as never, snapshot()), false)
    assert.equal(needsRefresh({
      type: "session.deleted",
      properties: { info: { id: "child" } },
    } as never, snapshot()), false)
    assert.equal(needsRefresh({
      type: "session.updated",
      properties: { info: { id: "outside", parentID: "root" } },
    } as never, snapshot()), true)
  })

  test("child panel still refreshes for sibling and parent tree changes", () => {
    assert.equal(needsRefresh({
      type: "session.created",
      properties: { info: { id: "sibling", parentID: "root" } },
    } as never, snapshot("root")), true)
    assert.equal(needsRefresh({
      type: "session.created",
      properties: { info: { id: "grandchild", parentID: "child" } },
    } as never, {
      ...snapshot("root"),
      relatedSessionIds: ["child", "grandchild-parent"],
    }), true)
    assert.equal(needsRefresh({
      type: "session.updated",
      properties: { info: { id: "root" } },
    } as never, snapshot("root")), true)
    assert.equal(needsRefresh({
      type: "session.updated",
      properties: { info: { id: "grandchild", parentID: "grandchild-parent" } },
    } as never, {
      ...snapshot("root"),
      relatedSessionIds: ["child", "grandchild-parent"],
    }), true)
    assert.equal(needsRefresh({
      type: "session.deleted",
      properties: { info: { id: "sibling", parentID: "root" } },
    } as never, snapshot("root")), true)
  })
})
