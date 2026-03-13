import * as vscode from "vscode"
import { client } from "./sdk"
import { freeport, health, spawn, startupFailure, stop, type WorkspaceRuntime } from "./server"

export class WorkspaceManager implements vscode.Disposable {
  private state = new Map<string, WorkspaceRuntime>()
  private dirIndex = new Map<string, string>()
  private ops = new Map<string, Promise<unknown>>()
  private shuttingDown = false
  private change = new vscode.EventEmitter<void>()

  readonly onDidChange = this.change.event

  constructor(private out: vscode.OutputChannel) {}

  list() {
    return [...this.state.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  get(dir: string) {
    return this.state.get(dir) ?? this.state.get(this.dirIndex.get(dir) || "")
  }

  invalidate() {
    this.fire()
  }

  async sync(folders: readonly vscode.WorkspaceFolder[]) {
    const next = new Set(folders.map((item) => workspaceId(item)))
    const gone = [...this.state.keys()].filter((id) => !next.has(id))

    await Promise.all(gone.map((id) => this.remove(id)))
    await Promise.all(folders.map((item) => this.ensure(item)))
  }

  async ensure(folder: vscode.WorkspaceFolder) {
    return this.serialize(workspaceId(folder), async () => this.ensureNow(folder))
  }

  async restart(id: string) {
    const folder = vscode.workspace.workspaceFolders?.find((item) => workspaceId(item) === id || item.uri.fsPath === id)

    if (!folder) {
      return
    }

    const key = workspaceId(folder)

    await this.serialize(key, async () => {
      await this.removeNow(key)
      return await this.ensureNow(folder)
    })
  }

  async remove(id: string) {
    const rt = this.get(id)
    if (!rt) {
      return
    }

    await this.serialize(rt.workspaceId, async () => this.removeNow(rt.workspaceId))
  }

  async shutdown() {
    this.shuttingDown = true
    await Promise.all([...this.state.keys()].map((dir) => this.remove(dir)))
  }

  dispose() {
    this.change.dispose()
    void this.shutdown()
  }

  private bind(rt: WorkspaceRuntime) {
    rt.proc?.stdout?.on("data", (buf) => {
      this.log(rt, String(buf).trimEnd())
    })

    rt.proc?.stderr?.on("data", (buf) => {
      this.log(rt, String(buf).trimEnd())
    })

    rt.proc?.on("exit", (code, signal) => {
      const cur = this.state.get(rt.workspaceId)

      if (!cur || cur.proc !== rt.proc) {
        return
      }

       if (cur.state === "stopping") {
        return
      }

      cur.state = "stopped"
      cur.sdk = undefined
      cur.err = code === 0 ? undefined : `exit code=${code ?? "unknown"} signal=${signal ?? "none"}`
      this.log(cur, `server exited code=${code ?? "unknown"} signal=${signal ?? "none"}`)
      this.fire()
    })

    rt.proc?.on("error", (err) => {
      const cur = this.state.get(rt.workspaceId)

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

  private async ensureNow(folder: vscode.WorkspaceFolder) {
    const id = workspaceId(folder)
    const dir = folder.uri.fsPath
    const cur = this.state.get(id)

    if (this.shuttingDown) {
      return cur
    }

    if (cur && (cur.state === "starting" || cur.state === "ready")) {
      return cur
    }

    if (cur?.proc) {
      await stop(cur.proc)
    }

    const port = await freeport()
    const url = `http://127.0.0.1:${port}`
    const proc = spawn(dir, port)
    const startup = startupFailure(proc)
    const rt: WorkspaceRuntime = {
      workspaceId: id,
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

    this.state.set(id, rt)
    this.dirIndex.set(dir, id)
    this.log(rt, `starting server on ${url} for ${hostLabel(folder)} cwd=${dir}`)
    this.bind(rt)
    this.fire()

    try {
      await Promise.race([health(url, 800, 25), startup.promise])
      const live = this.state.get(id)
      if (live !== rt || rt.state === "stopping") {
        startup.dispose()
        return live
      }
      startup.dispose()
      rt.sdk = await client(url, dir)
      rt.state = "ready"
      rt.err = undefined
      this.log(rt, `server ready on ${hostLabel(folder)}`)
    } catch (err) {
      startup.dispose()
      const live = this.state.get(id)
      if (live !== rt || rt.state === "stopping") {
        return live
      }
      rt.state = "error"
      rt.sdk = undefined
      rt.err = text(err)
      this.log(rt, `server failed: ${rt.err}`)
    }

    this.fire()
    return this.state.get(id)
  }

  private async removeNow(id: string) {
    const rt = this.state.get(id)

    if (!rt) {
      return
    }

    rt.state = "stopping"
    rt.sdk = undefined
    rt.err = undefined
    this.fire()
    await stop(rt.proc)

    if (this.state.get(id) === rt) {
      this.state.delete(id)
      this.dirIndex.delete(rt.dir)
      this.fire()
    }
    this.log(rt, "server stopped")
  }

  private async serialize<T>(dir: string, run: () => Promise<T>) {
    const prev = this.ops.get(dir) || Promise.resolve()
    const next = prev
      .catch(() => {})
      .then(run)
    this.ops.set(dir, next)
    try {
      return await next
    } finally {
      if (this.ops.get(dir) === next) {
        this.ops.delete(dir)
      }
    }
  }
}

function workspaceId(folder: vscode.WorkspaceFolder) {
  return folder.uri.toString()
}

function text(err: unknown) {
  if (err instanceof Error) {
    return err.message
  }

  return String(err)
}

function hostLabel(folder: vscode.WorkspaceFolder) {
  const remote = vscode.env.remoteName || "local"
  return `${folder.uri.scheme}:${folder.name} host=${remote}`
}
