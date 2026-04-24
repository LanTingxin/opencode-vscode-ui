import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { isTimelineNearBottom, scrollTimelineToBottom } from "./useTimelineScroll"

describe("timeline scroll helpers", () => {
  test("detects when the transcript is away from the bottom", () => {
    assert.equal(isTimelineNearBottom({
      scrollHeight: 1000,
      scrollTop: 600,
      clientHeight: 300,
    }, 24), false)

    assert.equal(isTimelineNearBottom({
      scrollHeight: 1000,
      scrollTop: 676,
      clientHeight: 300,
    }, 24), true)
  })

  test("scrolls the transcript to the bottom", () => {
    let scrolled: ScrollToOptions | undefined
    const node = {
      scrollHeight: 1000,
      scrollTop: 200,
      scrollTo(options: ScrollToOptions) {
        scrolled = options
      },
    }

    scrollTimelineToBottom(node)

    assert.deepEqual(scrolled, { top: 1000, behavior: "smooth" })
  })
})
