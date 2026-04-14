import * as vscode from "vscode"
import { displaySessionTitle } from "../core/session-titles"
import { FocusedSessionStore } from "./focused"
import { sidebarViewHtml } from "./html"
import type { SidebarHostMessage, SidebarViewMode, SidebarWebviewMessage } from "./view-types"
import { openFile } from "../panel/provider/files"

export class SidebarViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly bag: vscode.Disposable[] = []
  private view: vscode.WebviewView | undefined

  constructor(
    private extensionUri: vscode.Uri,
    private mode: SidebarViewMode,
    private focused: FocusedSessionStore,
  ) {
    this.bag.push(this.focused.onDidChange(() => {
      void this.post()
    }))
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist")],
    }
    view.webview.html = sidebarViewHtml(view.webview, this.extensionUri, this.mode)
    view.webview.onDidReceiveMessage((message: SidebarWebviewMessage) => {
      if (message.type === "ready") {
        void this.post()
        return
      }

      if (message.type === "openFile") {
        const ref = this.focused.snapshot().ref
        if (!ref) {
          return
        }

        void openFile(ref, message.filePath)
        return
      }

      if (message.type === "openSession") {
        void vscode.commands.executeCommand("opencode-ui.openSessionById", {
          workspaceId: message.workspaceId,
          dir: message.dir,
        }, message.sessionId)
      }
    }, undefined, this.bag)
  }

  dispose() {
    vscode.Disposable.from(...this.bag).dispose()
  }

  private async post() {
    if (!this.view) {
      return
    }

    const state = this.focused.snapshot()
    const message: SidebarHostMessage = {
      type: "state",
      payload: {
        status: state.status,
        mode: this.mode,
        sessionTitle: displaySessionTitle(state.session?.title, state.session?.id?.slice(0, 8) || "session"),
        sessionRef: state.ref,
        todos: state.todos,
        diff: state.diff,
        branch: state.branch,
        defaultBranch: state.defaultBranch,
        workspaceFileSummary: state.workspaceFileSummary,
        error: state.error,
      },
    }
    await this.view.webview.postMessage(message)
  }
}
