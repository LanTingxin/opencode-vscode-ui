import assert from "node:assert/strict"
import { describe, test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import type { SidebarViewState } from "../view-types"
import { buildSubagentOpenMessage, buildSubagentPanelView, SubagentsList, TodoList } from "./index"

describe("sidebar todo list", () => {
  test("does not render the session title under each todo item", () => {
    const state: SidebarViewState = {
      status: "ready",
      mode: "todo",
      sessionTitle: "Fujian milestones planning",
      todos: [
        {
          content: "Research and define the time period",
          status: "pending",
          priority: "medium",
        },
      ],
      diff: [],
      subagents: [],
    }

    const html = renderToStaticMarkup(<TodoList state={state} />)

    assert.equal(html.includes("Research and define the time period"), true)
    assert.equal(html.includes("Fujian milestones planning"), false)
  })

  test("renders subagents grouped into in progress and done", () => {
    const state: SidebarViewState = {
      status: "ready",
      mode: "subagents" as any,
      todos: [],
      diff: [],
      subagents: [
        { session: sessionInfo("child-a", 5, "Builder"), status: { type: "busy" }, activity: "webfetch: https://example.com" },
        { session: sessionInfo("child-b", 4, "Planner"), status: { type: "idle" }, activity: "1 tools · 3s" },
      ],
    } as any

    const html = renderToStaticMarkup(<SubagentsList state={state} />)

    assert.equal(html.includes("Builder"), true)
    assert.equal(html.includes("Planner"), true)
    assert.equal(html.includes("webfetch: https://example.com"), true)
    assert.equal(html.includes("1 tools · 3s"), true)
    assert.equal(html.includes("sv-taskSectionTitle"), false)
    assert.equal(html.includes(">done<"), false)
  })

  test("buildSubagentPanelView filters and orders subagents with in-progress items first", () => {
    const view = buildSubagentPanelView({
      filter: "all",
      subagents: [
        { session: sessionInfo("child-old", 2, "Older busy"), status: { type: "busy" } },
        { session: sessionInfo("child-new", 5, "Newer busy"), status: { type: "busy" } },
        { session: sessionInfo("done-old", 1, "Older done"), status: { type: "idle" } },
        { session: sessionInfo("done-new", 4, "Newer done"), status: { type: "idle" } },
      ],
    } as any)

    assert.equal(view.summary.total, 4)
    assert.equal(view.summary.inProgress, 2)
    assert.equal(view.summary.done, 2)
    assert.deepEqual(view.items.map((item) => item.session.id), ["child-new", "child-old", "done-new", "done-old"])
  })

  test("buildSubagentPanelView applies the done filter", () => {
    const view = buildSubagentPanelView({
      filter: "done",
      subagents: [
        { session: sessionInfo("child-busy", 2, "Busy"), status: { type: "busy" } },
        { session: sessionInfo("child-done", 3, "Done"), status: { type: "idle" } },
      ],
    } as any)

    assert.deepEqual(view.items.map((item) => item.session.id), ["child-done"])
  })

  test("buildSubagentOpenMessage reuses the openSession payload shape", () => {
    assert.deepEqual(buildSubagentOpenMessage({
      workspaceId: "ws-1",
      dir: "/workspace",
      sessionId: "root",
    }, "child-a"), {
      type: "openSession",
      workspaceId: "ws-1",
      dir: "/workspace",
      sessionId: "child-a",
    })
  })

  test("renders an empty subagents state", () => {
    const state: SidebarViewState = {
      status: "ready",
      mode: "subagents" as any,
      todos: [],
      diff: [],
      subagents: [],
    } as any

    const html = renderToStaticMarkup(<SubagentsList state={state} />)

    assert.equal(html.includes("No subagents yet"), true)
  })
})

function sessionInfo(id: string, updated: number, title = id) {
  return {
    id,
    directory: "/workspace",
    title,
    time: {
      created: updated,
      updated,
    },
  }
}
