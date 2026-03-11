import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { describeComposerFileSelection, formatComposerFileContent, parseComposerFileQuery } from "./composer-file-selection"

describe("composer file selection", () => {
  test("parses a single-line suffix", () => {
    assert.deepEqual(parseComposerFileQuery("src/app.ts#12"), {
      baseQuery: "src/app.ts",
      selection: {
        startLine: 12,
        endLine: undefined,
      },
    })
  })

  test("parses a multi-line suffix", () => {
    assert.deepEqual(parseComposerFileQuery("src/app.ts#12-20"), {
      baseQuery: "src/app.ts",
      selection: {
        startLine: 12,
        endLine: 20,
      },
    })
  })

  test("drops invalid range text from the searchable query", () => {
    assert.deepEqual(parseComposerFileQuery("src/app.ts#nope"), {
      baseQuery: "src/app.ts",
    })
  })

  test("formats file mention content with a range", () => {
    assert.equal(formatComposerFileContent("src/app.ts", { startLine: 8, endLine: 12 }), "@src/app.ts#8-12")
    assert.equal(describeComposerFileSelection({ startLine: 8 }), "Selected line 8")
  })
})
