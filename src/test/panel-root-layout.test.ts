import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, test } from "node:test"

describe("panel root layout", () => {
  test("lets every panel theme bleed to the edges while keeping default content inset inside the shell", () => {
    const baseCss = readFileSync(resolve(process.cwd(), "src/panel/webview/base.css"), "utf8")
    const layoutCss = readFileSync(resolve(process.cwd(), "src/panel/webview/layout.css"), "utf8")
    const themeCss = readFileSync(resolve(process.cwd(), "src/panel/webview/theme.css"), "utf8")

    assert.match(baseCss, /html,\s*body,\s*#root\s*\{[^}]*margin:\s*0;[^}]*height:\s*100%;/s)
    assert.doesNotMatch(baseCss, /html,\s*body,\s*#root\s*\{[^}]*padding:\s*0;/s)
    assert.match(layoutCss, /\.oc-shell\s*\{[\s\S]*width:\s*calc\(100%\s*\+\s*\(var\(--oc-webview-body-inset,\s*20px\)\s*\*\s*2\)\);[\s\S]*margin-inline:\s*calc\(var\(--oc-webview-body-inset,\s*20px\)\s*\*\s*-1\);/s)
    assert.match(themeCss, /body\.vscode-dark\s*\{[\s\S]*--oc-shell-gutter:\s*20px;/s)
    assert.match(themeCss, /body\.vscode-light\s*\{[\s\S]*--oc-shell-gutter:\s*20px;/s)
  })
})
