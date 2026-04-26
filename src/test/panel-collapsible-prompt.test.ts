import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, test } from "node:test"

describe("panel collapsible prompt", () => {
  test("animates show more and show less with measured heights", () => {
    const timelineCss = readFileSync(resolve(process.cwd(), "src/panel/webview/timeline.css"), "utf8")
    const promptSource = readFileSync(resolve(process.cwd(), "src/panel/webview/app/collapsible-prompt.tsx"), "utf8")

    assert.match(cssRule(timelineCss, ".oc-collapsiblePromptContent"), /max-height:\s*var\(--oc-collapsiblePrompt-collapsed-height\);/)
    assert.match(cssRule(timelineCss, ".oc-collapsiblePromptContent"), /transition:\s*max-height\s+180ms\s+ease,\s*opacity\s+160ms\s+ease;/)
    assert.match(cssRule(timelineCss, ".oc-collapsiblePrompt.is-expanded .oc-collapsiblePromptContent"), /max-height:\s*var\(--oc-collapsiblePrompt-expanded-height\);/)
    assert.doesNotMatch(cssRule(timelineCss, ".oc-collapsiblePromptContent"), /-webkit-line-clamp:/)
    assert.match(timelineCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.oc-collapsiblePromptContent[\s\S]*transition:\s*none;/)
    assert.match(promptSource, /--oc-collapsiblePrompt-collapsed-height/)
    assert.match(promptSource, /--oc-collapsiblePrompt-expanded-height/)
  })
})

function cssRule(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))
  assert.ok(match, `missing CSS rule for ${selector}`)
  return match[1] || ""
}
