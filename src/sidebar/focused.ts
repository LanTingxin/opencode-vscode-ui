import * as vscode from "vscode"
import type { SessionPanelRef } from "../bridge/types"
import { EventHub } from "../core/events"
import type { Client, FileDiff, SessionEvent, SessionInfo, Todo, WorkspaceFileStatus } from "../core/sdk"
import { WorkspaceManager } from "../core/workspace"
import { SessionPanelManager } from "../panel/provider"

export type FocusedSessionState = {
  status: "idle" | "loading" | "ready" | "error"
  ref?: SessionPanelRef
  session?: SessionInfo
  todos: Todo[]
  diff: FileDiff[]
  branch?: string
  defaultBranch?: string
  workspaceFileStatus: WorkspaceFileStatus[]
  workspaceFileSummary?: {
    added: number
    deleted: number
    modified: number
  }
  error?: string
}

const idleState: FocusedSessionState = {
  status: "idle",
  todos: [],
  diff: [],
  workspaceFileStatus: [],
}

export class FocusedSessionStore implements vscode.Disposable {
  private readonly change = new vscode.EventEmitter<void>()
  private state: FocusedSessionState = idleState
  private run = 0

  readonly onDidChange = this.change.event

  constructor(
    private mgr: WorkspaceManager,
    private panels: SessionPanelManager,
    private events: EventHub,
    private out: vscode.OutputChannel,
  ) {
    this.panels.onDidChangeActiveSession((ref) => {
      void this.focus(ref)
    })

    this.events.onDidEvent((item) => {
      void this.handle(item.workspaceId, item.event)
    })

    this.mgr.onDidChange(() => {
      const ref = this.state.ref
      if (!ref) {
        return
      }

      const rt = this.mgr.get(ref.workspaceId)
      if (rt?.state === "ready" && rt.sdk) {
        if (this.state.status === "loading") {
          void this.focus(ref)
        }
        return
      }

      if (!rt || (rt.state !== "ready" && this.state.status !== "loading")) {
        this.set({
          status: "loading",
          ref,
          session: this.state.session,
          todos: [],
          diff: [],
          workspaceFileStatus: [],
        })
      }
    })

    void this.focus(this.panels.activeSession())
  }

  snapshot() {
    return this.state
  }

  dispose() {
    this.change.dispose()
  }

  private async focus(ref?: SessionPanelRef) {
    if (!ref) {
      this.set(idleState)
      return
    }

    const run = ++this.run
    this.set({
      status: "loading",
      ref,
      session: this.state.session?.id === ref.sessionId ? this.state.session : undefined,
      todos: [],
      diff: [],
      workspaceFileStatus: [],
    })

    const rt = this.mgr.get(ref.workspaceId)
    if (!rt || rt.state !== "ready" || !rt.sdk) {
      this.set({
        status: "loading",
        ref,
        session: this.state.session?.id === ref.sessionId ? this.state.session : undefined,
        todos: [],
        diff: [],
        workspaceFileStatus: [],
      })
      return
    }

    try {
      const loaded = await loadFocusedSessionState({
        ref,
        runtime: {
          dir: rt.dir,
          sdk: rt.sdk,
        },
      })

      if (run !== this.run || !sameRef(this.state.ref, ref)) {
        return
      }

      this.set({
        status: "ready",
        ref,
        ...loaded,
      })
    } catch (err) {
      const message = text(err)
      this.log(`focused session load failed: ${message}`)
      if (run !== this.run || !sameRef(this.state.ref, ref)) {
        return
      }
      this.set({
        status: "error",
        ref,
        todos: [],
        diff: [],
        workspaceFileStatus: [],
        error: message,
      })
    }
  }

  private async handle(workspaceId: string, event: SessionEvent) {
    const ref = this.state.ref
    if (!ref || ref.workspaceId !== workspaceId) {
      return
    }

    if (event.type === "server.instance.disposed") {
      await this.focus(ref)
      return
    }

    if (event.type === "todo.updated") {
      const props = event.properties as { sessionID: string; todos: Todo[] }
      if (props.sessionID !== ref.sessionId) {
        return
      }
      this.set({
        ...this.state,
        status: "ready",
        todos: props.todos,
      })
      return
    }

    if (event.type === "session.diff") {
      const props = event.properties as { sessionID: string; diff: FileDiff[] }
      if (props.sessionID !== ref.sessionId) {
        return
      }
      this.set({
        ...this.state,
        status: "ready",
        diff: props.diff,
      })
      return
    }

    if (event.type === "session.updated" || event.type === "session.created") {
      const props = event.properties as { info: SessionInfo }
      if (props.info?.id !== ref.sessionId) {
        return
      }
      this.set({
        ...this.state,
        session: props.info,
      })
      return
    }

    if (event.type === "session.deleted") {
      const props = event.properties as { info: SessionInfo }
      if (props.info?.id !== ref.sessionId) {
        return
      }
      this.set({
        status: "idle",
        todos: [],
        diff: [],
        workspaceFileStatus: [],
      })
    }
  }

  private set(next: FocusedSessionState) {
    this.state = next
    this.change.fire()
  }

  private log(message: string) {
    this.out.appendLine(`[focused-session] ${message}`)
  }
}

export async function loadFocusedSessionState(input: {
  ref: SessionPanelRef
  runtime: {
    dir: string
    sdk: Client
  }
}) {
  const [sessionRes, todoRes, diffRes, vcsRes, fileStatusRes] = await Promise.all([
    input.runtime.sdk.session.get({
      sessionID: input.ref.sessionId,
      directory: input.ref.dir,
    }),
    input.runtime.sdk.session.todo({
      sessionID: input.ref.sessionId,
      directory: input.ref.dir,
    }),
    input.runtime.sdk.session.diff({
      sessionID: input.ref.sessionId,
      directory: input.ref.dir,
    }),
    input.runtime.sdk.vcs.get({
      directory: input.ref.dir,
    }),
    input.runtime.sdk.file.status({
      directory: input.ref.dir,
    }),
  ])

  const workspaceFileStatus = fileStatusRes.data ?? []
  return {
    session: sessionRes.data,
    todos: todoRes.data ?? [],
    diff: diffRes.data ?? [],
    branch: vcsRes.data?.branch,
    defaultBranch: vcsRes.data?.default_branch,
    workspaceFileStatus,
    workspaceFileSummary: summarizeWorkspaceFileStatus(workspaceFileStatus),
  }
}

function summarizeWorkspaceFileStatus(files: WorkspaceFileStatus[]) {
  if (files.length === 0) {
    return undefined
  }

  return files.reduce((summary, item) => {
    if (item.status === "added") {
      summary.added += 1
    } else if (item.status === "deleted") {
      summary.deleted += 1
    } else {
      summary.modified += 1
    }
    return summary
  }, {
    added: 0,
    deleted: 0,
    modified: 0,
  })
}

function sameRef(a?: SessionPanelRef, b?: SessionPanelRef) {
  return a?.workspaceId === b?.workspaceId && a?.sessionId === b?.sessionId
}

function text(err: unknown) {
  if (err instanceof Error) {
    return err.message
  }

  return String(err)
}
