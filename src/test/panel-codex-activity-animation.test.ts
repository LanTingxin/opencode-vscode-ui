import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, test } from "node:test"

describe("codex activity summary animation", () => {
  test("keeps activity details mounted and animates collapse both ways", () => {
    const timelineCss = readFileSync(resolve(process.cwd(), "src/panel/webview/timeline.css"), "utf8")
    const timelineSource = readFileSync(resolve(process.cwd(), "src/panel/webview/app/timeline.tsx"), "utf8")

    assert.match(cssRule(timelineCss, ".oc-shell[data-oc-theme=\"codex\"] .oc-codexActivityDetails"), /grid-template-rows:\s*0fr;/)
    assert.match(cssRule(timelineCss, ".oc-shell[data-oc-theme=\"codex\"] .oc-codexActivityDetails"), /transition:\s*grid-template-rows\s+180ms\s+ease,\s*opacity\s+160ms\s+ease;/)
    assert.match(cssRule(timelineCss, ".oc-shell[data-oc-theme=\"codex\"] .oc-codexActivityGroup.is-expanded .oc-codexActivityDetails"), /grid-template-rows:\s*1fr;/)
    assert.match(cssRule(timelineCss, ".oc-shell[data-oc-theme=\"codex\"] .oc-codexActivityDetailsClip"), /min-height:\s*0;/)
    assert.match(cssRule(timelineCss, ".oc-shell[data-oc-theme=\"codex\"] .oc-codexActivityDetailsClip"), /overflow:\s*hidden;/)
    assert.match(timelineCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-codexActivityDetails[\s\S]*transition:\s*none;/)
    assert.match(timelineSource, /oc-codexActivityDetailsClip/)
    assert.doesNotMatch(timelineSource, /activityExpanded\s*\?\s*\(\s*<div className="oc-codexActivityDetails"/)
  })
})

function cssRule(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))
  assert.ok(match, `missing CSS rule for ${selector}`)
  return match[1] || ""
}
