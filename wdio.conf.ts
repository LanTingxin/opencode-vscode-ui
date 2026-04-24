import path from "node:path"
import { fileURLToPath } from "node:url"
import fs from "node:fs/promises"
import type { Options } from "@wdio/types"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fakeBin = path.join(__dirname, "test/e2e/fixtures/bin")
const fakeOpencodeLog = path.join(__dirname, "test/e2e/fixtures/opencode.log")
const workspacePath = path.join(__dirname, "test/e2e/fixtures/workspace")

process.env.PATH = `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`
process.env.OPENCODE_UI_E2E = "1"
process.env.OPENCODE_UI_E2E_LOG = fakeOpencodeLog

export const config: Options.Testrunner = {
  runner: "local",
  onPrepare: async () => {
    await fs.rm(fakeOpencodeLog, { force: true })
  },
  specs: ["./test/e2e/specs/**/*.e2e.ts"],
  maxInstances: 1,
  logLevel: "warn",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    timeout: 60000,
  },
  capabilities: [{
    browserName: "vscode",
    browserVersion: "stable",
    "wdio:enforceWebDriverClassic": true,
    "wdio:vscodeOptions": {
      extensionPath: __dirname,
      workspacePath,
      verboseLogging: false,
      vscodeArgs: {
        forceDisableUserEnv: true,
      },
      userSettings: {
        "workbench.startupEditor": "none",
        "telemetry.telemetryLevel": "off",
        "opencode-ui.panelTheme": "default",
      },
    },
  }],
  services: [["vscode", {
    cachePath: path.join(__dirname, ".wdio-vscode"),
  }]],
}
