import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { composerMentions, composerText, deleteStructuredRange, emptyComposerParts, normalizeComposerParts, replaceRangeWithMention, replaceRangeWithText } from "./composer-editor"
import type { ComposerEditorPart } from "./state"

describe("composer editor parts", () => {
  test("normalizes adjacent text parts and positions", () => {
    const parts: ComposerEditorPart[] = [
      { type: "text", content: "hello", start: 0, end: 5 },
      { type: "text", content: " ", start: 5, end: 6 },
      { type: "agent", name: "helper", content: "@helper", start: 6, end: 13 },
    ]

    assert.deepEqual(normalizeComposerParts(parts), [
      { type: "text", content: "hello ", start: 0, end: 6 },
      { type: "agent", name: "helper", content: "@helper", start: 6, end: 13 },
    ])
  })

  test("replaces an @query range with an atomic mention plus trailing space", () => {
    const next = replaceRangeWithMention([{ type: "text", content: "open @he now", start: 0, end: 12 }], 5, 8, {
      type: "agent",
      name: "helper",
      content: "@helper",
    })

    assert.equal(composerText(next.parts), "open @helper  now")
    assert.deepEqual(composerMentions(next.parts), [{ type: "agent", name: "helper", content: "@helper", start: 5, end: 12 }])
    assert.equal(next.cursor, 13)
  })

  test("deletes an adjacent token atomically", () => {
    const parts: ComposerEditorPart[] = [
      { type: "text", content: "open ", start: 0, end: 5 },
      { type: "file", path: "src/app.ts", kind: "file", content: "@src/app.ts", start: 5, end: 16 },
      { type: "text", content: " now", start: 16, end: 20 },
    ]

    const next = deleteStructuredRange(parts, 16, 16, "Backspace")

    assert.ok(next)
    assert.equal(composerText(next?.parts ?? emptyComposerParts()), "open now")
    assert.deepEqual(composerMentions(next?.parts ?? emptyComposerParts()), [])
    assert.equal(next?.cursor, 5)
  })

  test("inserts plain text with normalized ranges", () => {
    const next = replaceRangeWithText([{ type: "text", content: "hello", start: 0, end: 5 }], 5, 5, "\nworld")

    assert.equal(composerText(next.parts), "hello\nworld")
    assert.deepEqual(next.parts, [{ type: "text", content: "hello\nworld", start: 0, end: 11 }])
  })
})
