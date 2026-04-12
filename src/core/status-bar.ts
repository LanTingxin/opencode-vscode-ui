import * as vscode from "vscode"
import type { RuntimeState } from "./server"
import { WorkspaceManager } from "./workspace"
import { SessionPanelManager } from "../panel/provider"

type RuntimeChoice = {
  workspaceId: string
  state: RuntimeState
}

export function deriveStatusBarState(input: {
  activeSessionTitle?: string
  activeSessionBusy?: boolean
  runtimeState?: RuntimeState
}) {
  if (input.activeSessionTitle) {
    return {
      text: `${input.activeSessionBusy ? "$(loading~spin)" : "$(comment-discussion)"} OpenCode ${input.activeSessionTitle}`,
      tooltip: input.activeSessionBusy ? `Open active session: ${input.activeSessionTitle} (busy)` : `Open active session: ${input.activeSessionTitle}`,
      command: "opencode-ui.statusBarAction",
      busy: !!input.activeSessionBusy,
    }
  }

  if (input.runtimeState === "starting") {
    return {
      text: "$(sync) OpenCode starting",
      tooltip: "OpenCode runtime is starting",
      command: "opencode-ui.statusBarAction",
      busy: false,
    }
  }

  if (input.runtimeState === "error") {
    return {
      text: "$(warning) OpenCode unavailable",
      tooltip: "OpenCode runtime needs attention",
      command: "opencode-ui.statusBarAction",
      busy: false,
    }
  }

  return {
    text: "$(comment-discussion) OpenCode",
    tooltip: "Open OpenCode",
    command: "opencode-ui.statusBarAction",
    busy: false,
  }
}

export class OpenCodeStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10)
  private readonly bag: vscode.Disposable[] = []

  constructor(
    private mgr: WorkspaceManager,
    private panels: SessionPanelManager,
  ) {
    this.item.name = "OpenCode"
    this.item.command = "opencode-ui.statusBarAction"

    this.bag.push(
      this.mgr.onDidChange(() => {
        this.update()
      }),
      this.panels.onDidChangeActiveSession(() => {
        this.update()
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.update()
      }),
    )

    this.update()
    this.item.show()
  }

  dispose() {
    vscode.Disposable.from(...this.bag).dispose()
    this.item.dispose()
  }

  private update() {
    const state = this.currentState()
    this.item.text = state.text
    this.item.tooltip = state.tooltip
    this.item.command = state.command
    this.item.show()
  }

  private currentState() {
    const active = this.panels.activeSession()

    if (active) {
      const rt = this.mgr.get(active.workspaceId)
      const session = rt?.sessions.get(active.sessionId)
      const status = rt?.sessionStatuses.get(active.sessionId)
      return deriveStatusBarState({
        activeSessionTitle: session?.title || active.sessionId,
        activeSessionBusy: status?.type === "busy",
        runtimeState: rt?.state,
      })
    }

    const runtime = pickPreferredRuntime(this.mgr.list(), activeEditorWorkspaceId())
    return deriveStatusBarState({
      runtimeState: runtime?.state,
    })
  }
}

export function pickPreferredRuntime(runtimes: RuntimeChoice[], activeWorkspaceId?: string) {
  if (activeWorkspaceId) {
    const activeRuntime = runtimes.find((rt) => rt.workspaceId === activeWorkspaceId)
    if (activeRuntime) {
      return activeRuntime
    }
  }

  return runtimes[0]
}

function activeEditorWorkspaceId() {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return undefined
  }

  const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri)
  return folder?.uri.toString()
}
