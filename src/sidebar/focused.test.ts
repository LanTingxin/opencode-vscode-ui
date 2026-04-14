import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { loadFocusedSessionState } from "./focused"

describe("focused session store", () => {
  test("focused-session load fetches workspace status and exposes branch and file summary alongside diff", async () => {
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
          file: {
            status: async () => ({
              data: [
                { path: "src/app.ts", added: 3, removed: 1, status: "modified" as const },
                { path: "src/new.ts", added: 5, removed: 0, status: "added" as const },
                { path: "src/old.ts", added: 0, removed: 2, status: "deleted" as const },
              ],
            }),
          },
        },
      } as any,
    })

    assert.equal(state.branch, "feature/auth")
    assert.equal(state.defaultBranch, "main")
    assert.equal(state.diff[0]?.file, "src/app.ts")
    assert.deepEqual(state.workspaceFileSummary, {
      added: 1,
      deleted: 1,
      modified: 1,
    })
    assert.equal(state.workspaceFileStatus.length, 3)
  })
})
