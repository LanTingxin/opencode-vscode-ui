import assert from "node:assert/strict"
import { describe, test } from "node:test"

import type { SessionPanelRef } from "../bridge/types"
import { syncTreeSelectionToActiveSession } from "../sidebar/tree-sync"

describe("sidebar tree selection sync", () => {
  test("reveals the active session when the sessions tree is visible", async () => {
    const reveals: Array<{
      item: unknown
      options?: { select?: boolean; focus?: boolean; expand?: boolean | number }
    }> = []
    const item = { id: "session-1" }

    const revealed = await syncTreeSelectionToActiveSession({
      ref: ref("session-1"),
      tree: {
        findSessionItem: () => item,
      },
      treeView: {
        visible: true,
        reveal: async (target, options) => {
          reveals.push({
            item: target,
            options,
          })
        },
      },
    })

    assert.equal(revealed, true)
    assert.deepEqual(reveals, [{
      item,
      options: {
        select: true,
        focus: false,
        expand: true,
      },
    }])
  })

  test("does not reveal the active session when the sessions tree is hidden", async () => {
    let revealCalls = 0

    const revealed = await syncTreeSelectionToActiveSession({
      ref: ref("session-1"),
      tree: {
        findSessionItem: () => ({ id: "session-1" }),
      },
      treeView: {
        visible: false,
        reveal: async () => {
          revealCalls += 1
        },
      },
    })

    assert.equal(revealed, false)
    assert.equal(revealCalls, 0)
  })
})

function ref(sessionId: string): SessionPanelRef {
  return {
    workspaceId: "ws-1",
    dir: "/workspace",
    sessionId,
  }
}
