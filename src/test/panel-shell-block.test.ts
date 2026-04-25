import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, test } from "node:test"

describe("panel shell block", () => {
  test("wraps long shell command lines instead of requiring horizontal scrolling", () => {
    const toolCss = readFileSync(resolve(process.cwd(), "src/panel/webview/tool.css"), "utf8")

    assert.match(toolCss, /\.oc-shellBlockContent\s*\{[\s\S]*white-space:\s*pre-wrap;/)
    assert.match(toolCss, /\.oc-shellBlockContent\s*\{[\s\S]*overflow-wrap:\s*anywhere;/)
    assert.match(toolCss, /\.oc-shellBlockContent\s*\{[\s\S]*word-break:\s*break-word;/)
    assert.doesNotMatch(toolCss, /\.oc-shellBlockContent\s*\{[\s\S]*overflow-x:\s*auto;/)
  })
})
