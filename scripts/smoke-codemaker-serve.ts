// Mimics src/core/server.ts spawn() + health() for a smoke test.
// Usage: bun scripts/smoke-codemaker-serve.ts <opencode-binary>
import { spawn } from "node:child_process"
import { createServer } from "node:net"

const command = process.argv[2]
if (!command) {
  console.error("usage: bun scripts/smoke-codemaker-serve.ts <opencode-binary>")
  process.exit(2)
}

async function freeport(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once("error", reject)
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address()
      if (!addr || typeof addr === "string") {
        srv.close(() => reject(new Error("freeport failed")))
        return
      }
      srv.close(() => resolve(addr.port))
    })
  })
}

async function health(url: string, timeout: number, tries: number) {
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)
    try {
      const res = await fetch(`${url}/global/health`, { signal: ctrl.signal })
      clearTimeout(timer)
      if (res.ok) return { tries: i + 1, status: res.status, body: await res.text() }
    } catch {
      // retry
    }
    clearTimeout(timer)
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error("health check timed out")
}

const port = await freeport()
const url = `http://127.0.0.1:${port}`
console.log(`[smoke] spawning ${command} serve --port ${port} --hostname 127.0.0.1`)

const proc = spawn(command, ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
  cwd: process.cwd(),
  env: { ...process.env, OPENCODE_CALLER: "vscode-ui" },
  detached: false,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
})

proc.stdout?.on("data", (chunk) => process.stderr.write(`[child stdout] ${chunk}`))
proc.stderr?.on("data", (chunk) => process.stderr.write(`[child stderr] ${chunk}`))

let exited = false
proc.once("exit", (code, signal) => {
  exited = true
  console.log(`[smoke] child exited code=${code} signal=${signal}`)
})
proc.once("error", (err) => {
  console.log(`[smoke] spawn error:`, err)
})

try {
  const result = await health(url, 1500, 30)
  console.log(`[smoke] health OK after ${result.tries} tries, status=${result.status}, body=${result.body}`)

  // Probe an extra endpoint the extension actually uses to verify it talks v2-like API.
  try {
    const cfg = await fetch(`${url}/config`)
    console.log(`[smoke] /config status=${cfg.status}`)
    const text = await cfg.text()
    console.log(`[smoke] /config first 200 chars: ${text.slice(0, 200)}`)
  } catch (err) {
    console.log(`[smoke] /config failed:`, err)
  }
} catch (err) {
  console.log(`[smoke] health FAILED:`, (err as Error).message)
} finally {
  if (!exited && proc.pid) {
    console.log(`[smoke] killing child pid=${proc.pid}`)
    if (process.platform === "win32") {
      // Use taskkill /T to clean up the process tree; only this child, not all codemaker.exe.
      const { spawn: spawn2 } = await import("node:child_process")
      await new Promise<void>((resolve) => {
        const k = spawn2("taskkill", ["/pid", String(proc.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true })
        k.once("exit", () => resolve())
        k.once("error", () => resolve())
      })
    } else {
      proc.kill("SIGTERM")
    }
  }
}
