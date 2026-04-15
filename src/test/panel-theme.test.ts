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
})
