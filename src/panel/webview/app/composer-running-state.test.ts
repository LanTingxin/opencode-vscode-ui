import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { composerRunningState } from "./composer-running-state"

describe("composerRunningState", () => {
  test("maps a busy session to the default thinking interrupt state", () => {
    assert.deepEqual(composerRunningState({ type: "busy" }, false), {
      label: "Thinking",
      hint: "Esc to interrupt",
      tone: "running",
      icon: "stop",
      title: "Interrupt running session",
      ariaLabel: "Interrupt running session",
    })
  })

  test("maps a retry session to a retrying status strip", () => {
    assert.deepEqual(composerRunningState({ type: "retry", attempt: 2, message: "Waiting to retry", next: Date.now() }, false), {
      label: "Retrying",
      hint: "Esc to interrupt",
      tone: "retry",
      icon: "stop",
      title: "Interrupt running session",
      ariaLabel: "Interrupt running session",
    })
  })

  test("arms the interrupt confirmation after the first escape press", () => {
    assert.deepEqual(composerRunningState({ type: "busy" }, true), {
      label: "Thinking",
      hint: "Press Esc again to interrupt",
      tone: "armed",
      icon: "stop-confirm",
      title: "Press again to interrupt",
      ariaLabel: "Interrupt running session now",
    })
  })

  test("returns nothing when the session is idle", () => {
    assert.equal(composerRunningState({ type: "idle" }, false), undefined)
  })
})
