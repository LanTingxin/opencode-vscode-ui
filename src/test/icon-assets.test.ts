import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, test } from "node:test"
import * as vscode from "vscode"

import { panelIconPath } from "../panel/provider/utils"

type ExtensionManifest = {
  icon?: string
  contributes?: {
    viewsContainers?: {
      activitybar?: Array<{ icon?: string }>
      secondarySidebar?: Array<{ icon?: string }>
    }
    commands?: Array<{
      command?: string
      icon?: string | { light?: string; dark?: string }
    }>
  }
}

const repoRoot = process.cwd()
const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf8"),
) as ExtensionManifest

function assetExists(relativePath: string) {
  return existsSync(path.join(repoRoot, relativePath))
}

describe("extension icon assets", () => {
  test("manifest icon paths all point to existing files", () => {
    const quickNewSession = manifest.contributes?.commands?.find(
      (command) => command.command === "opencode-ui.quickNewSession",
    )

    const iconPaths = [
      manifest.icon,
      ...manifest.contributes?.viewsContainers?.activitybar?.map((item) => item.icon) ?? [],
      ...manifest.contributes?.viewsContainers?.secondarySidebar?.map((item) => item.icon) ?? [],
      typeof quickNewSession?.icon === "object" ? quickNewSession.icon.light : undefined,
      typeof quickNewSession?.icon === "object" ? quickNewSession.icon.dark : undefined,
    ].filter((value): value is string => Boolean(value))

    assert.ok(iconPaths.length > 0)

    for (const iconPath of iconPaths) {
      assert.equal(assetExists(iconPath), true, `expected asset to exist: ${iconPath}`)
    }
  })

  test("session panels use the png tab icon asset", () => {
    const iconPath = panelIconPath(vscode.Uri.file(repoRoot))
    assert.ok("fsPath" in iconPath)
    assert.equal(iconPath.fsPath, path.join(repoRoot, "images", "tab.png"))
  })
})
