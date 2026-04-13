import * as vscode from "vscode"
import { SESSION_PANEL_VIEW_TYPE, type ComposerPromptPart, type SessionPanelRef } from "../../bridge/types"
import { EventHub } from "../../core/events"
import { WorkspaceManager } from "../../core/workspace"
import { sessionPanelHtml } from "../html"
import { SessionPanelController } from "./controller"
import { canRestoreRef, panelIconPath, panelKey, panelTitle, reviveState } from "./utils"

export class SessionPanelManager implements vscode.Disposable {
  private readonly panels = new Map<string, SessionPanelController>()
  private readonly active = new vscode.EventEmitter<SessionPanelRef | undefined>()
  private currentRef: SessionPanelRef | undefined

  readonly onDidChangeActiveSession = this.active.event

  constructor(
    private extensionUri: vscode.Uri,
    private mgr: WorkspaceManager,
    private events: EventHub,
    private out: vscode.OutputChannel,
  ) {}

  async open(ref: SessionPanelRef, viewColumn?: vscode.ViewColumn) {
    const key = panelKey(ref)
    const existing = this.panels.get(key)

    if (existing) {
      this.touch(key, existing)
      await existing.reveal()
      return existing.panel
    }

    const controller = this.createController(ref, viewColumn)
    await controller.push()
    return controller.panel
  }

  async openWithSeed(ref: SessionPanelRef, parts: ComposerPromptPart[], viewColumn?: vscode.ViewColumn) {
    const key = panelKey(ref)
    const existing = this.panels.get(key)

    if (existing) {
      this.touch(key, existing)
      await existing.reveal()
      await existing.seedComposer(parts)
      return existing.panel
    }

    const controller = this.createController(ref, viewColumn)
    await controller.seedComposer(parts)
    await controller.push()
    return controller.panel
  }

  async retarget(currentRef: SessionPanelRef, nextRef: SessionPanelRef) {
    const currentKey = panelKey(currentRef)
    const nextKey = panelKey(nextRef)
    const current = this.panels.get(currentKey)

    if (!current) {
      return this.open(nextRef)
    }

    if (currentKey === nextKey) {
      this.touch(currentKey, current)
      await current.reveal()
      return current.panel
    }

    const existing = this.panels.get(nextKey)
    if (existing && existing !== current) {
      existing.panel.dispose()
    }

    this.panels.delete(currentKey)
    await current.retarget(nextRef, nextKey)
    this.panels.set(nextKey, current)

    if (panelKey(this.currentRef) === currentKey) {
      this.setActive(nextRef)
    }

    return current.panel
  }

  async restore(panel: vscode.WebviewPanel, state: unknown) {
    const ref = reviveState(state)

    if (!ref) {
      panel.webview.html = sessionPanelHtml(panel.webview, this.extensionUri)
      panel.title = panelTitle("unknown")
      panel.iconPath = panelIconPath(this.extensionUri)
      this.out.appendLine("[panel] skipped restore due to invalid state")
      return
    }

    if (!canRestoreRef(ref, vscode.workspace.workspaceFolders)) {
      panel.webview.html = sessionPanelHtml(panel.webview, this.extensionUri)
      panel.title = panelTitle(ref.sessionId)
      panel.iconPath = panelIconPath(this.extensionUri)
      this.out.appendLine(`[panel] skipped restore because workspace is unavailable: ${ref.workspaceId}`)
      return
    }

    const controller = this.attach(ref, panel)
    await controller.push()
  }

  activeSession() {
    return this.currentRef
  }

  recentSession(workspaceId: string) {
    const controllers = [...this.panels.values()]

    for (let index = controllers.length - 1; index >= 0; index -= 1) {
      const ref = controllers[index]?.ref
      if (ref?.workspaceId === workspaceId) {
        return ref
      }
    }

    return undefined
  }

  visibleSession(workspaceId: string) {
    const controllers = [...this.panels.values()]

    for (let index = controllers.length - 1; index >= 0; index -= 1) {
      const controller = controllers[index]
      if (controller?.ref.workspaceId === workspaceId && controller.panel.visible) {
        return controller.ref
      }
    }

    return undefined
  }

  close(ref: SessionPanelRef) {
    const key = panelKey(ref)
    const controller = this.panels.get(key)

    if (!controller) {
      return false
    }

    controller.panel.dispose()
    return true
  }

  dispose() {
    for (const controller of this.panels.values()) {
      controller.dispose()
    }
    this.panels.clear()
    this.active.dispose()
  }

  private attach(ref: SessionPanelRef, panel: vscode.WebviewPanel) {
    const key = panelKey(ref)
    const controller = new SessionPanelController(
      this.extensionUri,
      ref,
      key,
      panel,
      this.mgr,
      this.events,
      this.out,
      (next) => {
        this.setActive(next)
      },
      (disposedKey) => {
        this.panels.delete(disposedKey)
        if (panelKey(this.currentRef) === disposedKey) {
          this.setActive(undefined)
        }
      },
    )
    this.panels.set(key, controller)
    if (panel.active) {
      this.setActive(ref)
    }
    return controller
  }

  private createController(ref: SessionPanelRef, viewColumn?: vscode.ViewColumn) {
    const panel = vscode.window.createWebviewPanel(SESSION_PANEL_VIEW_TYPE, panelTitle(ref.sessionId), viewColumn ?? vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist")],
    })

    return this.attach(ref, panel)
  }

  private setActive(ref: SessionPanelRef | undefined) {
    if (ref) {
      const key = panelKey(ref)
      const controller = this.panels.get(key)
      if (controller) {
        this.touch(key, controller)
      }
    }

    if (panelKey(this.currentRef) === panelKey(ref)) {
      return
    }

    this.currentRef = ref
    this.active.fire(ref)
  }

  private touch(key: string, controller: SessionPanelController) {
    this.panels.delete(key)
    this.panels.set(key, controller)
  }
}
