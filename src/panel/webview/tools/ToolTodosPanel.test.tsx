import assert from "node:assert/strict"
import { describe, test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ToolTodosPanel } from "./ToolTodosPanel"
import type { ToolDetails, ToolPart } from "./types"

function todoPart(): ToolPart {
  return {
    id: "part-1",
    sessionID: "session-1",
    messageID: "message-1",
    type: "tool",
    tool: "todowrite",
    callID: "call-1",
    state: {
      status: "completed",
    },
  }
}

function renderPanel() {
  return renderToStaticMarkup(
    <ToolTodosPanel
      ToolStatus={({ state }) => state ? <span>{state}</span> : null}
      part={todoPart()}
      todoMarker={(status) => status === "completed" ? "[x]" : "[ ]"}
      toolDetails={() => ({ title: "Todo", subtitle: "2 todos", args: [] }) satisfies ToolDetails}
      toolTodos={() => [
        { content: "Review workspace runtime", status: "completed" },
        { content: "Check panel layout", status: "pending" },
      ]}
    />,
  )
}

describe("ToolTodosPanel", () => {
  test("renders todo panels collapsed by default with an expand toggle", () => {
    const html = renderPanel()

    assert.equal(html.includes('class="oc-toolTodoToggle"'), true)
    assert.equal(html.includes('aria-expanded="false"'), true)
    assert.equal(html.includes("Expand todo list"), true)
    assert.equal(html.includes("Review workspace runtime"), false)
    assert.equal(html.includes("Check panel layout"), false)
  })
})
