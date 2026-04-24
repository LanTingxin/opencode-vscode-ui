import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, test } from "node:test"

describe("panel composer layout styles", () => {
  test("preserves the composer body bottom corners under the metadata row", () => {
    const css = readFileSync(resolve(process.cwd(), "src/panel/webview/status.css"), "utf8")

    assert.match(css, /\.oc-composerInfoWrap\s*\{[\s\S]*inset:\s*auto 1px 1px 1px;/)
    assert.match(css, /\.oc-composerInfo\s*\{[\s\S]*border-bottom-left-radius:\s*calc\(var\(--oc-radius-md\) - 1px\);/)
    assert.match(css, /\.oc-composerInfo\s*\{[\s\S]*border-bottom-right-radius:\s*calc\(var\(--oc-radius-md\) - 1px\);/)
    assert.match(css, /\.oc-shell\[data-oc-theme="claude"\]\s+\.oc-composerInfo\s*\{[\s\S]*border-bottom-left-radius:\s*calc\(var\(--oc-radius-md\) \+ 3px\);/)
    assert.match(css, /\.oc-shell\[data-oc-theme="claude"\]\s+\.oc-composerInfo\s*\{[\s\S]*border-bottom-right-radius:\s*calc\(var\(--oc-radius-md\) \+ 3px\);/)
    assert.match(css, /\.oc-shell\[data-oc-theme="codex"\]\s+\.oc-composerInfo\s*\{[\s\S]*border-bottom-left-radius:\s*calc\(var\(--oc-radius-md\) \+ 5px\);/)
    assert.match(css, /\.oc-shell\[data-oc-theme="codex"\]\s+\.oc-composerInfo\s*\{[\s\S]*border-bottom-right-radius:\s*calc\(var\(--oc-radius-md\) \+ 5px\);/)
  })
})
