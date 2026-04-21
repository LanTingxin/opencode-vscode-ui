import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { resolveTranscriptHistoryMode, shouldAutoLoadEarlierMessages } from "./transcript-history"

describe("transcript history helpers", () => {
  test("prefers rendering already-loaded messages before requesting more history", () => {
    assert.equal(resolveTranscriptHistoryMode({
      renderedCount: 120,
      loadedCount: 240,
      hasEarlier: true,
    }), "render")
  })

  test("requests more history only after loaded messages are fully rendered", () => {
    assert.equal(resolveTranscriptHistoryMode({
      renderedCount: 240,
      loadedCount: 240,
      hasEarlier: true,
    }), "load")
  })

  test("stays idle when there is no earlier history left", () => {
    assert.equal(resolveTranscriptHistoryMode({
      renderedCount: 240,
      loadedCount: 240,
      hasEarlier: false,
    }), "idle")
  })

  test("auto loading only triggers near the top edge when work remains", () => {
    assert.equal(shouldAutoLoadEarlierMessages({
      scrollTop: 12,
      threshold: 24,
      mode: "render",
      loading: false,
      armed: true,
    }), true)

    assert.equal(shouldAutoLoadEarlierMessages({
      scrollTop: 36,
      threshold: 24,
      mode: "render",
      loading: false,
      armed: true,
    }), false)

    assert.equal(shouldAutoLoadEarlierMessages({
      scrollTop: 12,
      threshold: 24,
      mode: "idle",
      loading: false,
      armed: true,
    }), false)

    assert.equal(shouldAutoLoadEarlierMessages({
      scrollTop: 12,
      threshold: 24,
      mode: "load",
      loading: true,
      armed: true,
    }), false)

    assert.equal(shouldAutoLoadEarlierMessages({
      scrollTop: 12,
      threshold: 24,
      mode: "load",
      loading: false,
      armed: false,
    }), false)
  })
})
