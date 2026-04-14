import assert from "node:assert/strict"
import { describe, test } from "node:test"

import type { SessionPanelRef } from "../bridge/types"
import { FocusedSessionStore, loadFocusedSessionState } from "./focused"

describe("focused session store", () => {
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
})

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}
