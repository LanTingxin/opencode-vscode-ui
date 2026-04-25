import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, test } from "node:test"

describe("panel context drawer", () => {
  test("does not keep the token usage tooltip visible after the context button keeps focus", () => {
    const statusCss = readFileSync(resolve(process.cwd(), "src/panel/webview/status.css"), "utf8")

    assert.match(statusCss, /\.oc-contextButtonWrap:hover\s+\.oc-contextButtonTooltip/)
    assert.doesNotMatch(statusCss, /\.oc-contextButtonWrap:focus-within\s+\.oc-contextButtonTooltip/)
  })

  test("uses a bottom overlay drawer without persistent tab or close text controls", () => {
    const appSource = readFileSync(resolve(process.cwd(), "src/panel/webview/app/App.tsx"), "utf8")
    const contextCss = readFileSync(resolve(process.cwd(), "src/panel/webview/context.css"), "utf8")
    const layoutCss = readFileSync(resolve(process.cwd(), "src/panel/webview/layout.css"), "utf8")

    assert.match(appSource, /className=\{`oc-sidePanelOverlay/)
    assert.match(appSource, /className="oc-sidePanelHandle"/)
    assert.match(appSource, /onClick=\{closeContextPanel\}/)
    assert.match(appSource, /contextPanelClosing/)
    assert.match(appSource, /is-closing/)
    assert.match(appSource, /onAnimationEnd=\{finishContextPanelClose\}/)
    assert.doesNotMatch(appSource, /className=\{`oc-shell\$\{contextPanelOpen \? " has-sidePanel"/)
    assert.doesNotMatch(appSource, /oc-sidePanelTabs/)
    assert.doesNotMatch(appSource, /oc-sidePanelClose/)

    assert.match(contextCss, /\.oc-sidePanelOverlay\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;/)
    assert.match(contextCss, /\.oc-sidePanel\s*\{[\s\S]*height:\s*min\(90vh,\s*calc\(100vh\s*-\s*24px\)\);/)
    assert.match(contextCss, /@keyframes\s+oc-contextDrawerIn/)
    assert.match(contextCss, /\.oc-sidePanelOverlay\.is-closing\s+\.oc-sidePanel\s*\{[\s\S]*animation:\s*oc-contextDrawerOut/)
    assert.match(contextCss, /@keyframes\s+oc-contextDrawerOut/)
    assert.doesNotMatch(layoutCss, /\.oc-shell\.has-sidePanel\s*\{[\s\S]*grid-template-columns:[\s\S]*side/)
  })
})
