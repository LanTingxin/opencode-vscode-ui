import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, test } from "node:test"

describe("panel output window", () => {
  test("animates file output expansion with a reduced-motion fallback", () => {
    const toolCss = readFileSync(resolve(process.cwd(), "src/panel/webview/tool.css"), "utf8")
    const outputWindowSource = readFileSync(resolve(process.cwd(), "src/panel/webview/renderers/OutputWindow.tsx"), "utf8")

    assert.match(cssRule(toolCss, ".oc-outputWindowBody.is-collapsible"), /transition:\s*max-height\s+180ms\s+ease,\s*opacity\s+160ms\s+ease;/)
    assert.match(cssRule(toolCss, ".oc-outputWindowBody.is-expanded"), /max-height:\s*var\(--oc-outputWindow-body-expanded-height\);/)
    assert.match(cssRule(toolCss, ".oc-outputWindowToggleIcon"), /transition:\s*transform\s+160ms\s+ease;/)
    assert.match(cssRule(toolCss, ".oc-outputWindowToggle[aria-expanded=\"true\"] .oc-outputWindowToggleIcon"), /transform:\s*rotate\(180deg\);/)
    assert.match(toolCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.oc-outputWindowBody\.is-collapsible[\s\S]*transition:\s*none;/)
    assert.match(outputWindowSource, /--oc-outputWindow-body-expanded-height/)
    assert.doesNotMatch(outputWindowSource, /expanded\s*\?\s*<path/)
  })
})

function cssRule(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))
  assert.ok(match, `missing CSS rule for ${selector}`)
  return match[1] || ""
}
