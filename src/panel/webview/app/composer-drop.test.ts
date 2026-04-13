import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { collectDroppedFilePaths, shouldHandleComposerFileDrop } from "./composer-drop"

describe("shouldHandleComposerFileDrop", () => {
  test("requires shift to accept a file drop into the composer", () => {
    assert.equal(shouldHandleComposerFileDrop({
      shiftKey: false,
      filePaths: ["src/app.ts"],
    }), false)

    assert.equal(shouldHandleComposerFileDrop({
      shiftKey: true,
      filePaths: ["src/app.ts"],
    }), true)
  })

  test("rejects empty drops even when shift is pressed", () => {
    assert.equal(shouldHandleComposerFileDrop({
      shiftKey: true,
      filePaths: [],
    }), false)
  })
})

describe("collectDroppedFilePaths", () => {
  test("collects multiple files from a uri list drop", () => {
    const paths = collectDroppedFilePaths(fakeDropData({
      "text/uri-list": "file:///workspace/src/a.ts\nfile:///workspace/src/b.ts",
    }), "/workspace")

    assert.deepEqual(paths, ["src/a.ts", "src/b.ts"])
  })

  test("collects multiple files from newline-separated plain text", () => {
    const paths = collectDroppedFilePaths(fakeDropData({
      "text/plain": "/workspace/src/a.ts\n/workspace/src/b.ts",
    }), "/workspace")

    assert.deepEqual(paths, ["src/a.ts", "src/b.ts"])
  })

  test("collects editor-tab style JSON resources", () => {
    const paths = collectDroppedFilePaths(fakeDropData({
      "application/vnd.code.editors": JSON.stringify([
        { resource: "file:///workspace/src/App.css" },
        { resource: "file:///workspace/index.html" },
      ]),
    }), "/workspace")

    assert.deepEqual(paths, ["src/App.css", "index.html"])
  })
})

function fakeDropData(values: Record<string, string>) {
  return {
    files: [],
    items: [],
    types: Object.keys(values),
    getData(type: string) {
      return values[type] ?? ""
    },
  } as unknown as DataTransfer
}
