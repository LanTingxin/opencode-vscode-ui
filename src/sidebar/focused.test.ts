import assert from "node:assert/strict"
import { describe, test } from "node:test"

import type { SessionPanelRef } from "../bridge/types"
import type { SessionEvent } from "../core/sdk"
import { FocusedSessionStore, loadFocusedSessionState } from "./focused"

describe("focused session store", () => {
  test("loads direct child subagents only for a focused root session", async () => {
    const state = await loadFocusedSessionState({
      ref: {
        workspaceId: "ws-1",
        dir: "/workspace",
        sessionId: "root",
      },
      runtime: {
        dir: "/workspace",
        sdk: {
          session: {
            get: async ({ sessionID }: { sessionID: string }) => ({
              data: sessionInfo(sessionID, sessionID === "root" ? undefined : sessionID === "grandchild-a" ? "child-a" : "root"),
            }),
            todo: async () => ({ data: [] }),
            diff: async () => ({ data: [] }),
            messages: async ({ sessionID }: { sessionID: string }) => ({
              data: sessionID === "child-a"
                ? [
                    userMessage("child-a", "user-1", 1),
                    assistantMessage("child-a", "assistant-1", 2, undefined, [
                      runningTool("child-a", "assistant-1", "tool-1", "webfetch", "https://example.com"),
                    ]),
                  ]
                : sessionID === "child-b"
                  ? [
                      userMessage("child-b", "user-2", 10_000),
                      assistantMessage("child-b", "assistant-2", 11_000, 13_000, [
                        completedTool("child-b", "assistant-2", "tool-2", "read", "README.md"),
                      ]),
                    ]
                  : [],
            }),
            children: async ({ sessionID }: { sessionID: string }) => ({
              data: sessionID === "root"
                ? [sessionInfo("child-a", "root", 5), sessionInfo("child-b", "root", 4)]
                : sessionID === "child-a"
                  ? [sessionInfo("grandchild-a", "child-a", 3)]
                  : [],
            }),
            status: async () => ({
              data: {
                "child-a": { type: "busy" as const },
                "child-b": { type: "idle" as const },
                "grandchild-a": { type: "retry" as const, attempt: 1, message: "retry", next: 42 },
              },
            }),
          },
          vcs: {
            get: async () => ({
              data: {
                branch: "feature/subagents",
                default_branch: "main",
              },
            }),
          },
        },
      } as any,
    })

    assert.deepEqual(state.subagents.map((item) => item.session.id), ["child-a", "child-b"])
    assert.equal(state.subagents[0]?.status.type, "busy")
    assert.equal(state.subagents[0]?.activity, "webfetch: https://example.com")
    assert.equal(state.subagents[1]?.status.type, "idle")
    assert.equal(state.subagents[1]?.activity, "1 tools · 3s")
  })

  test("scopes loaded subagents to the focused session direct children only", async () => {
    const state = await loadFocusedSessionState({
      ref: {
        workspaceId: "ws-1",
        dir: "/workspace",
        sessionId: "child-a",
      },
      runtime: {
        dir: "/workspace",
        sdk: {
          session: {
            get: async ({ sessionID }: { sessionID: string }) => ({
              data: sessionInfo(sessionID, sessionID === "child-a" ? "root" : "child-a"),
            }),
            todo: async () => ({ data: [] }),
            diff: async () => ({ data: [] }),
            children: async ({ sessionID }: { sessionID: string }) => ({
              data: sessionID === "child-a"
                ? [sessionInfo("grandchild-a", "child-a", 5)]
                : sessionID === "grandchild-a"
                  ? [sessionInfo("great-grandchild-a", "grandchild-a", 4)]
                  : [],
            }),
            status: async () => ({
              data: {
                "grandchild-a": { type: "busy" as const },
                "great-grandchild-a": { type: "idle" as const },
                sibling: { type: "busy" as const },
              },
            }),
          },
          vcs: {
            get: async () => ({
              data: {
                branch: "feature/subagents",
                default_branch: "main",
              },
            }),
          },
        },
      } as any,
    })

    assert.deepEqual(state.subagents.map((item) => item.session.id), ["grandchild-a"])
  })

  test("focused-session load uses the selected session diff only", async () => {
    const diffCalls: Array<{ messageID?: string }> = []
    const state = await loadFocusedSessionState({
      ref: {
        workspaceId: "ws-1",
        dir: "/workspace",
        sessionId: "session-1",
      },
      runtime: {
        dir: "/workspace",
        sdk: {
          session: {
            get: async () => ({
              data: {
                id: "session-1",
                directory: "/workspace",
                title: "Focused session",
                time: { created: 1, updated: 1 },
              },
            }),
            todo: async () => ({ data: [] }),
            messages: async () => ({
              data: [
                {
                  info: {
                    id: "m-user-1",
                    sessionID: "session-1",
                    role: "user",
                    time: { created: 1 },
                  },
                  parts: [],
                },
                {
                  info: {
                    id: "m-assistant-1",
                    sessionID: "session-1",
                    role: "assistant",
                    time: { created: 2 },
                  },
                  parts: [],
                },
                {
                  info: {
                    id: "m-user-2",
                    sessionID: "session-1",
                    role: "user",
                    time: { created: 3 },
                  },
                  parts: [],
                },
              ],
            }),
            diff: async ({ messageID }: { messageID?: string }) => {
              diffCalls.push({ messageID })
              return {
                data: [
                  {
                    file: "src/current.ts",
                    patch: "@@",
                    additions: 4,
                    deletions: 1,
                    status: "modified" as const,
                  },
                ],
              }
            },
          },
          vcs: {
            get: async () => ({
              data: [
                {
                  branch: "feature/auth",
                  default_branch: "main",
                },
              ][0],
            }),
          },
        },
      } as any,
    })

    assert.equal(state.branch, "feature/auth")
    assert.equal(state.defaultBranch, "main")
    assert.deepEqual(diffCalls, [{ messageID: undefined }])
    assert.deepEqual(state.diff.map((item) => item.file), ["src/current.ts"])
    assert.deepEqual(state.diff[0], {
      file: "src/current.ts",
      patch: "@@",
      additions: 4,
      deletions: 1,
      status: "modified",
    })
    assert.equal("workspaceFileSummary" in state, false)
  })

  test("keeps the selected session loaded when the active panel session clears", async () => {
    const ref: SessionPanelRef = {
      workspaceId: "ws-1",
      dir: "/workspace",
      sessionId: "session-1",
    }

    let activeListener: ((ref?: SessionPanelRef) => void) | undefined
    const store = new FocusedSessionStore(
      {
        get: () => ({
          state: "ready",
          dir: "/workspace",
          sdk: {
            session: {
              get: async () => ({
                data: {
                  id: "session-1",
                  directory: "/workspace",
                  title: "Focused session",
                  time: { created: 1, updated: 1 },
                },
              }),
              todo: async () => ({
                data: [{ content: "Review file", status: "pending", priority: "medium" }],
              }),
              messages: async () => ({
                data: [{
                  info: {
                    id: "m-user-1",
                    sessionID: "session-1",
                    role: "user",
                    time: { created: 1 },
                  },
                  parts: [],
                }],
              }),
              diff: async () => ({
                data: [{
                  file: "src/app.ts",
                  patch: "@@",
                  additions: 3,
                  deletions: 1,
                  status: "modified" as const,
                }],
              }),
            },
            vcs: {
              get: async () => ({
                data: {
                  branch: "feature/auth",
                  default_branch: "main",
                },
              }),
            },
          },
        }),
        onDidChange: () => ({ dispose() {} }),
      } as any,
      {
        activeSession: () => undefined,
        onDidChangeActiveSession(listener: (value?: SessionPanelRef) => void) {
          activeListener = listener
          return { dispose() {} }
        },
      } as any,
      {
        onDidEvent: () => ({ dispose() {} }),
      } as any,
      {
        appendLine() {},
      } as any,
    )

    store.selectSession(ref)
    await settle()

    assert.equal(store.snapshot().status, "ready")
    assert.equal(store.snapshot().ref?.sessionId, "session-1")
    assert.equal(store.snapshot().todos.length, 1)
    assert.equal(store.snapshot().diff.length, 1)

    activeListener?.(undefined)

    assert.equal(store.snapshot().status, "ready")
    assert.equal(store.snapshot().ref?.sessionId, "session-1")
    assert.equal(store.snapshot().todos.length, 1)
    assert.equal(store.snapshot().diff.length, 1)
  })

  test("preserves the current focused session for the next active child opened from subagents", async () => {
    const ref: SessionPanelRef = {
      workspaceId: "ws-1",
      dir: "/workspace",
      sessionId: "root",
    }
    const childRef: SessionPanelRef = {
      workspaceId: "ws-1",
      dir: "/workspace",
      sessionId: "child-a",
    }

    let activeListener: ((ref?: SessionPanelRef) => void) | undefined
    const store = new FocusedSessionStore(
      {
        get: () => ({
          state: "ready",
          dir: "/workspace",
          sdk: {
            session: {
              get: async ({ sessionID }: { sessionID: string }) => ({
                data: sessionInfo(sessionID, sessionID === "root" ? undefined : "root"),
              }),
              todo: async () => ({ data: [] }),
              diff: async () => ({ data: [] }),
              children: async ({ sessionID }: { sessionID: string }) => ({
                data: sessionID === "root" ? [sessionInfo("child-a", "root", 2)] : [],
              }),
              status: async () => ({ data: { "child-a": { type: "busy" as const } } }),
            },
            vcs: {
              get: async () => ({
                data: {
                  branch: "feature/subagents",
                  default_branch: "main",
                },
              }),
            },
          },
        }),
        onDidChange: () => ({ dispose() {} }),
      } as any,
      {
        activeSession: () => undefined,
        onDidChangeActiveSession(listener: (value?: SessionPanelRef) => void) {
          activeListener = listener
          return { dispose() {} }
        },
      } as any,
      {
        onDidEvent: () => ({ dispose() {} }),
      } as any,
      {
        appendLine() {},
      } as any,
    )

    store.selectSession(ref)
    await settle()

    store.preserveFocusForNextActive(childRef)
    activeListener?.(childRef)
    await settle()

    assert.equal(store.snapshot().ref?.sessionId, "root")
    assert.deepEqual(store.snapshot().subagents.map((item) => item.session.id), ["child-a"])
  })

  test("updates subagent status from session.status events", async () => {
    const harness = createFocusedStoreHarness()

    harness.store.selectSession(harness.ref)
    await settle()

    assert.equal(harness.store.snapshot().subagents[0]?.status.type, "busy")

    harness.emit({
      type: "session.status",
      properties: {
        sessionID: "child-a",
        status: { type: "idle" },
      },
    })
    await settle()

    assert.equal(harness.store.snapshot().subagents[0]?.status.type, "idle")
  })

  test("updates subagent activity from child message events", async () => {
    const harness = createFocusedStoreHarness()

    harness.store.selectSession(harness.ref)
    await settle()

    assert.equal(harness.store.snapshot().subagents[0]?.activity, "")

    harness.emit({
      type: "message.updated",
      properties: {
        info: {
          id: "assistant-1",
          sessionID: "child-a",
          role: "assistant",
          time: { created: 2 },
        },
      },
    })
    harness.emit({
      type: "message.part.updated",
      properties: {
        part: runningTool("child-a", "assistant-1", "tool-1", "webfetch", "https://example.com"),
      },
    })
    await settle()

    assert.equal(harness.store.snapshot().subagents[0]?.activity, "webfetch: https://example.com")
  })

  test("adds and removes descendant child sessions incrementally", async () => {
    const harness = createFocusedStoreHarness()

    harness.store.selectSession(harness.ref)
    await settle()

    assert.deepEqual(harness.store.snapshot().subagents.map((item) => item.session.id), ["child-a"])

    harness.emit({
      type: "session.created",
      properties: {
        info: sessionInfo("grandchild-a", "child-a", 3),
      },
    })
    await settle()

    assert.deepEqual(harness.store.snapshot().subagents.map((item) => item.session.id), ["child-a"])

    harness.emit({
      type: "session.deleted",
      properties: {
        info: sessionInfo("child-a", "root", 4),
      },
    })
    await settle()

    assert.deepEqual(harness.store.snapshot().subagents, [])
  })

  test("removes archived child sessions after session.updated events", async () => {
    const harness = createFocusedStoreHarness()

    harness.store.selectSession(harness.ref)
    await settle()

    harness.emit({
      type: "session.updated",
      properties: {
        info: {
          ...sessionInfo("child-a", "root", 5),
          time: {
            created: 1,
            updated: 5,
            archived: 5,
          },
        },
      },
    })
    await settle()

    assert.deepEqual(harness.store.snapshot().subagents, [])
  })
})

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function sessionInfo(id: string, parentID?: string, updated = 1) {
  return {
    id,
    directory: "/workspace",
    title: id,
    parentID,
    time: {
      created: updated,
      updated,
    },
  }
}

function createFocusedStoreHarness() {
  const ref: SessionPanelRef = {
    workspaceId: "ws-1",
    dir: "/workspace",
    sessionId: "root",
  }

  let eventListener: ((item: { workspaceId: string; event: SessionEvent }) => void) | undefined
  const store = new FocusedSessionStore(
    {
      get: () => ({
        state: "ready",
        dir: "/workspace",
        sdk: {
          session: {
            get: async ({ sessionID }: { sessionID: string }) => ({
              data: sessionInfo(sessionID, sessionID === "root" ? undefined : "root"),
            }),
            todo: async () => ({ data: [] }),
            diff: async () => ({ data: [] }),
            messages: async () => ({
              data: [],
            }),
            children: async ({ sessionID }: { sessionID: string }) => ({
              data: sessionID === "root" ? [sessionInfo("child-a", "root", 2)] : [],
            }),
            status: async () => ({
              data: {
                "child-a": { type: "busy" as const },
              },
            }),
          },
          vcs: {
            get: async () => ({
              data: {
                branch: "feature/subagents",
                default_branch: "main",
              },
            }),
          },
        },
      }),
      onDidChange: () => ({ dispose() {} }),
    } as any,
    {
      activeSession: () => undefined,
      onDidChangeActiveSession: () => ({ dispose() {} }),
    } as any,
    {
      onDidEvent(listener: (item: { workspaceId: string; event: SessionEvent }) => void) {
        eventListener = listener
        return { dispose() {} }
      },
    } as any,
    {
      appendLine() {},
    } as any,
  )

  return {
    ref,
    store,
    emit(event: SessionEvent) {
      eventListener?.({
        workspaceId: "ws-1",
        event,
      })
    },
  }
}

function userMessage(sessionID: string, id: string, created: number) {
  return {
    info: {
      id,
      sessionID,
      role: "user" as const,
      time: { created },
    },
    parts: [],
  }
}

function assistantMessage(sessionID: string, id: string, created: number, completed?: number, parts: Array<ReturnType<typeof runningTool> | ReturnType<typeof completedTool>> = []) {
  return {
    info: {
      id,
      sessionID,
      role: "assistant" as const,
      time: completed === undefined ? { created } : { created, completed },
    },
    parts,
  }
}

function runningTool(sessionID: string, messageID: string, id: string, tool: string, title: string) {
  return {
    id,
    sessionID,
    messageID,
    type: "tool" as const,
    tool,
    state: {
      status: "running" as const,
      input: {},
      title,
      time: {
        start: 1,
      },
    },
  }
}

function completedTool(sessionID: string, messageID: string, id: string, tool: string, title: string) {
  return {
    id,
    sessionID,
    messageID,
    type: "tool" as const,
    tool,
    state: {
      status: "completed" as const,
      input: {},
      output: "",
      title,
      metadata: {},
      time: {
        start: 1,
        end: 2,
      },
    },
  }
}
