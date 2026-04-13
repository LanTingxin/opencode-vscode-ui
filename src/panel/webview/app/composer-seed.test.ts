import assert from "node:assert/strict"
import { describe, test } from "node:test"

import type { ComposerPromptPart } from "../../../bridge/types"
import { composerMentions, composerText } from "./composer-editor"
import { mergeRestoredComposerParts, promptPartsToComposerParts } from "./composer-seed"

describe("mergeRestoredComposerParts", () => {
  test("appends unique ask-about file mentions instead of replacing the current draft", () => {
    const current = promptPartsToComposerParts([
      filePart("src/a.ts"),
      { type: "text", text: "please review" },
    ])

    const next = mergeRestoredComposerParts(current, [
      filePart("src/a.ts"),
      filePart("src/b.ts"),
    ])

    assert.equal(composerText(next), "@src/a.ts please review @src/b.ts ")
    assert.deepEqual(composerMentions(next).filter((item) => item.type === "file").map((item) => item.path), ["src/a.ts", "src/b.ts"])
  })

  test("replaces the composer when restoring plain text only", () => {
    const current = promptPartsToComposerParts([
      filePart("src/a.ts"),
      { type: "text", text: "keep me" },
    ])

    const next = mergeRestoredComposerParts(current, [{
      type: "text",
      text: "echo hello",
    }])

    assert.equal(composerText(next), "echo hello")
    assert.deepEqual(composerMentions(next), [])
  })
})

function filePart(path: string): Extract<ComposerPromptPart, { type: "file" }> {
  return {
    type: "file",
    path,
    kind: "file",
    source: {
      value: `@${path}`,
      start: 0,
      end: path.length + 1,
    },
  }
}
