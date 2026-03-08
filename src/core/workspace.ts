import * as vscode from "vscode"
import { client } from "./sdk"
import { freeport, health, spawn, stop, type WorkspaceRuntime } from "./server"

export class WorkspaceManager implements vscode.Disposable {
  private state = new Map<string, WorkspaceRuntime>()
  private change = new vscode.EventEmitter<void>()

  readonly onDidChange = this.change.event

  constructor(private out: vscode.OutputChannel) {}

  list() {
    return [...this.state.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  get(dir: string) {
    return this.state.get(dir)
  }

  invalidate() {
    this.fire()
  }

  async sync(folders: readonly vscode.WorkspaceFolder[]) {
    const next = new Set(folders.map((item) => item.uri.fsPath))
    const gone = [...this.state.keys()].filter((dir) => !next.has(dir))

    await Promise.all(gone.map((dir) => this.remove(dir)))
    await Promise.all(folders.map((item) => this.ensure(item)))
  }

  async ensure(folder: vscode.WorkspaceFolder) {
    const dir = folder.uri.fsPath
    const cur = this.state.get(dir)

    if (cur && (cur.state === "starting" || cur.state === "ready")) {
      return cur
    }

    if (cur?.proc) {
      await stop(cur.proc)
    }

    const port = await freeport()
    const url = `http://127.0.0.1:${port}`
    const proc = spawn(dir, port)
    const rt: WorkspaceRuntime = {
      dir,
      name: folder.name,
      port,
      url,
      state: "starting",
      sessions: new Map(),
      sessionsState: "idle",
      pid: proc.pid,
      proc,
    }

    this.state.set(dir, rt)
    this.log(rt, `starting server on ${url}`)
    this.bind(rt)
    this.fire()

    try {
      await health(url, 800, 25)
      rt.sdk = await client(url, dir)
      rt.state = "ready"
      rt.err = undefined
      this.log(rt, "server ready")
    } catch (err) {
      rt.state = "error"
      rt.sdk = undefined
      rt.err = text(err)
      this.log(rt, `server failed: ${rt.err}`)
    }

    this.fire()
    return rt
  }

  async restart(dir: string) {
    const folder = vscode.workspace.workspaceFolders?.find((item) => item.uri.fsPath === dir)

    if (!folder) {
      return
    }

    await this.remove(dir)
    await this.ensure(folder)
  }

  async remove(dir: string) {
    const rt = this.state.get(dir)

    if (!rt) {
      return
    }

    this.state.delete(dir)
    this.fire()
    await stop(rt.proc)
    this.log(rt, "server stopped")
  }

  dispose() {
    this.change.dispose()
    void Promise.all([...this.state.keys()].map((dir) => this.remove(dir)))
  }

  private bind(rt: WorkspaceRuntime) {
    rt.proc?.stdout?.on("data", (buf) => {
      this.log(rt, String(buf).trimEnd())
    })

    rt.proc?.stderr?.on("data", (buf) => {
      this.log(rt, String(buf).trimEnd())
    })

    rt.proc?.on("exit", (code, signal) => {
      const cur = this.state.get(rt.dir)

      if (!cur || cur.proc !== rt.proc) {
        return
      }

      cur.state = "stopped"
      cur.sdk = undefined
      cur.err = code === 0 ? undefined : `exit code=${code ?? "unknown"} signal=${signal ?? "none"}`
      this.log(cur, `server exited code=${code ?? "unknown"} signal=${signal ?? "none"}`)
      this.fire()
    })

    rt.proc?.on("error", (err) => {
      const cur = this.state.get(rt.dir)

      if (!cur) {
        return
      }

      cur.state = "error"
      cur.sdk = undefined
      cur.err = text(err)
      this.log(cur, `process error: ${cur.err}`)
      this.fire()
    })
  }

  private log(rt: WorkspaceRuntime, msg: string) {
    if (!msg) {
      return
    }

    this.out.appendLine(`[${rt.name}] ${msg}`)
  }

  private fire() {
    this.change.fire()
  }
}

function text(err: unknown) {
  if (err instanceof Error) {
    return err.message
  }

  return String(err)
}
