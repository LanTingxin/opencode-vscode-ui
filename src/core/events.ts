import * as vscode from "vscode"
import type { SessionEvent } from "./sdk"
import { WorkspaceManager } from "./workspace"

export type WorkspaceEvent = {
  workspaceId: string
  dir: string
  event: SessionEvent
}

export class EventHub implements vscode.Disposable {
  private readonly bag: vscode.Disposable[] = []
  private readonly ctrls = new Map<string, AbortController>()
  private readonly change = new vscode.EventEmitter<WorkspaceEvent>()

  readonly onDidEvent = this.change.event

  constructor(
    private mgr: WorkspaceManager,
    private out: vscode.OutputChannel,
  ) {
    this.bag.push(
      this.mgr.onDidChange(() => {
        void this.sync()
      }),
    )
  }

  async sync() {
    const ids = new Set(this.mgr.list().map((item) => item.workspaceId))

    for (const [workspaceId, ctrl] of this.ctrls) {
      if (ids.has(workspaceId)) {
        continue
      }
      ctrl.abort()
      this.ctrls.delete(workspaceId)
    }

    for (const rt of this.mgr.list()) {
      if (rt.state !== "ready" || !rt.sdk || this.ctrls.has(rt.workspaceId)) {
        continue
      }
      const ctrl = new AbortController()
      this.ctrls.set(rt.workspaceId, ctrl)
      void this.loop(rt.workspaceId, ctrl)
    }
  }

  dispose() {
    for (const ctrl of this.ctrls.values()) {
      ctrl.abort()
    }
    this.ctrls.clear()
    this.change.dispose()
    vscode.Disposable.from(...this.bag).dispose()
  }

  private async loop(workspaceId: string, ctrl: AbortController) {
    while (!ctrl.signal.aborted) {
      const rt = this.mgr.get(workspaceId)

      if (!rt || rt.state !== "ready" || !rt.sdk) {
        break
      }

      try {
        this.log(workspaceId, "subscribing to /event")
        const res = await rt.sdk.event.subscribe(
          {
            directory: rt.dir,
          },
          {
            signal: ctrl.signal,
            onSseError: (err) => {
              if (ctrl.signal.aborted) {
                return
              }
              this.log(workspaceId, `event stream error: ${text(err)}`)
            },
          },
        )

        for await (const item of res.stream) {
          if (ctrl.signal.aborted) {
            break
          }

          if (!item) {
            continue
          }

          this.change.fire({
            workspaceId: rt.workspaceId,
            dir: rt.dir,
            event: item,
          })
        }
      } catch (err) {
        if (!ctrl.signal.aborted) {
          this.log(workspaceId, `event stream failed: ${text(err)}`)
          await wait(400)
        }
      }
    }

    const cur = this.ctrls.get(workspaceId)
    if (cur === ctrl) {
      this.ctrls.delete(workspaceId)
    }
  }

  private log(workspaceId: string, message: string) {
    const rt = this.mgr.get(workspaceId)
    this.out.appendLine(`[events ${rt?.name || workspaceId}] ${message}`)
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function text(err: unknown) {
  if (err instanceof Error) {
    return err.message
  }

  return String(err)
}
