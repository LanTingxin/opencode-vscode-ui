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
})
