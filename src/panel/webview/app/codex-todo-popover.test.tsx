import assert from "node:assert/strict"
import { describe, test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import type { Todo } from "../../../core/sdk"
import { CodexTodoPopover } from "./codex-todo-popover"

function todo(content: string, status: string, priority = "medium"): Todo {
  return { content, status, priority }
}

describe("CodexTodoPopover", () => {
  test("renders summary counts and todo items", () => {
    const html = renderToStaticMarkup(
      <CodexTodoPopover
        todos={[
          todo("Write tests", "completed"),
          todo("Implement popover", "in_progress"),
          todo("Verify compile", "pending"),
        ]}
      />,
    )

    assert.equal(html.includes("Collapse task list"), true)
    assert.equal(html.includes("ACTIVE TASKS"), true)
    assert.equal(html.includes("共 3 个任务，已经完成 1 个"), true)
    assert.equal(html.includes("Write tests"), true)
    assert.equal(html.includes("Implement popover"), true)
    assert.equal(html.includes("Verify compile"), true)
    assert.equal(html.includes("oc-codexTodoItem is-completed"), true)
    assert.equal(html.includes("oc-codexTodoItem is-in_progress"), true)
    assert.equal(html.includes("oc-codexTodoItem is-pending"), true)
  })

  test("renders a collapsed summary state with the active task preview", () => {
    const html = renderToStaticMarkup(
      <CodexTodoPopover
        todos={[
          todo("Write tests", "completed"),
          todo("Implement popover", "in_progress"),
          todo("Verify compile", "pending"),
        ]}
        collapsed
      />,
    )

    assert.equal(html.includes("oc-codexTodoPopover is-collapsed"), true)
    assert.equal(html.includes("Expand task list"), true)
    assert.equal(html.includes("Implement popover"), true)
    assert.equal(html.includes("oc-codexTodoList"), false)
  })

  test("renders nothing when there are no todos", () => {
    const html = renderToStaticMarkup(<CodexTodoPopover todos={[]} />)

    assert.equal(html, "")
  })
})
