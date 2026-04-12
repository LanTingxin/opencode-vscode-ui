import * as vscode from "vscode"
import type { WorkspaceRef } from "../bridge/types"
import { openSettingsQuery } from "./settings"
import { checkOpencodeAvailable, runtimeNotReadyMessage } from "./runtime-errors"
import { SessionItem, WorkspaceItem } from "../sidebar/item"
import type { WorkspaceRuntime } from "./server"
import { SessionStore } from "./session"
import { TabManager } from "./tabs"
import { WorkspaceManager } from "./workspace"
import { SessionPanelManager } from "../panel/provider"
import { buildEditorSeed, buildExplorerSeed, type LaunchSeed } from "./launch-context"
import { CapabilityStore } from "./capabilities"

export function commands(
  ctx: vscode.ExtensionContext,
  mgr: WorkspaceManager,
  sessions: SessionStore,
  out: vscode.OutputChannel,
  tabs: TabManager,
  panels: SessionPanelManager,
  capabilities: CapabilityStore,
) {
  ctx.subscriptions.push(
    vscode.commands.registerCommand("opencode-ui.refresh", async () => {
      const folders = vscode.workspace.workspaceFolders ?? []
      await mgr.sync(folders)
      await sessions.refreshAll()
    }),
    vscode.commands.registerCommand("opencode-ui.openOutput", () => {
      out.show(true)
    }),
    vscode.commands.registerCommand("opencode-ui.openSettings", async () => {
      await vscode.commands.executeCommand("workbench.action.openSettings", openSettingsQuery())
    }),
    vscode.commands.registerCommand("opencode-ui.openProviderDocs", async () => {
      await vscode.env.openExternal(vscode.Uri.parse("https://opencode.ai/docs"))
    }),
    vscode.commands.registerCommand("opencode-ui.checkEnvironment", async () => {
      const host = vscode.env.remoteName || "local"
      const result = await checkOpencodeAvailable()

      if (result.ok) {
        await vscode.window.showInformationMessage(`opencode is available on the current ${host} host: ${result.output}`)
        return
      }

      await vscode.window.showErrorMessage(`OpenCode UI environment check failed on ${host}: ${result.message}`)
    }),
    vscode.commands.registerCommand("opencode-ui.newSession", async (item?: WorkspaceItem) => {
      const rt = item?.runtime ?? firstRuntime(mgr)

      if (!rt) {
        await vscode.window.showInformationMessage("Open a workspace folder first.")
        return
      }

      if (!rt || rt.state !== "ready") {
        await vscode.window.showErrorMessage(runtimeNotReadyMessage(rt))
        return
      }

      await vscode.commands.executeCommand("opencode-ui.newSessionAndOpen", workspaceRef(rt))
    }),
    vscode.commands.registerCommand("opencode-ui.newSessionAndOpen", async (workspace?: WorkspaceRef) => {
      const rt = workspace ? mgr.get(workspace.workspaceId) : firstRuntime(mgr)

      if (!rt) {
        await vscode.window.showInformationMessage("Open a workspace folder first.")
        return
      }

      if (!rt || rt.state !== "ready") {
        await vscode.window.showErrorMessage(runtimeNotReadyMessage(rt))
        return
      }

      const session = await sessions.create(rt.workspaceId)
      await vscode.commands.executeCommand("opencode-ui.openSessionById", workspaceRef(rt), session.id)
    }),
    vscode.commands.registerCommand("opencode-ui.restartWorkspaceServer", async (item?: WorkspaceItem) => {
      const rt = item?.runtime

      if (!rt) {
        await vscode.window.showInformationMessage("Pick a workspace item to restart its server.")
        return
      }

      capabilities.clear(rt.workspaceId)
      await mgr.restart(rt.workspaceId)
      await sessions.refresh(rt.workspaceId, true)
    }),
    vscode.commands.registerCommand("opencode-ui.refreshWorkspaceSessions", async (item?: WorkspaceItem) => {
      const rt = item?.runtime

      if (!rt) {
        await vscode.window.showInformationMessage("Pick a workspace item to refresh its sessions.")
        return
      }

      await sessions.refresh(rt.workspaceId)
    }),
    vscode.commands.registerCommand("opencode-ui.openSession", async (item?: SessionItem) => {
      if (!item) {
        await vscode.window.showInformationMessage("Pick a session item first.")
        return
      }

      await tabs.openSession(workspaceRef(item.runtime), item.session)
    }),
    vscode.commands.registerCommand("opencode-ui.openSessionById", async (workspace?: WorkspaceRef, sessionID?: string) => {
      if (!workspace || !sessionID) {
        return
      }

      const rt = mgr.get(workspace.workspaceId)

      if (!rt || rt.state !== "ready" || !rt.sdk) {
        await vscode.window.showErrorMessage(runtimeNotReadyMessage(rt))
        return
      }

      const res = await rt.sdk.session.get({
        sessionID,
        directory: rt.dir,
      })

      if (!res.data) {
        await vscode.window.showInformationMessage("Session was not found.")
        return
      }

      await tabs.openSession(workspaceRef(rt), res.data)
    }),
    vscode.commands.registerCommand("opencode-ui.deleteSession", async (item?: SessionItem) => {
      if (!item) {
        await vscode.window.showInformationMessage("Pick a session item first.")
        return
      }

      const label = item.session.title || item.session.id.slice(0, 8)
      const confirmed = await vscode.window.showWarningMessage(
        `Delete session "${label}"? This permanently removes its messages and history.`,
        { modal: true },
        "Delete Session",
      )

      if (confirmed !== "Delete Session") {
        return
      }

      await sessions.delete(item.runtime.workspaceId, item.session.id)
      tabs.closeSession(workspaceRef(item.runtime), item.session.id)
    }),
    vscode.commands.registerCommand("opencode-ui.quickNewSession", async () => {
      const rt = runtimeFromActiveEditor(mgr) ?? firstRuntime(mgr)

      if (!rt) {
        await vscode.window.showInformationMessage("Open a workspace folder first.")
        return
      }

      if (rt.state !== "ready") {
        await vscode.window.showErrorMessage(runtimeNotReadyMessage(rt))
        return
      }

      const session = await sessions.create(rt.workspaceId)
      const ref = { ...workspaceRef(rt), sessionId: session.id }
      await panels.open(ref, vscode.ViewColumn.Beside)
    }),
    vscode.commands.registerCommand("opencode-ui.askSelection", async () => {
      const seed = seedFromActiveEditor("selection")
      if (!seed) {
        await vscode.window.showInformationMessage("Select text in a workspace file first.")
        return
      }

      await openSeededSession(seed, mgr, sessions, panels, capabilities)
    }),
    vscode.commands.registerCommand("opencode-ui.askCurrentFile", async () => {
      const seed = seedFromActiveEditor("file")
      if (!seed) {
        await vscode.window.showInformationMessage("Open a workspace file first.")
        return
      }

      await openSeededSession(seed, mgr, sessions, panels, capabilities)
    }),
    vscode.commands.registerCommand("opencode-ui.askExplorerFiles", async (item?: vscode.Uri, items?: vscode.Uri[]) => {
      const seed = seedFromExplorerSelection(item, items)
      if (!seed) {
        await vscode.window.showInformationMessage("Select one or more files from a single workspace folder first.")
        return
      }

      await openSeededSession(seed, mgr, sessions, panels, capabilities)
    }),
    vscode.commands.registerCommand("opencode-ui.statusBarAction", async () => {
      const active = panels.activeSession()
      if (active) {
        await panels.open(active)
        return
      }

      const rt = runtimeFromActiveEditor(mgr)
      if (rt) {
        if (rt.state !== "ready") {
          await vscode.window.showErrorMessage(runtimeNotReadyMessage(rt))
          return
        }

        void capabilities.getOrProbe(rt.workspaceId)
        const session = await sessions.create(rt.workspaceId)
        await panels.open({
          workspaceId: rt.workspaceId,
          dir: rt.dir,
          sessionId: session.id,
        }, vscode.ViewColumn.Beside)
        return
      }

      await vscode.commands.executeCommand("workbench.view.extension.opencode-ui")
    }),
  )

  function seedFromActiveEditor(mode: "selection" | "file") {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      return undefined
    }

    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri)
    if (!folder) {
      return undefined
    }

    const selection = editor.selection
    if (mode === "selection" && selection.isEmpty) {
      return undefined
    }

    return buildEditorSeed({
      workspaceId: folder.uri.toString(),
      workspaceDir: folder.uri.fsPath,
      filePath: editor.document.uri.fsPath,
      selection: {
        startLine: selection.start.line + 1,
        endLine: selection.isEmpty ? undefined : selection.end.line + 1,
        empty: mode === "file" ? true : selection.isEmpty,
      },
    })
  }

  function seedFromExplorerSelection(item?: vscode.Uri, items?: vscode.Uri[]) {
    const uris = items?.length ? items : item ? [item] : []
    if (!uris.length) {
      return undefined
    }

    const folder = vscode.workspace.getWorkspaceFolder(uris[0]!)
    if (!folder) {
      return undefined
    }

    const sameWorkspaceFiles = uris.filter((uri) => vscode.workspace.getWorkspaceFolder(uri)?.uri.toString() === folder.uri.toString())
    if (!sameWorkspaceFiles.length || sameWorkspaceFiles.length !== uris.length) {
      return undefined
    }

    return buildExplorerSeed({
      workspaceId: folder.uri.toString(),
      workspaceDir: folder.uri.fsPath,
      filePaths: sameWorkspaceFiles.map((uri) => uri.fsPath),
    })
  }
}

function firstRuntime(mgr: WorkspaceManager): WorkspaceRuntime | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0]
  return folder ? mgr.get(folder.uri.toString()) : undefined
}

function runtimeFromActiveEditor(mgr: WorkspaceManager): WorkspaceRuntime | undefined {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return undefined
  }

  const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri)
  if (!folder) {
    return undefined
  }

  return mgr.get(folder.uri.toString())
}

function workspaceRef(runtime: { workspaceId: string; dir: string }): WorkspaceRef {
  return {
    workspaceId: runtime.workspaceId,
    dir: runtime.dir,
  }
}

async function openSeededSession(
  seed: LaunchSeed,
  mgr: WorkspaceManager,
  sessions: SessionStore,
  panels: SessionPanelManager,
  capabilities: CapabilityStore,
) {
  const rt = mgr.get(seed.workspaceId)

  if (!rt) {
    await vscode.window.showInformationMessage("Open a workspace folder first.")
    return
  }

  if (rt.state !== "ready") {
    await vscode.window.showErrorMessage(runtimeNotReadyMessage(rt))
    return
  }

  void capabilities.getOrProbe(rt.workspaceId)
  const session = await sessions.create(rt.workspaceId)
  await panels.openWithSeed({
    workspaceId: rt.workspaceId,
    dir: rt.dir,
    sessionId: session.id,
  }, seed.parts, vscode.ViewColumn.Beside)
}
