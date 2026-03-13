import * as vscode from "vscode"
import type { SessionInfo } from "./sdk"
import { WorkspaceManager } from "./workspace"

export class SessionStore implements vscode.Disposable {
  private seen = new Set<string>()

  constructor(
    private mgr: WorkspaceManager,
    private out: vscode.OutputChannel,
  ) {
    this.mgr.onDidChange(() => {
      void this.sync()
    })
  }

  list(workspaceId: string) {
    const rt = this.mgr.get(workspaceId)

    if (!rt) {
      return []
    }

    return [...rt.sessions.values()].sort((a, b) => b.time.updated - a.time.updated)
  }

  async refresh(workspaceId: string, quiet?: boolean) {
    const rt = this.mgr.get(workspaceId)

    if (!rt || rt.state !== "ready" || !rt.sdk) {
      return []
    }

    rt.sessionsState = "loading"
    rt.sessionsErr = undefined
    this.mgr.invalidate()

    try {
      const res = await rt.sdk.session.list({
        directory: rt.dir,
        roots: true,
      })
      const list = res.data ?? []
      rt.sessions = new Map(list.map((item: SessionInfo) => [item.id, item]))
      rt.sessionsState = "ready"
      rt.sessionsErr = undefined
      this.seen.add(rt.workspaceId)
      this.log(rt.name, `loaded ${list.length} sessions`)
      return list
    } catch (err) {
      rt.sessionsState = "error"
      rt.sessionsErr = text(err)
      this.log(rt.name, `session list failed: ${rt.sessionsErr}`)
      if (!quiet) {
        await vscode.window.showErrorMessage(`OpenCode session list failed for ${rt.name}: ${rt.sessionsErr}`)
      }
      return []
    } finally {
      this.mgr.invalidate()
    }
  }

  async refreshAll() {
    await Promise.all(this.mgr.list().map((rt) => this.refresh(rt.workspaceId, true)))
    this.mgr.invalidate()
  }

  async create(workspaceId: string) {
    const rt = this.mgr.get(workspaceId)

    if (!rt || rt.state !== "ready" || !rt.sdk) {
      throw new Error("workspace server is not ready")
    }

    try {
      const res = await rt.sdk.session.create({ directory: rt.dir })
      const item = res.data

      if (!item) {
        throw new Error("session create returned no data")
      }

      rt.sessions.set(item.id, item)
      rt.sessionsState = "ready"
      rt.sessionsErr = undefined
      this.mgr.invalidate()
      this.log(rt.name, `created session ${item.id}`)
      await this.refresh(rt.workspaceId, true)
      return item
    } catch (err) {
      const msg = text(err)
      this.log(rt.name, `session create failed: ${msg}`)
      await vscode.window.showErrorMessage(`OpenCode session create failed for ${rt.name}: ${msg}`)
      throw err
    }
  }

  async delete(workspaceId: string, sessionID: string) {
    const rt = this.mgr.get(workspaceId)

    if (!rt || rt.state !== "ready" || !rt.sdk) {
      throw new Error("workspace server is not ready")
    }

    try {
      await rt.sdk.session.delete({
        sessionID,
        directory: rt.dir,
      })
      rt.sessions.delete(sessionID)
      rt.sessionsState = "ready"
      rt.sessionsErr = undefined
      this.mgr.invalidate()
      this.log(rt.name, `deleted session ${sessionID}`)
      return true
    } catch (err) {
      const msg = text(err)
      this.log(rt.name, `session delete failed: ${msg}`)
      await vscode.window.showErrorMessage(`OpenCode session delete failed for ${rt.name}: ${msg}`)
      throw err
    }
  }

  dispose() {}

  private async sync() {
    const ids = new Set(this.mgr.list().map((rt) => rt.workspaceId))

    this.seen = new Set([...this.seen].filter((workspaceId) => ids.has(workspaceId)))

    await Promise.all(
      this.mgr
        .list()
        .filter((rt) => rt.state === "ready" && rt.sdk && !this.seen.has(rt.workspaceId) && rt.sessionsState !== "loading")
        .map((rt) => this.refresh(rt.workspaceId, true)),
    )
  }

  private log(name: string, msg: string) {
    this.out.appendLine(`[${name}] ${msg}`)
  }
}

function text(err: unknown) {
  if (err instanceof Error) {
    return err.message
  }

  return String(err)
}
