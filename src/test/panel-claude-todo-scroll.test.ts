import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, test } from "node:test"

describe("claude todo panel scrolling", () => {
  test("keeps collapsed todo headers compact in the classic theme", () => {
    const toolCss = readFileSync(resolve(process.cwd(), "src/panel/webview/tool.css"), "utf8")

    assert.match(cssRuleExact(toolCss, ".oc-toolPanel-todos"), /padding:\s*0;/)
    assert.match(cssRuleExact(toolCss, ".oc-toolPanel-todos .oc-toolTodoHeader"), /height:\s*40px;/)
    assert.match(cssRuleExact(toolCss, ".oc-toolPanel-todos .oc-toolTodoHeader"), /padding:\s*0\s+10px;/)
    assert.match(cssRuleExact(toolCss, ".oc-toolPanel-todos .oc-toolTodoHeader"), /align-items:\s*center;/)
    assert.match(cssRuleExact(toolCss, ".oc-toolPanel-todos .oc-toolTodoHeader"), /flex-wrap:\s*nowrap;/)
    assert.match(cssRuleExact(toolCss, ".oc-toolPanel-todos .oc-toolHeaderMain"), /flex-wrap:\s*nowrap;/)
    assert.match(cssRuleExact(toolCss, ".oc-toolPanel-todos .oc-toolHeaderMain"), /overflow:\s*hidden;/)
    assert.match(cssRuleExact(toolCss, ".oc-toolPanel-todos .oc-toolPanelTitle"), /line-height:\s*1\.2;/)
    assert.match(cssRuleExact(toolCss, ".oc-toolPanel-todos .oc-toolPanelTitle"), /text-overflow:\s*ellipsis;/)
    assert.match(cssRuleExact(toolCss, ".oc-toolPanel-todos .oc-toolTodoSummary"), /line-height:\s*1\.2;/)
    assert.match(cssRuleExact(toolCss, ".oc-toolPanel-todos .oc-toolTodoSummary"), /text-overflow:\s*ellipsis;/)
  })

  test("lets long collapsed todo headers shrink instead of widening the transcript", () => {
    const toolCss = readFileSync(resolve(process.cwd(), "src/panel/webview/tool.css"), "utf8")

    assert.match(cssRule(toolCss, ".oc-toolPanel"), /min-width:\s*0;/)
    assert.match(cssRule(toolCss, ".oc-toolTodoHeader"), /min-width:\s*0;/)
    assert.match(cssRule(toolCss, ".oc-shell[data-oc-theme=\"claude\"] .oc-toolPanel-todos .oc-toolHeaderMain"), /overflow:\s*hidden;/)
    assert.match(cssRule(toolCss, ".oc-shell[data-oc-theme=\"claude\"] .oc-toolPanel-todos .oc-toolTodoSummary"), /text-overflow:\s*ellipsis;/)
  })

  test("uses the same compact collapsed header and chevron treatment as shell blocks", () => {
    const toolCss = readFileSync(resolve(process.cwd(), "src/panel/webview/tool.css"), "utf8")

    assert.match(cssRule(toolCss, ".oc-shell[data-oc-theme=\"claude\"] .oc-toolPanel-todos"), /padding:\s*0;/)
    assert.match(cssRule(toolCss, ".oc-shell[data-oc-theme=\"claude\"] .oc-toolPanel-todos .oc-toolTodoHeader"), /padding:\s*7px\s+10px;/)
    assert.match(cssRule(toolCss, ".oc-shell[data-oc-theme=\"claude\"] .oc-toolTodoToggle"), /width:\s*14px;/)
    assert.match(cssRule(toolCss, ".oc-shell[data-oc-theme=\"claude\"] .oc-toolTodoToggle"), /height:\s*14px;/)
    assert.match(cssRule(toolCss, ".oc-shell[data-oc-theme=\"claude\"] .oc-toolTodoToggle"), /border:\s*0;/)
    assert.match(cssRule(toolCss, ".oc-shell[data-oc-theme=\"claude\"] .oc-toolTodoToggle"), /background:\s*transparent;/)
    assert.match(cssRule(toolCss, ".oc-shell[data-oc-theme=\"claude\"] .oc-toolTodoToggleIcon"), /width:\s*14px;/)
    assert.match(cssRule(toolCss, ".oc-shell[data-oc-theme=\"claude\"] .oc-toolTodoToggleIcon"), /height:\s*14px;/)
  })

  test("animates todo expansion with a reduced-motion fallback", () => {
    const toolCss = readFileSync(resolve(process.cwd(), "src/panel/webview/tool.css"), "utf8")

    assert.match(cssRule(toolCss, ".oc-toolTodoList"), /grid-template-rows:\s*0fr;/)
    assert.match(cssRule(toolCss, ".oc-toolTodoList"), /transition:\s*grid-template-rows\s+160ms\s+ease,\s*opacity\s+160ms\s+ease;/)
    assert.match(cssRule(toolCss, ".oc-toolTodoListClip"), /min-height:\s*0;/)
    assert.match(cssRule(toolCss, ".oc-toolTodoListClip"), /overflow:\s*hidden;/)
    assert.match(cssRule(toolCss, ".oc-toolTodoHeader[aria-expanded=\"true\"] + .oc-toolTodoList"), /grid-template-rows:\s*1fr;/)
    assert.match(cssRule(toolCss, ".oc-shell[data-oc-theme=\"claude\"] .oc-toolTodoToggleIcon"), /transition:\s*transform\s+160ms\s+ease;/)
    assert.match(cssRule(toolCss, ".oc-shell[data-oc-theme=\"claude\"] .oc-toolTodoHeader[aria-expanded=\"true\"] .oc-toolTodoToggleIcon"), /transform:\s*rotate\(180deg\);/)
    assert.match(toolCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.oc-toolTodoList[\s\S]*transition:\s*none;/)
  })
})

function cssRule(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))
  assert.ok(match, `missing CSS rule for ${selector}`)
  return match[1] || ""
}

function cssRuleExact(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = css.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([^}]*)\\}`))
  assert.ok(match, `missing CSS rule for ${selector}`)
  return match[1] || ""
}
