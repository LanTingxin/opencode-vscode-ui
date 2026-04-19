import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { buildComposerMenuItems } from "./composer-menu"
import { createInitialState } from "./state"

describe("buildComposerMenuItems", () => {
  test("includes a local slash action for new session", () => {
    const state = createInitialState({
      workspaceId: "file:///workspace",
      dir: "/workspace",
      sessionId: "session-1",
    })

    const items = buildComposerMenuItems(state, [])
    const newItem = items.find((item) => item.trigger === "slash" && item.label === "new")

    assert.ok(newItem)
    assert.equal(newItem?.kind, "action")
  })

  test("includes a local slash action for skills", () => {
    const state = createInitialState({
      workspaceId: "file:///workspace",
      dir: "/workspace",
      sessionId: "session-1",
    })

    const items = buildComposerMenuItems(state, [])
    const skillsItem = items.find((item) => item.trigger === "slash" && item.label === "skills")

    assert.ok(skillsItem)
    assert.equal(skillsItem?.kind, "action")
  })

  test("includes a local slash action for theme", () => {
    const state = createInitialState({
      workspaceId: "file:///workspace",
      dir: "/workspace",
      sessionId: "session-1",
    })

    const items = buildComposerMenuItems(state, [])
    const themeItem = items.find((item) => item.trigger === "slash" && item.label === "theme")

    assert.ok(themeItem)
    assert.equal(themeItem?.kind, "action")
  })
})
