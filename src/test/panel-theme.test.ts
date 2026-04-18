import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, test } from "node:test"
import * as vscode from "vscode"
import { affectsDisplaySettings, getDisplaySettings } from "../core/settings"
import { resolvePanelThemeValue } from "../panel/webview/app/state"

const originalGetConfiguration = vscode.workspace.getConfiguration

afterEach(() => {
  ;(vscode.workspace as typeof vscode.workspace & {
    getConfiguration: typeof vscode.workspace.getConfiguration
  }).getConfiguration = originalGetConfiguration
})

describe("panel theme settings", () => {
  test("reads panelTheme from display settings", () => {
    ;(vscode.workspace as typeof vscode.workspace & {
      getConfiguration: typeof vscode.workspace.getConfiguration
    }).getConfiguration = ((section?: string) => ({
      get: <T,>(key: string, fallback: T) => {
        if (section === "opencode-ui" && key === "panelTheme") {
          return "claude" as T
        }
        return fallback
      },
    })) as typeof vscode.workspace.getConfiguration

    assert.equal(getDisplaySettings().panelTheme, "claude")
  })

  test("normalizes invalid panelTheme values to default", () => {
    ;(vscode.workspace as typeof vscode.workspace & {
      getConfiguration: typeof vscode.workspace.getConfiguration
    }).getConfiguration = ((section?: string) => ({
      get: <T,>(key: string, fallback: T) => {
        if (section === "opencode-ui" && key === "panelTheme") {
          return "invalid-theme" as T
        }
        return fallback
      },
    })) as typeof vscode.workspace.getConfiguration

    assert.equal(getDisplaySettings().panelTheme, "default")
  })

  test("treats panelTheme changes as display setting changes", () => {
    const event = {
      affectsConfiguration: (key: string) => key === "opencode-ui.panelTheme",
    } as vscode.ConfigurationChangeEvent

    assert.equal(affectsDisplaySettings(event), true)
  })

  test("resolves the panel root theme attribute value", () => {
    assert.equal(resolvePanelThemeValue("codex"), "codex")
    assert.equal(resolvePanelThemeValue(undefined), "default")
  })

  test("defines light and dark theme branches for the panel", () => {
    const css = readFileSync(resolve(process.cwd(), "src/panel/webview/theme.css"), "utf8")

    assert.match(css, /body\.vscode-dark/)
    assert.match(css, /body\.vscode-light/)
    assert.doesNotMatch(css, /:root\s*\{[^}]*color-scheme:\s*dark;/s)
  })

  test("defines codex and claude preset selectors", () => {
    const css = readFileSync(resolve(process.cwd(), "src/panel/webview/theme.css"), "utf8")

    assert.match(css, /\[data-oc-theme=\"codex\"\]/)
    assert.match(css, /\[data-oc-theme=\"claude\"\]/)
  })

  test("keeps the default light and dark preset aligned with the original hard-edged look", () => {
    const css = readFileSync(resolve(process.cwd(), "src/panel/webview/theme.css"), "utf8")

    assert.match(css, /body\.vscode-dark\s*\{[\s\S]*--oc-canvas:\s*#000;/)
    assert.match(css, /body\.vscode-dark\s*\{[\s\S]*--oc-surface-primary:\s*#000;/)
    assert.match(css, /body\.vscode-dark\s*\{[\s\S]*--oc-radius-md:\s*0px;/)
    assert.match(css, /body\.vscode-dark\s*\{[\s\S]*--oc-message-user-bg:\s*#000;/)
    assert.match(css, /body\.vscode-light\s*\{[\s\S]*--oc-canvas:\s*#fff;/)
    assert.match(css, /body\.vscode-light\s*\{[\s\S]*--oc-surface-primary:\s*#fff;/)
    assert.match(css, /body\.vscode-light\s*\{[\s\S]*--oc-radius-md:\s*0px;/)
    assert.match(css, /body\.vscode-light\s*\{[\s\S]*--oc-message-user-bg:\s*#fff;/)
  })

  test("gives codex and claude clearly different visual signatures in both light and dark modes", () => {
    const css = readFileSync(resolve(process.cwd(), "src/panel/webview/theme.css"), "utf8")

    assert.match(css, /body\.vscode-dark\s+\.oc-shell\[data-oc-theme=\"codex\"\]\s*\{[\s\S]*--oc-radius-md:\s*10px;/)
    assert.match(css, /body\.vscode-dark\s+\.oc-shell\[data-oc-theme=\"claude\"\]\s*\{[\s\S]*--oc-radius-md:\s*20px;/)
    assert.match(css, /body\.vscode-dark\s+\.oc-shell\[data-oc-theme=\"codex\"\]\s*\{[\s\S]*--oc-accent-strong:\s*#63a6ff;/)
    assert.match(css, /body\.vscode-dark\s+\.oc-shell\[data-oc-theme=\"claude\"\]\s*\{[\s\S]*--oc-accent-strong:\s*#d98d3f;/)
    assert.match(css, /body\.vscode-light\s+\.oc-shell\[data-oc-theme=\"codex\"\]\s*\{[\s\S]*--oc-canvas:\s*#edf3fb;/)
    assert.match(css, /body\.vscode-light\s+\.oc-shell\[data-oc-theme=\"claude\"\]\s*\{[\s\S]*--oc-canvas:\s*#f6efe5;/)
  })

  test("uses a frameless outer composer container", () => {
    const baseCss = readFileSync(resolve(process.cwd(), "src/panel/webview/base.css"), "utf8")
    const statusCss = readFileSync(resolve(process.cwd(), "src/panel/webview/status.css"), "utf8")

    assert.doesNotMatch(baseCss, /\.oc-dock,\n\.oc-composer,\n\.oc-questionCard/)
    assert.match(baseCss, /\.oc-composer\s*\{[\s\S]*border:\s*0;/)
    assert.match(baseCss, /\.oc-composer\s*\{[\s\S]*background:\s*transparent;/)
    assert.match(baseCss, /\.oc-composer\s*\{[\s\S]*padding:\s*0;/)
    assert.match(baseCss, /\.oc-composer\s*\{[\s\S]*gap:\s*8px;/)
    assert.match(statusCss, /\.oc-composerBody\s*\{[\s\S]*border:\s*1px solid var\(--oc-composer-border\);/)
  })

  test("keeps the footer spacing aligned with the current transcript shell", () => {
    const layoutCss = readFileSync(resolve(process.cwd(), "src/panel/webview/layout.css"), "utf8")

    assert.match(layoutCss, /\.oc-footer\s*\{[\s\S]*padding:\s*8px 0 10px;/)
  })

  test("uses a dedicated warm accent for skill pills instead of the old magenta fill", () => {
    const baseCss = readFileSync(resolve(process.cwd(), "src/panel/webview/base.css"), "utf8")
    const themeCss = readFileSync(resolve(process.cwd(), "src/panel/webview/theme.css"), "utf8")

    assert.match(baseCss, /\.oc-pill-skill\s+\.oc-pillFileType\s*\{[\s\S]*background:\s*var\(--oc-pill-skill-fill\);/)
    assert.doesNotMatch(baseCss, /--vscode-terminal-ansiMagenta/)
    assert.match(themeCss, /body\.vscode-dark\s*\{[\s\S]*--oc-pill-skill-fill:\s*#9f5f3f;/)
    assert.match(themeCss, /body\.vscode-light\s*\{[\s\S]*--oc-pill-skill-fill:\s*#c9743a;/)
  })

  test("keeps the composer footer as a compact two-zone control strip", () => {
    const layoutCss = readFileSync(resolve(process.cwd(), "src/panel/webview/layout.css"), "utf8")
    const statusCss = readFileSync(resolve(process.cwd(), "src/panel/webview/status.css"), "utf8")

    assert.match(statusCss, /\.oc-composerActions\s*\{[\s\S]*display:\s*grid;/)
    assert.match(statusCss, /\.oc-composerActions\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/)
    assert.match(statusCss, /\.oc-composerActions\s*\{[\s\S]*align-items:\s*center;/)
    assert.match(statusCss, /\.oc-composerActions\s*\{[\s\S]*gap:\s*12px;/)
    assert.match(statusCss, /\.oc-composerActions\s*\{[\s\S]*padding:\s*0 4px;/)
    assert.match(statusCss, /\.oc-composerActionsMain\s*\{[\s\S]*display:\s*flex;/)
    assert.match(layoutCss, /@media\s*\(max-width:\s*720px\)\s*\{/)
    assert.doesNotMatch(statusCss, /@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*\.oc-composerActions\s*\{/)
  })

  test("adds preset-specific transcript shell, message, and composer styling hooks", () => {
    const layoutCss = readFileSync(resolve(process.cwd(), "src/panel/webview/layout.css"), "utf8")
    const timelineCss = readFileSync(resolve(process.cwd(), "src/panel/webview/timeline.css"), "utf8")
    const statusCss = readFileSync(resolve(process.cwd(), "src/panel/webview/status.css"), "utf8")
    const toolCss = readFileSync(resolve(process.cwd(), "src/panel/webview/tool.css"), "utf8")

    assert.match(layoutCss, /\.oc-shell\s*\{[\s\S]*background:\s*var\(--oc-shell-backdrop,\s*var\(--oc-surface-canvas\)\);/)
    assert.match(layoutCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-transcriptInner\s*,/)
    assert.match(layoutCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-transcriptInner\s*,/)

    assert.match(timelineCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-turnUser\s*\{/)
    assert.match(timelineCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-turnUser::before\s*\{/)
    assert.match(timelineCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-turnUser::before\s*\{[\s\S]*display:\s*none;/)
    assert.match(timelineCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-part-text\s*,/)

    assert.match(statusCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-composerBody\s*\{/)
    assert.match(statusCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-composerPrimaryAction\s*\{/)
    assert.match(statusCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-composerBody\s*\{/)
    assert.match(statusCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-statusBadge\s*\{/)

    assert.match(toolCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-toolRowWrap\s*\{/)
    assert.match(toolCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-toolPanel\.is-active\s*\{/)
  })

  test("tightens codex user prompts and centers claude prompts with a toolflow connector", () => {
    const timelineCss = readFileSync(resolve(process.cwd(), "src/panel/webview/timeline.css"), "utf8")
    const toolCss = readFileSync(resolve(process.cwd(), "src/panel/webview/tool.css"), "utf8")

    assert.match(timelineCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-turnUser\s*\{[\s\S]*padding:\s*10px 16px;/)
    assert.match(timelineCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-turnUser\s*\{[\s\S]*justify-self:\s*center;/)
    assert.match(timelineCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-turnUser\s*\{[\s\S]*max-width:\s*min\(860px,\s*calc\(100% - 28px\)\);/)
    assert.match(toolCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-toolRowWrap::before\s*,/)
    assert.match(toolCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-toolPanel::before\s*\{/)
    assert.match(toolCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-toolRowWrap::before[\s\S]*linear-gradient/)
    assert.match(toolCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-toolRowWrap::after[\s\S]*box-shadow:/)
    assert.match(toolCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-toolRowWrap\s*\{[\s\S]*width:\s*calc\(100%\s*-\s*28px\);/)
    assert.match(toolCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-toolPanel\s*\{[\s\S]*width:\s*calc\(100%\s*-\s*28px\);/)
  })

  test("adds theme-specific pills, markdown, and output window treatments", () => {
    const baseCss = readFileSync(resolve(process.cwd(), "src/panel/webview/base.css"), "utf8")
    const markdownCss = readFileSync(resolve(process.cwd(), "src/panel/webview/markdown.css"), "utf8")
    const toolCss = readFileSync(resolve(process.cwd(), "src/panel/webview/tool.css"), "utf8")

    assert.match(baseCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-pill-command\s*,/)
    assert.match(baseCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-pill-skill\s*\{/)
    assert.match(baseCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-pill-command\s+\.oc-pillFileType\s*\{[\s\S]*font-style:\s*italic;/)
    assert.match(baseCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-btn-primary\s*\{[\s\S]*box-shadow:\s*0 12px 22px/)
    assert.match(baseCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-pill-command\s*,/)
    assert.match(baseCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-pill-skill\s*\{/)
    assert.match(baseCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-pill-command\s+\.oc-pillFileType\s*\{[\s\S]*font-family:\s*var\(--oc-mono\);/)
    assert.match(baseCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-pill-command\s+\.oc-pillFileType\s*\{[\s\S]*text-transform:\s*uppercase;/)

    assert.match(markdownCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-markdown blockquote\s*\{/)
    assert.match(markdownCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-markdown blockquote\s*\{[\s\S]*box-shadow:\s*inset 3px 0 0/)
    assert.match(markdownCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-markdown h1::before\s*,/)
    assert.match(markdownCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-inlineCode\s*\{/)
    assert.match(markdownCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-markdown pre\s*\{[\s\S]*border:\s*1px solid/)

    assert.match(toolCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-outputWindow\s*\{/)
    assert.match(toolCss, /\.oc-shell\[data-oc-theme=\"claude\"\]\s+\.oc-outputWindowCopyBtn\s*\{[\s\S]*border-radius:\s*999px;/)
    assert.match(toolCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-outputWindowHead\s*\{/)
    assert.match(toolCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-outputWindowAction::before\s*\{[\s\S]*content:\s*\"\";/)
  })

  test("styles assistant error blocks with preset-specific theme variables", () => {
    const themeCss = readFileSync(resolve(process.cwd(), "src/panel/webview/theme.css"), "utf8")
    const timelineCss = readFileSync(resolve(process.cwd(), "src/panel/webview/timeline.css"), "utf8")

    assert.match(themeCss, /body\.vscode-dark\s+\.oc-shell\[data-oc-theme=\"claude\"\]\s*\{[\s\S]*--oc-assistant-error-bg:/)
    assert.match(themeCss, /body\.vscode-dark\s+\.oc-shell\[data-oc-theme=\"codex\"\]\s*\{[\s\S]*--oc-assistant-error-bg:/)
    assert.match(themeCss, /body\.vscode-light\s+\.oc-shell\[data-oc-theme=\"claude\"\]\s*\{[\s\S]*--oc-assistant-error-rail:/)
    assert.match(themeCss, /body\.vscode-light\s+\.oc-shell\[data-oc-theme=\"codex\"\]\s*\{[\s\S]*--oc-assistant-error-rail:/)
    assert.match(timelineCss, /\.oc-assistantError\s*\{[\s\S]*background:\s*var\(--oc-assistant-error-bg,/)
    assert.match(timelineCss, /\.oc-assistantError::before\s*\{[\s\S]*background:\s*var\(--oc-assistant-error-rail,/)
  })

  test("adds a codex todo popover and hides transcript todo panels for codex", () => {
    const layoutCss = readFileSync(resolve(process.cwd(), "src/panel/webview/layout.css"), "utf8")
    const statusCss = readFileSync(resolve(process.cwd(), "src/panel/webview/status.css"), "utf8")
    const toolCss = readFileSync(resolve(process.cwd(), "src/panel/webview/tool.css"), "utf8")

    assert.match(layoutCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-footerInner\s*\{[\s\S]*position:\s*relative;/)
    assert.match(statusCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-codexTodoDock\s*\{[\s\S]*position:\s*absolute;/)
    assert.match(statusCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-codexTodoDock\s*\{[\s\S]*pointer-events:\s*none;/)
    assert.match(statusCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-codexTodoPopover\s*\{/)
    assert.match(statusCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-codexTodoPopover\s*\{[\s\S]*pointer-events:\s*auto;/)
    assert.match(statusCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-codexTodoPopover\.is-collapsed\s*\{/)
    assert.match(statusCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-codexTodoPopover::after\s*\{/)
    assert.match(statusCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-codexTodoEyebrow\s*\{/)
    assert.match(statusCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-codexTodoToggle\s*\{/)
    assert.match(statusCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-codexTodoItem\.is-completed\s+\.oc-codexTodoMarker\s*\{/)
    assert.match(toolCss, /\.oc-shell\[data-oc-theme=\"codex\"\]\s+\.oc-toolPanel-todos\s*\{[\s\S]*display:\s*none;/)
  })
})
