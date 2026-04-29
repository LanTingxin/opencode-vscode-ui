import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, test } from "node:test"
import * as vscode from "vscode"
import { getOpencodePath } from "../core/settings"
import { resolveOpencodeCommand } from "../core/server"
import { checkOpencodeAvailable, isMissingOpencodeError } from "../core/runtime-errors"

const originalGetConfiguration = vscode.workspace.getConfiguration

afterEach(() => {
  ;(vscode.workspace as typeof vscode.workspace & {
    getConfiguration: typeof vscode.workspace.getConfiguration
  }).getConfiguration = originalGetConfiguration
})

function stubConfig(map: Record<string, unknown>) {
  ;(vscode.workspace as typeof vscode.workspace & {
    getConfiguration: typeof vscode.workspace.getConfiguration
  }).getConfiguration = ((section?: string) => ({
    get: <T,>(key: string, fallback: T) => {
      if (section === "opencode-ui" && key in map) {
        return map[key] as T
      }
      return fallback
    },
  })) as typeof vscode.workspace.getConfiguration
}

describe("opencode binary path setting", () => {
  test("returns empty string when nothing is configured", () => {
    stubConfig({})
    assert.equal(getOpencodePath(), "")
  })

  test("returns the configured path", () => {
    stubConfig({ opencodePath: "C:/tools/opencode/opencode.exe" })
    assert.equal(getOpencodePath(), "C:/tools/opencode/opencode.exe")
  })

  test("trims surrounding whitespace from the configured path", () => {
    stubConfig({ opencodePath: "  /usr/local/bin/opencode  " })
    assert.equal(getOpencodePath(), "/usr/local/bin/opencode")
  })

  test("falls back to opencode when no path is configured", () => {
    assert.equal(resolveOpencodeCommand(""), "opencode")
  })

  test("falls back to opencode when the configured path is whitespace only", () => {
    assert.equal(resolveOpencodeCommand("   "), "opencode")
  })

  test("uses the configured path when provided", () => {
    assert.equal(resolveOpencodeCommand("/usr/local/bin/opencode"), "/usr/local/bin/opencode")
    assert.equal(resolveOpencodeCommand("C:/tools/opencode.exe"), "C:/tools/opencode.exe")
  })

  test("classifies the new ENOENT error message as a missing-opencode error regardless of the configured path", () => {
    assert.equal(
      isMissingOpencodeError(
        'failed to start opencode: command "C:/tools/opencode.exe" was not found on the current host PATH (configured via "opencode-ui.opencodePath": C:/tools/opencode.exe)',
      ),
      true,
    )
    assert.equal(
      isMissingOpencodeError(
        'failed to start opencode: command "opencode" was not found on the current host PATH (set "opencode-ui.opencodePath" to point at the opencode binary if it lives outside PATH)',
      ),
      true,
    )
    assert.equal(
      isMissingOpencodeError(
        'failed to start opencode: command "/usr/local/bin/opencode" is not executable on the current host (configured via "opencode-ui.opencodePath": /usr/local/bin/opencode)',
      ),
      true,
    )
    assert.equal(isMissingOpencodeError("server exited before ready (code=1 signal=none)"), false)
  })

  test("checkOpencodeAvailable uses the configured opencode path", async () => {
    const bogus = process.platform === "win32"
      ? "C:/this/path/definitely/does/not/exist/opencode.exe"
      : "/this/path/definitely/does/not/exist/opencode"
    stubConfig({ opencodePath: bogus })

    const result = await checkOpencodeAvailable()
    assert.equal(result.ok, false)
    if (!result.ok) {
      // Either ENOENT, a spawn error, or a shell-level "not found" message (which on
      // Windows may be a localized string from cmd.exe).  The key assertion is result.ok === false.
      assert.ok(result.message.length > 0, "error message should not be empty")
    }
  })

  test("spawn uses shell: true so .cmd/.bat files resolve on Windows", () => {
    const source = readFileSync(resolve(process.cwd(), "src/core/server.ts"), "utf8")
    assert.match(source, /shell:\s*true/, "server.ts spawn should include shell: true for cross-platform binary resolution")
  })

  test("checkOpencodeAvailable uses shell: true so .cmd/.bat files resolve on Windows", () => {
    const source = readFileSync(resolve(process.cwd(), "src/core/runtime-errors.ts"), "utf8")
    assert.match(source, /shell:\s*true/, "runtime-errors.ts spawn should include shell: true for cross-platform binary resolution")
  })

  test("declares opencode-ui.opencodePath in the extension configuration", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      contributes?: {
        configuration?: {
          properties?: Record<string, {
            type?: string
            default?: string
            scope?: string
          }>
        }
      }
    }

    const prop = pkg.contributes?.configuration?.properties?.["opencode-ui.opencodePath"]
    assert.ok(prop, "opencode-ui.opencodePath should be declared in package.json")
    assert.equal(prop?.type, "string")
    assert.equal(prop?.default, "")
    assert.equal(prop?.scope, "machine-overridable")
  })
})
