import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import * as vscode from "vscode"
import { affectsDisplaySettings, getDisplaySettings } from "../core/settings"

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
})
