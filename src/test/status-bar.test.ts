import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { deriveStatusBarState, pickPreferredRuntime } from "../core/status-bar"

describe("status bar", () => {
  test("prefers the active editor workspace runtime before other available runtimes", () => {
    const runtime = pickPreferredRuntime([
      { workspaceId: "ws-1", state: "starting" },
      { workspaceId: "ws-2", state: "ready" },
    ], "ws-2")

    assert.equal(runtime?.workspaceId, "ws-2")
  })

  test("shows busy active session state first", () => {
    const state = deriveStatusBarState({
      activeSessionTitle: "Review auth flow",
      activeSessionBusy: true,
      runtimeState: "ready",
    })

    assert.equal(state.text.includes("Review auth flow"), true)
    assert.equal(state.busy, true)
  })

  test("shows a starting state when no active session is available", () => {
    const state = deriveStatusBarState({
      runtimeState: "starting",
    })

    assert.equal(state.text.includes("starting"), true)
    assert.equal(state.command, "opencode-ui.statusBarAction")
  })

  test("falls back to quick session when there is no active panel", () => {
    const state = deriveStatusBarState({
      runtimeState: "ready",
    })

    assert.equal(state.command, "opencode-ui.statusBarAction")
  })
})
