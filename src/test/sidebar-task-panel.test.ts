import assert from "node:assert/strict"
import { describe, test } from "node:test"

import type { Todo } from "../core/sdk"
import { buildDiffPanelView, buildTaskOpenMessage, buildTaskPanelView } from "../sidebar/webview/index"

function todo(content: string, status: string, priority = "medium"): Todo {
  return {
    content,
    status,
    priority,
  }
}

describe("task panel view", () => {
  test("groups open tasks before completed tasks", () => {
    const view = buildTaskPanelView({
      todos: [
        todo("Done item", "completed"),
        todo("Active item", "in_progress"),
        todo("Queued item", "pending"),
      ],
    })

    assert.deepEqual(view.sections.map((section) => section.id), ["in_progress", "pending", "completed"])
  })

  test("counts open and completed tasks separately", () => {
    const view = buildTaskPanelView({
      todos: [
        todo("Done item", "completed"),
        todo("Queued item", "pending"),
      ],
    })

    assert.equal(view.summary.total, 2)
    assert.equal(view.summary.open, 1)
    assert.equal(view.summary.completed, 1)
    assert.equal(view.summary.inProgress, 0)
  })

  test("open filter hides completed tasks", () => {
    const view = buildTaskPanelView({
      filter: "open",
      todos: [
        todo("Done item", "completed"),
        todo("Queued item", "pending"),
      ],
    })

    assert.equal(view.sections.length, 1)
    assert.equal(view.sections[0]?.id, "pending")
    assert.equal(view.sections[0]?.items[0]?.content, "Queued item")
  })

  test("completed filter only shows completed tasks", () => {
    const view = buildTaskPanelView({
      filter: "completed",
      todos: [
        todo("Done item", "completed"),
        todo("Queued item", "pending"),
      ],
    })

    assert.equal(view.sections.length, 1)
    assert.equal(view.sections[0]?.id, "completed")
    assert.equal(view.sections[0]?.items[0]?.content, "Done item")
  })

  test("builds a session navigation message from the focused session ref", () => {
    const message = buildTaskOpenMessage({
      workspaceId: "ws-1",
      dir: "/workspace",
      sessionId: "root",
    })

    assert.deepEqual(message, {
      type: "openSession",
      workspaceId: "ws-1",
      dir: "/workspace",
      sessionId: "root",
    })
  })

  test("builds workspace summary metadata for the diff companion view", () => {
    const view = buildDiffPanelView({
      branch: "feature/auth",
      workspaceFileSummary: {
        added: 2,
        deleted: 1,
        modified: 3,
      },
      diff: [{
        file: "src/app.ts",
        patch: "@@",
        additions: 3,
        deletions: 1,
        status: "modified",
      }],
    })

    assert.equal(view.summary?.branch, "feature/auth")
    assert.equal(view.summary?.counts.added, 2)
    assert.equal(view.summary?.counts.deleted, 1)
    assert.equal(view.summary?.counts.modified, 3)
    assert.equal(view.items[0]?.file, "src/app.ts")
  })
})
