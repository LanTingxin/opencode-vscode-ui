import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, test } from "node:test"

describe("panel output window", () => {
  test("keeps markdown code window bottom padding compact", () => {
    const markdownCss = readFileSync(resolve(process.cwd(), "src/panel/webview/markdown.css"), "utf8")

    const markdownCodeBodyRule = cssRule(markdownCss, ".oc-markdown .oc-outputWindow-markdownCode .oc-codeWindowBody")
    assert.match(markdownCodeBodyRule, /margin:\s*0;/)
    assert.match(markdownCodeBodyRule, /padding:\s*8px 10px 2px;/)
  })

  test("removes the inner markdown code body border in the classic theme", () => {
    const markdownCss = readFileSync(resolve(process.cwd(), "src/panel/webview/markdown.css"), "utf8")
    const rule = cssRule(markdownCss, '.oc-shell[data-oc-theme="classic"] .oc-outputWindow-markdownCode .oc-codeWindowBody')

    assert.match(rule, /border:\s*0;/)
    assert.match(rule, /border-radius:\s*0;/)
    assert.match(rule, /box-shadow:\s*none;/)
  })

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
