import * as cp from "node:child_process"
import * as vscode from "vscode"
import { resolveOpencodeCommand, type WorkspaceRuntime } from "./server"
import { getOpencodePath } from "./settings"

const MISSING_OPENCODE_MARKERS = [
  "was not found on the current host PATH",
  "is not executable on the current host",
  // legacy phrasing kept for backward compatibility
  'command "opencode" was not found',
  'command "opencode" is not executable',
]

export function isMissingOpencodeError(message?: string) {
  if (!message) {
    return false
  }

  return MISSING_OPENCODE_MARKERS.some((marker) => message.includes(marker))
}

export function missingOpencodeMessage(rt?: Pick<WorkspaceRuntime, "name">) {
  const host = vscode.env.remoteName || "local"
  const target = rt?.name ? ` for ${rt.name}` : ""
  return `OpenCode UI could not start opencode${target}. Install the opencode CLI on the current ${host} host and ensure it is available on PATH.`
}

export function runtimeNotReadyMessage(rt?: Pick<WorkspaceRuntime, "name" | "err">) {
  if (!rt) {
    return "Workspace server is not available."
  }

  if (isMissingOpencodeError(rt.err)) {
    return missingOpencodeMessage(rt)
  }

  if (rt.err) {
    return `Workspace server is not ready: ${rt.err}`
  }

  return "Wait for the workspace server to become ready first."
}

export async function checkOpencodeAvailable() {
  const command = resolveOpencodeCommand(getOpencodePath())
  return await new Promise<{ ok: true; output: string } | { ok: false; message: string }>((resolve) => {
    const proc = cp.spawn(command, ["--version"], {
      shell: true,
      env: {
        ...process.env,
        OPENCODE_CALLER: "vscode-ui",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })

    let stdout = ""
    let stderr = ""
    let settled = false

    const finish = (result: { ok: true; output: string } | { ok: false; message: string }) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    proc.stdout?.on("data", (chunk) => {
      stdout += String(chunk)
    })

    proc.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })

    proc.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        finish({ ok: false, message: `command "${command}" was not found on the current host PATH` })
        return
      }

      if (err.code === "EACCES") {
        finish({ ok: false, message: `command "${command}" is not executable on the current host` })
        return
      }

      finish({ ok: false, message: err.message || String(err) })
    })

    proc.once("exit", (code, signal) => {
      if (code === 0) {
        const output = stdout.trim() || stderr.trim() || "opencode is available"
        finish({ ok: true, output })
        return
      }

      const detail = stderr.trim() || stdout.trim() || `exit code=${code ?? "unknown"} signal=${signal ?? "none"}`
      finish({ ok: false, message: detail })
    })

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGTERM")
      } catch {}

      finish({ ok: false, message: "timed out while checking opencode availability" })
    }, 5000)
  })
}
