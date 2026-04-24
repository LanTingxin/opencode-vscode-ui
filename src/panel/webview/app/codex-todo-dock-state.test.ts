import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { nextCodexTodoDockState, type CodexTodoDockState } from "./codex-todo-dock-state"

describe("nextCodexTodoDockState", () => {
  test("keeps the same state object when an already visible active dock receives another todo snapshot", () => {
    const current: CodexTodoDockState = { visible: true, closing: false, opening: false }

    const next = nextCodexTodoDockState(current, {
      hasTodos: true,
      complete: false,
      theme: "codex",
    })

    assert.equal(next, current)
  })

  test("opens the dock only when active todos first become visible", () => {
    const next = nextCodexTodoDockState({ visible: false, closing: false, opening: false }, {
      hasTodos: true,
      complete: false,
      theme: "codex",
    })

    assert.deepEqual(next, { visible: true, closing: false, opening: true })
  })

  test("keeps the dock hidden when a restored session only has completed todos", () => {
    const current: CodexTodoDockState = { visible: false, closing: false, opening: false }

    const next = nextCodexTodoDockState(current, {
      hasTodos: true,
      complete: true,
      theme: "codex",
    })

    assert.equal(next, current)
  })
})
