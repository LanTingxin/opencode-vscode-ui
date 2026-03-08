import * as vscode from "vscode"
import { SESSION_PANEL_VIEW_TYPE } from "./bridge/types"
import { commands } from "./core/commands"
import { EventHub } from "./core/events"
import { SessionStore } from "./core/session"
import { TabManager } from "./core/tabs"
import { WorkspaceManager } from "./core/workspace"
import { SessionPanelManager } from "./panel/provider"
import { SessionPanelSerializer } from "./panel/serializer"
import { SidebarProvider } from "./sidebar/provider"

let mgr: WorkspaceManager | undefined

export async function activate(ctx: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel("OpenCode UI")
  mgr = new WorkspaceManager(out)
  const sessions = new SessionStore(mgr, out)
  const events = new EventHub(mgr, out)
  const panels = new SessionPanelManager(mgr, events, out)
  const tabs = new TabManager(panels)

  const tree = new SidebarProvider(mgr, sessions)
  const reg = vscode.window.registerTreeDataProvider("opencode-ui.sessions", tree)
  const serializer = vscode.window.registerWebviewPanelSerializer(
    SESSION_PANEL_VIEW_TYPE,
    new SessionPanelSerializer(panels),
  )

  commands(ctx, mgr, sessions, out, tabs)

  ctx.subscriptions.push(out, mgr, sessions, events, panels, tree, reg, serializer)
  out.appendLine("OpenCode UI activated")

  const folders = vscode.workspace.workspaceFolders ?? []
  await mgr.sync(folders)
  await events.sync()

  ctx.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await mgr?.sync(vscode.workspace.workspaceFolders ?? [])
      await events.sync()
    }),
  )
}

export function deactivate() {
  mgr?.dispose()
  mgr = undefined
}
