import * as vscode from "vscode"
import { SESSION_PANEL_VIEW_TYPE } from "./bridge/types"
import { CapabilityStore, createEmptyCapabilities, probeRuntimeCapabilities } from "./core/capabilities"
import { commands } from "./core/commands"
import { EventHub } from "./core/events"
import { affectsHttpProxySetting, proxyRestartMessage } from "./core/settings"
import { OpenCodeStatusBar } from "./core/status-bar"
import { SessionTagStore } from "./core/session-tags"
import { SessionStore } from "./core/session"
import { TabManager } from "./core/tabs"
import { WorkspaceManager } from "./core/workspace"
import { SessionPanelManager } from "./panel/provider"
import { SessionPanelSerializer } from "./panel/serializer"
import { FocusedSessionStore } from "./sidebar/focused"
import { SessionItem } from "./sidebar/item"
import { SidebarProvider } from "./sidebar/provider"
import { syncTreeSelectionToActiveSession } from "./sidebar/tree-sync"
import { SidebarViewProvider } from "./sidebar/view-provider"
import { SessionViewProvider } from "./sidebar/session-view-provider"

let mgr: WorkspaceManager | undefined

export async function activate(ctx: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel("OpenCode UI")
  out.appendLine(`OpenCode UI activating (remote=${vscode.env.remoteName || "local"}, uiKind=${vscode.UIKind[vscode.env.uiKind]})`)
  const workspaceMgr = new WorkspaceManager(out)
  mgr = workspaceMgr
  const events = new EventHub(workspaceMgr, out)
  const sessions = new SessionStore(workspaceMgr, events, out)
  const panels = new SessionPanelManager(ctx.extensionUri, workspaceMgr, events, out)
  const tabs = new TabManager(panels)
  const focused = new FocusedSessionStore(workspaceMgr, panels, events, out)
  const tags = new SessionTagStore(ctx.workspaceState)
  const capabilities = new CapabilityStore({
    probe: async (workspaceId) => {
      const rt = workspaceMgr.get(workspaceId)
      if (!rt || rt.state !== "ready" || !rt.sdk) {
        return createEmptyCapabilities()
      }

      return await probeRuntimeCapabilities(rt)
    },
  })
  const statusBar = new OpenCodeStatusBar(workspaceMgr, panels)

  const tree = new SidebarProvider(workspaceMgr, sessions, tags)
  const todoView = new SidebarViewProvider(ctx.extensionUri, "todo", focused)
  const diffView = new SidebarViewProvider(ctx.extensionUri, "diff", focused)
  const sessionView = new SessionViewProvider(ctx.extensionUri, workspaceMgr, events, focused, out)
  const treeView = vscode.window.createTreeView("opencode-ui.sessions", {
    treeDataProvider: tree,
  })
  const treeSelectionReg = treeView.onDidChangeSelection(({ selection }) => {
    const item = selection[0]
    if (!(item instanceof SessionItem)) {
      return
    }

    focused.selectSession({
      workspaceId: item.runtime.workspaceId,
      dir: item.runtime.dir,
      sessionId: item.session.id,
    })
  })
  const treeActiveSyncReg = panels.onDidChangeActiveSession((ref) => {
    void syncTreeSelectionToActiveSession({
      ref,
      tree,
      treeView,
    })
  })
  const treeVisibilityReg = treeView.onDidChangeVisibility(({ visible }) => {
    if (!visible) {
      return
    }

    void syncTreeSelectionToActiveSession({
      ref: panels.activeSession(),
      tree,
      treeView,
    })
  })
  const todoReg = vscode.window.registerWebviewViewProvider("opencode-ui.todo", todoView)
  const diffReg = vscode.window.registerWebviewViewProvider("opencode-ui.diff", diffView)
  const sessionViewReg = vscode.window.registerWebviewViewProvider("opencode-ui.sessionView", sessionView, {
    webviewOptions: { retainContextWhenHidden: true },
  })
  const serializer = vscode.window.registerWebviewPanelSerializer(
    SESSION_PANEL_VIEW_TYPE,
    new SessionPanelSerializer(panels),
  )

  commands(ctx, workspaceMgr, sessions, out, tabs, panels, capabilities, tags, tree)

  ctx.subscriptions.push(out, workspaceMgr, sessions, events, panels, focused, capabilities, statusBar, tree, todoView, diffView, sessionView, treeView, treeSelectionReg, treeActiveSyncReg, treeVisibilityReg, todoReg, diffReg, sessionViewReg, serializer)
  out.appendLine("OpenCode UI activated")

  const folders = vscode.workspace.workspaceFolders ?? []
  await workspaceMgr.sync(folders)
  await sessions.refreshAll()
  await events.sync()

  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (!affectsHttpProxySetting(event)) {
        return
      }

      const action = await vscode.window.showInformationMessage(proxyRestartMessage(), "Reload Window")
      if (action === "Reload Window") {
        await vscode.commands.executeCommand("workbench.action.reloadWindow")
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await mgr?.sync(vscode.workspace.workspaceFolders ?? [])
      await events.sync()
    }),
  )
}

export async function deactivate() {
  await mgr?.shutdown()
  mgr?.dispose()
  mgr = undefined
}
