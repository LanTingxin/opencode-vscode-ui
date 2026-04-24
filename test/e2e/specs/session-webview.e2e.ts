import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { $, $$, browser, expect } from "@wdio/globals"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fakeOpencodeLog = path.resolve(__dirname, "../fixtures/opencode.log")

describe("session webview", () => {
  beforeEach(async () => {
    await switchToWorkbenchWindow()
    await browser.switchFrame(null)
    await browser.executeWorkbench(async (vscode) => {
      await vscode.commands.executeCommand("notifications.clearAll")
      await vscode.commands.executeCommand("workbench.action.closeAllEditors")
      const extension = vscode.extensions.getExtension("LanTingxin.opencode-enhanced-ui")
        ?? vscode.extensions.all.find((item) => item.id.toLowerCase() === "lantingxin.opencode-enhanced-ui")
      await extension?.activate()
      const folder = vscode.workspace.workspaceFolders?.[0]
      if (!folder) {
        throw new Error("Expected the E2E workspace folder to be open")
      }
      await vscode.commands.executeCommand("opencode-ui.openSessionById", {
        workspaceId: folder.uri.toString(),
        dir: folder.uri.fsPath,
      }, "e2e-session")
    })
    await switchToSessionWebview()
  })

  afterEach(async () => {
    await browser.switchFrame(null)
  })

  it("enables composer submission after typing a prompt", async () => {
    const composer = await $(".oc-composerInput")
    await expect(composer).toBeDisplayed()

    const send = await $("button[aria-label=\"Submit prompt\"]")
    await expect(send).toBeDisabled()

    await composer.click()
    await browser.keys("Summarize the current workspace")

    await expect(send).toBeEnabled()
  })

  it("renders the current session transcript and message actions", async () => {
    await expectTextInWebview("Initial test prompt")
    await expectTextInWebview("Initial test response")
    await expect($("[aria-label=\"Message actions\"]")).toExist()
    await expect($("button[aria-label=\"Fork\"]")).toExist()
    await expect($("[aria-label=\"Reply actions\"]")).toExist()
  })

  it("submits a prompt to the current session", async () => {
    const composer = await $(".oc-composerInput")
    await composer.click()
    await browser.keys("E2E prompt submission")
    await clickInWebview("button[aria-label=\"Submit prompt\"]")

    await waitForLogEntry("POST /session/e2e-session/prompt_async")
    await expect(composer).toHaveText("")
  })

  it("opens model picker and keeps the selected provider visible", async () => {
    await $("button[aria-label=\"Switch model\"]").click()

    const picker = await $("[role=\"dialog\"][aria-label=\"Switch model\"]")
    await expect(picker).toBeDisplayed()
    await $("input[aria-label=\"Filter models\"]").setValue("Test Model")
    await expectTextInWebview("Test Provider")
    await clickInWebview("[data-model-index=\"0\"]")

    await expect($("[role=\"dialog\"][aria-label=\"Switch model\"]")).not.toBeDisplayed()
    await expectTextInWebview("Test Model")
  })

  it("opens the theme picker and applies a selected theme", async () => {
    const composer = await $(".oc-composerInput")
    await composer.click()
    await browser.keys("/theme")
    await browser.keys("Enter")

    const picker = await $("[role=\"dialog\"][aria-label=\"Switch theme\"]")
    await expect(picker).toBeDisplayed()

    await $("input[aria-label=\"Filter themes\"]").setValue("Codex")
    await $("[data-theme-index=\"0\"]").click()

    const shell = await $(".oc-shell")
    await expect(shell).toHaveAttribute("data-oc-theme", "codex")
  })

  it("opens the session picker and switches sessions in place", async () => {
    const composer = await $(".oc-composerInput")
    await composer.click()
    await browser.keys("/session")
    await browser.keys("Enter")

    const picker = await $("[role=\"dialog\"][aria-label=\"Switch session\"]")
    await expect(picker).toBeDisplayed()
    await $("input[aria-label=\"Filter sessions\"]").setValue("Second")
    await clickInWebview("[data-session-index=\"0\"]")

    await expectTextInWebview("Start this session")
    await expectDocumentTitle("OpenCode: Second Session")
  })

  it("opens and closes the context side panel", async () => {
    await clickInWebview("button[aria-label=\"Open context\"]")

    const context = await $("aside[aria-label=\"Session context\"]")
    await expect(context).toBeDisplayed()
    await expectTextInWebview("Context")

    await clickInWebview("button[aria-label=\"Close context\"]")
    await expect($("aside[aria-label=\"Session context\"]")).not.toBeDisplayed()
  })

  it("runs shell commands from shell composer mode", async () => {
    const composer = await $(".oc-composerInput")
    await composer.click()
    await browser.keys("!")
    await expect(composer).toHaveElementClass("is-shell")

    await browser.keys("pwd")
    await browser.keys("Enter")

    await waitForLogEntry("POST /session/e2e-session/shell")
    await expect(composer).not.toHaveElementClass("is-shell")
    await expect(composer).toHaveText("")
  })
})

async function switchToSessionWebview() {
  const workbenchHandle = await browser.getWindowHandle()
  let diagnostics = ""
  try {
    await browser.waitUntil(async () => {
      if (await hasSessionShell()) {
        return true
      }

      if (await switchToFrameWithSessionShell()) {
        return true
      }

      const handles = await browser.getWindowHandles()
      const notes: string[] = []
      for (const handle of handles) {
        await browser.switchToWindow(handle)
        await browser.switchFrame(null)
        notes.push(await describeContext(handle))
        if (await hasSessionShell()) {
          return true
        }
      }

      diagnostics = notes.join(" | ")
      await browser.switchToWindow(workbenchHandle)
      return false
    }, {
      timeout: 20000,
      timeoutMsg: "Expected the OpenCode session webview to be visible",
    })
  } catch (err) {
    throw new Error(`${err instanceof Error ? err.message : String(err)}. Contexts: ${diagnostics}`)
  }
}

async function switchToWorkbenchWindow() {
  const handles = await browser.getWindowHandles()
  for (const handle of handles) {
    await browser.switchToWindow(handle)
    await browser.switchFrame(null)
    if (await $(".monaco-workbench").isExisting()) {
      return
    }
  }
}

async function hasSessionShell() {
  return await $(".oc-shell").isExisting()
}

async function switchToFrameWithSessionShell(path: number[] = []): Promise<boolean> {
  await switchToFramePath(path)
  if (await hasSessionShell()) {
    return true
  }

  if (path.length >= 3) {
    await browser.switchFrame(null)
    return false
  }

  const frames = await $$("iframe")
  for (let index = 0; index < frames.length; index += 1) {
    if (await switchToFrameWithSessionShell([...path, index])) {
      return true
    }
  }

  await browser.switchFrame(null)
  return false
}

async function switchToFramePath(path: number[]) {
  await browser.switchFrame(null)
  for (const index of path) {
    const frames = await $$("iframe")
    const frame = frames[index]
    if (!frame) {
      throw new Error(`Unable to switch to iframe path ${path.join(".")}`)
    }
    await browser.switchFrame(frame)
  }
}

async function describeContext(handle: string) {
  const [url, title, bodyClass, shell, frames] = await Promise.all([
    browser.getUrl().catch((err) => `url:${String(err)}`),
    browser.getTitle().catch((err) => `title:${String(err)}`),
    browser.execute(() => document.body?.className || "").catch((err) => `body:${String(err)}`),
    $(".oc-shell").isExisting().catch(() => false),
    browser.execute(() => Array.from(document.querySelectorAll("iframe")).map((frame) => ({
      className: frame.className,
      id: frame.id,
      name: frame.name,
      src: frame.src,
      title: frame.title,
    }))).catch((err) => [{ error: String(err) }]),
  ])
  return JSON.stringify({ handle, url, title, bodyClass, shell, frames })
}

async function expectTextInWebview(text: string) {
  await browser.waitUntil(async () => {
    return browser.execute((needle) => document.body.innerText.includes(needle), text)
  }, {
    timeout: 10000,
    timeoutMsg: `Expected webview text to include ${text}`,
  })
}

async function expectDocumentTitle(title: string) {
  await browser.waitUntil(async () => {
    return browser.execute((expected) => document.title === expected, title)
  }, {
    timeout: 10000,
    timeoutMsg: `Expected document title to be ${title}`,
  })
}

async function clickInWebview(selector: string) {
  await browser.execute((targetSelector) => {
    const target = document.querySelector<HTMLElement>(targetSelector)
    if (!target) {
      throw new Error(`Unable to find ${targetSelector}`)
    }
    target.click()
  }, selector)
}

async function readNewLog() {
  try {
    return await fs.readFile(fakeOpencodeLog, "utf8")
  } catch {
    return ""
  }
}

async function waitForLogEntry(entry: string) {
  await browser.waitUntil(async () => {
    const log = await readNewLog()
    return log.includes(entry)
  }, {
    timeout: 10000,
    timeoutMsg: `Expected fake opencode log to include ${entry}`,
  })
}
