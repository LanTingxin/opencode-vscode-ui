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

  test("animates shell block expansion with a reduced-motion fallback", () => {
    const toolCss = readFileSync(resolve(process.cwd(), "src/panel/webview/tool.css"), "utf8")

    assert.match(toolCss, /\.oc-shellBlockBody\s*\{[\s\S]*grid-template-rows:\s*0fr;/)
    assert.match(toolCss, /\.oc-shellBlockBody\s*\{[\s\S]*transition:\s*grid-template-rows\s+160ms\s+ease,\s*opacity\s+160ms\s+ease;/)
    assert.match(toolCss, /\.oc-shellBlockBodyClip\s*\{[\s\S]*min-height:\s*0;/)
    assert.match(toolCss, /\.oc-shellBlockBodyClip\s*\{[\s\S]*overflow:\s*hidden;/)
    assert.match(toolCss, /\.oc-shellBlock\.is-expanded\s+\.oc-shellBlockBody\s*\{[\s\S]*grid-template-rows:\s*1fr;/)
    assert.match(toolCss, /\.oc-shellBlockToggleIcon\s*\{[\s\S]*transition:\s*transform\s+160ms\s+ease;/)
    assert.match(toolCss, /\.oc-shellBlock\.is-expanded\s+\.oc-shellBlockToggleIcon\s*\{[\s\S]*transform:\s*rotate\(180deg\);/)
    assert.match(toolCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.oc-shellBlockBody[\s\S]*transition:\s*none;/)
  })
})
