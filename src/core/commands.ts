import * as vscode from "vscode"
import type { WorkspaceRef } from "../bridge/types"
import type { SessionInfo, SessionStatus } from "./sdk"
import { openSettingsQuery } from "./settings"
import { checkOpencodeAvailable, runtimeNotReadyMessage } from "./runtime-errors"
import { ClearSearchItem, ClearTagFilterItem, SessionItem, WorkspaceItem } from "../sidebar/item"
import type { WorkspaceRuntime } from "./server"
import { parseSessionTagsInput, SessionTagStore } from "./session-tags"
import { SessionStore } from "./session"
import { displaySessionTitle, isDefaultNewSessionTitle } from "./session-titles"
import { TabManager } from "./tabs"
import { WorkspaceManager } from "./workspace"
import { SessionPanelManager } from "../panel/provider"
import { buildEditorSeed, buildExplorerSeed, type LaunchSeed } from "./launch-context"
import { applySessionSearchCapabilityResult, CapabilityState, CapabilityStore, classifyCapabilityError, createEmptyCapabilities, type RuntimeCapabilities } from "./capabilities"
import { SidebarProvider } from "../sidebar/provider"

type SessionActionRuntime = Pick<WorkspaceRuntime, "workspaceId" | "dir" | "name" | "state"> & {
  sdk?: {
    session: {
      update?(input: {
        sessionID: string
        directory: string
        title?: string
        time?: {
          archived?: number
        }
      }): Promise<{ data?: SessionInfo }>
      share?(input: {
        sessionID: string
        directory: string
      }): Promise<{ data?: SessionInfo }>
      unshare?(input: {
        sessionID: string
        directory: string
      }): Promise<{ data?: SessionInfo }>
    }
  }
}

export type SessionActionTarget = {
  runtime: SessionActionRuntime
  session: SessionInfo
}

type SessionActionInput = {
  target: SessionActionTarget
  sessions: Pick<SessionStore, "refresh">
  showInformationMessage: (message: string) => Thenable<unknown>
  showErrorMessage: (message: string) => Thenable<unknown>
}

export function commands(
  ctx: vscode.ExtensionContext,
  mgr: WorkspaceManager,
  sessions: SessionStore,
  out: vscode.OutputChannel,
  tabs: TabManager,
  panels: SessionPanelManager,
  capabilities: CapabilityStore,
  tags: SessionTagStore,
  tree: SidebarProvider,
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

      const target = await acquireNewSessionTarget(rt, sessions, out)
      await vscode.commands.executeCommand("opencode-ui.openSessionById", workspaceRef(rt), target.session.id, resolveNewSessionOpenColumn())
      void cleanupStaleNewSessions(rt, target.stale, sessions, tabs, out)
    }),
    vscode.commands.registerCommand("opencode-ui.newSessionInPlace", async (current?: WorkspaceRef & { sessionId: string }) => {
      const rt = current ? mgr.get(current.workspaceId) : firstRuntime(mgr)

      if (!rt) {
        await vscode.window.showInformationMessage("Open a workspace folder first.")
        return
      }

      if (rt.state !== "ready") {
        await vscode.window.showErrorMessage(runtimeNotReadyMessage(rt))
        return
      }

      const target = await acquireNewSessionTarget(rt, sessions, out)
      const nextRef = { ...workspaceRef(rt), sessionId: target.session.id }

      if (current) {
        await panels.retarget(current, nextRef)
      } else {
        await panels.open(nextRef)
      }

      void cleanupStaleNewSessions(rt, target.stale, sessions, tabs, out)
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

      await tabs.openSession(workspaceRef(item.runtime), item.session, resolveNewSessionOpenColumn())
    }),
    vscode.commands.registerCommand("opencode-ui.openSessionById", async (workspace?: WorkspaceRef, sessionID?: string, viewColumn?: vscode.ViewColumn) => {
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

      await tabs.openSession(workspaceRef(rt), res.data, viewColumn ?? resolveNewSessionOpenColumn())
    }),
    vscode.commands.registerCommand("opencode-ui.forkSessionMessage", async (current?: WorkspaceRef & { sessionId: string }, messageID?: string) => {
      if (!current || !messageID) {
        return
      }

      const rt = mgr.get(current.workspaceId)

      if (!rt || rt.state !== "ready" || !rt.sdk) {
        await vscode.window.showErrorMessage(runtimeNotReadyMessage(rt))
        return
      }

      try {
        const forked = await forkSessionMessage({
          runtime: rt,
          current,
          messageID,
        })

        if (!forked) {
          await vscode.window.showInformationMessage("The selected message is no longer available.")
          return
        }

        void capabilities.getOrProbe(rt.workspaceId)
        await tabs.openSession(workspaceRef(rt), forked, resolveNewSessionOpenColumn())
        void sessions.refresh(rt.workspaceId, true)
      } catch (error) {
        await vscode.window.showErrorMessage(`OpenCode fork failed for ${rt.name}: ${errorMessage(error)}`)
      }
    }),
    vscode.commands.registerCommand("opencode-ui.renameSession", async (item?: SessionItem) => {
      const target = await resolveSessionActionTarget(item, mgr)
      if (!target) {
        return
      }

      await renameSession({
        target,
        sessions,
        showInputBox: (options) => vscode.window.showInputBox(options),
        showInformationMessage: (message) => vscode.window.showInformationMessage(message),
        showErrorMessage: (message) => vscode.window.showErrorMessage(message),
      })
    }),
    vscode.commands.registerCommand("opencode-ui.archiveSession", async (item?: SessionItem) => {
      const target = await resolveSessionActionTarget(item, mgr)
      if (!target) {
        return
      }

      await archiveSession({
        target,
        sessions,
        showWarningMessage: (message, options, ...items) => vscode.window.showWarningMessage(message, options, ...items),
        showInformationMessage: (message) => vscode.window.showInformationMessage(message),
        showErrorMessage: (message) => vscode.window.showErrorMessage(message),
      })
    }),
    vscode.commands.registerCommand("opencode-ui.shareSession", async (item?: SessionItem) => {
      const target = await resolveSessionActionTarget(item, mgr)
      if (!target) {
        return
      }

      await shareSession({
        target,
        sessions,
        copyText: (value) => vscode.env.clipboard.writeText(value),
        showInformationMessage: (message) => vscode.window.showInformationMessage(message),
        showErrorMessage: (message) => vscode.window.showErrorMessage(message),
      })
    }),
    vscode.commands.registerCommand("opencode-ui.unshareSession", async (item?: SessionItem) => {
      const target = await resolveSessionActionTarget(item, mgr)
      if (!target) {
        return
      }

      await unshareSession({
        target,
        sessions,
        showInformationMessage: (message) => vscode.window.showInformationMessage(message),
        showErrorMessage: (message) => vscode.window.showErrorMessage(message),
      })
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

      const target = await acquireNewSessionTarget(rt, sessions, out)
      const ref = { ...workspaceRef(rt), sessionId: target.session.id }
      await panels.open(ref, resolveNewSessionOpenColumn())
      void cleanupStaleNewSessions(rt, target.stale, sessions, tabs, out)
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
    vscode.commands.registerCommand("opencode-ui.searchWorkspaceSessions", async (item?: WorkspaceItem) => {
      const rt = item?.runtime

      if (!rt) {
        await vscode.window.showInformationMessage("Pick a workspace item to search its sessions.")
        return
      }

      if (rt.state !== "ready" || !rt.sdk) {
        await vscode.window.showErrorMessage(runtimeNotReadyMessage(rt))
        return
      }

      const query = await vscode.window.showInputBox(buildWorkspaceSearchInputOptions(rt.name, tree.searchQuery(rt.workspaceId)))

      await runWorkspaceSessionSearch({
        runtime: rt,
        query,
        capability: capabilities.snapshot(rt.workspaceId).sessionSearch,
        snapshot: capabilities.snapshot(rt.workspaceId),
        capabilities,
        sidebar: tree,
        showInformationMessage: (message) => vscode.window.showInformationMessage(message),
        showErrorMessage: (message) => vscode.window.showErrorMessage(message),
      })
    }),
    vscode.commands.registerCommand("opencode-ui.clearWorkspaceSessionSearch", async (item?: WorkspaceItem | ClearSearchItem) => {
      const workspaceId = item?.runtime.workspaceId

      if (!workspaceId) {
        await vscode.window.showInformationMessage("Pick a workspace search to clear first.")
        return
      }

      tree.clearSearch(workspaceId)
    }),
    vscode.commands.registerCommand("opencode-ui.manageSessionTags", async (item?: SessionItem) => {
      if (!item) {
        await vscode.window.showInformationMessage("Pick a session item first.")
        return
      }

      const current = tags.tags(item.runtime.workspaceId, item.session.id)
      const input = await vscode.window.showInputBox({
        prompt: `Manage tags for ${displaySessionTitle(item.session.title, item.session.id.slice(0, 8))}`,
        placeHolder: "tag-a, tag-b",
        value: current.join(", "),
        ignoreFocusOut: true,
      })

      if (input === undefined) {
        return
      }

      await tags.setTags(item.runtime.workspaceId, item.session.id, parseSessionTagsInput(input))
      tree.refresh()
    }),
    vscode.commands.registerCommand("opencode-ui.filterWorkspaceSessionsByTag", async (item?: WorkspaceItem) => {
      const rt = item?.runtime

      if (!rt) {
        await vscode.window.showInformationMessage("Pick a workspace item to filter its sessions.")
        return
      }

      const available = tags.workspaceTags(rt.workspaceId)
      if (available.length === 0) {
        await vscode.window.showInformationMessage(`There are no local tags yet for ${rt.name}.`)
        return
      }

      const choice = await vscode.window.showQuickPick(
        available.map((tag) => ({ label: tag })),
        {
          title: `Filter sessions in ${rt.name}`,
          placeHolder: "Choose a tag",
          ignoreFocusOut: true,
        },
      )

      if (!choice) {
        return
      }

      tree.filterByTag(rt.workspaceId, choice.label)
    }),
    vscode.commands.registerCommand("opencode-ui.clearWorkspaceTagFilter", async (item?: WorkspaceItem | ClearTagFilterItem) => {
      const workspaceId = item?.runtime.workspaceId

      if (!workspaceId) {
        await vscode.window.showInformationMessage("Pick a workspace tag filter to clear first.")
        return
      }

      tree.clearTagFilter(workspaceId)
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
        const target = await acquireNewSessionTarget(rt, sessions, out)
        await panels.open({
          workspaceId: rt.workspaceId,
          dir: rt.dir,
          sessionId: target.session.id,
        }, resolveNewSessionOpenColumn())
        void cleanupStaleNewSessions(rt, target.stale, sessions, tabs, out)
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

type SearchRuntime = Pick<WorkspaceRuntime, "workspaceId" | "dir" | "name" | "state"> & {
  sdk?: {
    session: {
      list(input: {
        directory: string
        roots: true
        search: string
      }): Promise<{ data?: import("./sdk").SessionInfo[] }>
    }
  }
}

type WorkspaceSessionSearchInput = {
  runtime: SearchRuntime
  query: string | undefined
  capability: CapabilityState
  snapshot?: RuntimeCapabilities
  capabilities: Pick<CapabilityStore, "set">
  sidebar: Pick<SidebarProvider, "setSearchLoading" | "setSearchResult" | "setSearchError" | "clearSearch">
  showInformationMessage: (message: string) => Thenable<unknown>
  showErrorMessage: (message: string) => Thenable<unknown>
}

export function buildWorkspaceSearchInputOptions(runtimeName: string, previousQuery?: string): vscode.InputBoxOptions {
  return {
    prompt: `Search sessions in ${runtimeName}`,
    placeHolder: "Enter session title or keyword",
    ignoreFocusOut: true,
    value: previousQuery,
  }
}

export async function runWorkspaceSessionSearch(input: WorkspaceSessionSearchInput) {
  const query = input.query?.trim()
  if (!query) {
    return
  }

  if (input.capability === "unsupported") {
    await input.showInformationMessage(`Session search is not supported by the OpenCode server for ${input.runtime.name}.`)
    return
  }

  if (input.runtime.state !== "ready" || !input.runtime.sdk) {
    await input.showErrorMessage(runtimeNotReadyMessage(input.runtime as WorkspaceRuntime))
    return
  }

  input.sidebar.setSearchLoading(input.runtime.workspaceId, query)

  try {
    const result = await input.runtime.sdk.session.list({
      directory: input.runtime.dir,
      roots: true,
      search: query,
    })
    input.sidebar.setSearchResult(input.runtime.workspaceId, query, result.data ?? [])
    input.capabilities.set(
      input.runtime.workspaceId,
      applySessionSearchCapabilityResult(input.snapshot ?? createEmptyCapabilities(), "supported"),
    )
  } catch (error) {
    const state = classifyCapabilityError(error)

    if (state === "unsupported") {
      input.sidebar.clearSearch(input.runtime.workspaceId)
      input.capabilities.set(
        input.runtime.workspaceId,
        applySessionSearchCapabilityResult(input.snapshot ?? createEmptyCapabilities(), "unsupported"),
      )
      await input.showInformationMessage(`Session search is not supported by the OpenCode server for ${input.runtime.name}.`)
      return
    }

    const message = errorMessage(error)
    input.sidebar.setSearchError(input.runtime.workspaceId, query, message)
    await input.showErrorMessage(`OpenCode session search failed for ${input.runtime.name}: ${message}`)
  }
}

export async function renameSession(input: SessionActionInput & {
  showInputBox: (options: vscode.InputBoxOptions) => Thenable<string | undefined>
}) {
  if (!isSessionActionReady(input.target, input.showErrorMessage)) {
    return
  }

  const label = displaySessionTitle(input.target.session.title, input.target.session.id.slice(0, 8))
  const title = await input.showInputBox({
    prompt: `Rename session "${label}"`,
    placeHolder: "Session title",
    value: input.target.session.title,
    ignoreFocusOut: true,
  })

  const next = title?.trim()
  if (!next || next === input.target.session.title) {
    return
  }

  try {
    await input.target.runtime.sdk!.session.update!({
      sessionID: input.target.session.id,
      directory: input.target.runtime.dir,
      title: next,
    })
    await input.sessions.refresh(input.target.runtime.workspaceId, true)
  } catch (error) {
    await input.showErrorMessage(`OpenCode rename failed for ${input.target.runtime.name}: ${errorMessage(error)}`)
  }
}

export async function archiveSession(input: SessionActionInput & {
  showWarningMessage: (
    message: string,
    options: vscode.MessageOptions,
    ...items: string[]
  ) => Thenable<string | undefined>
  now?: () => number
}) {
  if (!isSessionActionReady(input.target, input.showErrorMessage)) {
    return
  }

  const label = displaySessionTitle(input.target.session.title, input.target.session.id.slice(0, 8))
  const confirmed = await input.showWarningMessage(
    `Archive session "${label}"? It will disappear from the default session list.`,
    { modal: true },
    "Archive Session",
  )

  if (confirmed !== "Archive Session") {
    return
  }

  try {
    await input.target.runtime.sdk!.session.update!({
      sessionID: input.target.session.id,
      directory: input.target.runtime.dir,
      time: {
        archived: (input.now ?? Date.now)(),
      },
    })
    await input.sessions.refresh(input.target.runtime.workspaceId, true)
    await input.showInformationMessage(`Archived session "${label}".`)
  } catch (error) {
    await input.showErrorMessage(`OpenCode archive failed for ${input.target.runtime.name}: ${errorMessage(error)}`)
  }
}

export async function shareSession(input: SessionActionInput & {
  copyText: (value: string) => Thenable<void>
}) {
  if (!isSessionActionReady(input.target, input.showErrorMessage)) {
    return
  }

  try {
    const result = await input.target.runtime.sdk!.session.share!({
      sessionID: input.target.session.id,
      directory: input.target.runtime.dir,
    })
    const url = result.data?.share?.url
    if (!url) {
      await input.showErrorMessage(`OpenCode share failed for ${input.target.runtime.name}: Missing share URL.`)
      return
    }

    await input.copyText(url)
    await input.sessions.refresh(input.target.runtime.workspaceId, true)
    await input.showInformationMessage("Share link copied to the clipboard.")
  } catch (error) {
    await input.showErrorMessage(`OpenCode share failed for ${input.target.runtime.name}: ${errorMessage(error)}`)
  }
}

export async function unshareSession(input: SessionActionInput) {
  if (!isSessionActionReady(input.target, input.showErrorMessage)) {
    return
  }

  try {
    await input.target.runtime.sdk!.session.unshare!({
      sessionID: input.target.session.id,
      directory: input.target.runtime.dir,
    })
    await input.sessions.refresh(input.target.runtime.workspaceId, true)
    await input.showInformationMessage("Session unshared.")
  } catch (error) {
    await input.showErrorMessage(`OpenCode unshare failed for ${input.target.runtime.name}: ${errorMessage(error)}`)
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

async function resolveSessionActionTarget(item: SessionItem | undefined, mgr: WorkspaceManager) {
  if (!item) {
    await vscode.window.showInformationMessage("Pick a session item first.")
    return undefined
  }

  const rt = mgr.get(item.runtime.workspaceId)
  if (!rt || rt.state !== "ready" || !rt.sdk) {
    await vscode.window.showErrorMessage(runtimeNotReadyMessage(rt))
    return undefined
  }

  return {
    runtime: rt,
    session: item.session,
  } satisfies SessionActionTarget
}

async function acquireNewSessionTarget(
  rt: WorkspaceRuntime,
  sessions: SessionStore,
  out: vscode.OutputChannel,
) {
  await sessions.refresh(rt.workspaceId, true)

  const currentSessions = sessions.list(rt.workspaceId)
  const emptySessionIds = await loadEmptyNewSessionIds(rt, currentSessions, out)
  const existing = resolveReusableNewSession({
    sessions: currentSessions,
    emptySessionIds,
    statuses: rt.sessionStatuses,
  })

  if (existing.keep) {
    return {
      session: existing.keep,
      stale: existing.stale,
    }
  }

  const created = await sessions.create(rt.workspaceId)
  const refreshed = sessions.list(rt.workspaceId)
  const allSessions = refreshed.some((item) => item.id === created.id)
    ? refreshed
    : [created, ...refreshed]

  const next = resolveReusableNewSession({
    sessions: allSessions,
    emptySessionIds: new Set([...emptySessionIds, created.id]),
    statuses: rt.sessionStatuses,
    preferredSessionId: created.id,
  })

  return {
    session: next.keep ?? created,
    stale: next.stale,
  }
}

async function cleanupStaleNewSessions(
  rt: WorkspaceRuntime,
  stale: SessionInfo[],
  sessions: SessionStore,
  tabs: TabManager,
  out: vscode.OutputChannel,
) {
  for (const session of stale) {
    try {
      await sessions.delete(rt.workspaceId, session.id)
      tabs.closeSession(workspaceRef(rt), session.id)
    } catch (error) {
      out.appendLine(`[commands] failed to remove stale new session ${session.id} for ${rt.name}: ${errorMessage(error)}`)
    }
  }
}

async function loadEmptyNewSessionIds(
  rt: WorkspaceRuntime,
  sessions: SessionInfo[],
  out: vscode.OutputChannel,
) {
  if (!rt.sdk) {
    return new Set<string>()
  }

  const candidates = sessions.filter((session) => isDefaultNewSessionTitle(session.title))
  const checks = await Promise.all(candidates.map(async (session) => {
    const status = rt.sessionStatuses.get(session.id)
    if (status?.type && status.type !== "idle") {
      return undefined
    }

    try {
      const result = await rt.sdk!.session.messages({
        sessionID: session.id,
        directory: rt.dir,
        limit: 1,
      })
      return (result.data?.length ?? 0) === 0 ? session.id : undefined
    } catch (error) {
      out.appendLine(`[commands] failed to inspect session ${session.id} for reuse: ${errorMessage(error)}`)
      return undefined
    }
  }))

  return new Set(checks.filter((sessionId): sessionId is string => !!sessionId))
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
  const target = resolveSeedSessionTarget({
    workspaceId: rt.workspaceId,
    activeSession: panels.activeSession(),
    visibleSession: panels.visibleSession(rt.workspaceId),
    recentSession: panels.recentSession(rt.workspaceId),
  })

  if (target) {
    await panels.openWithSeed(target, seed.parts)
    return
  }

  const session = await sessions.create(rt.workspaceId)
  await panels.openWithSeed({
    workspaceId: rt.workspaceId,
    dir: rt.dir,
    sessionId: session.id,
  }, seed.parts, resolveNewSessionOpenColumn())
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function isSessionActionReady(
  target: SessionActionTarget,
  showErrorMessage: (message: string) => Thenable<unknown>,
) {
  if (target.runtime.state === "ready" && target.runtime.sdk) {
    return true
  }

  void showErrorMessage(runtimeNotReadyMessage(target.runtime as WorkspaceRuntime))
  return false
}

export function resolveSeedSessionTarget(input: {
  workspaceId: string
  activeSession?: WorkspaceRef & { sessionId: string }
  visibleSession?: WorkspaceRef & { sessionId: string }
  recentSession?: WorkspaceRef & { sessionId: string }
}) {
  if (input.activeSession?.workspaceId === input.workspaceId) {
    return input.activeSession
  }

  if (input.visibleSession?.workspaceId === input.workspaceId) {
    return input.visibleSession
  }

  if (input.recentSession?.workspaceId === input.workspaceId) {
    return input.recentSession
  }

  return undefined
}

export function resolveNewSessionOpenColumn() {
  return vscode.ViewColumn.Beside
}

export async function forkSessionMessage(input: {
  runtime: WorkspaceRuntime
  current: WorkspaceRef & { sessionId: string }
  messageID: string
}) {
  const messages = await input.runtime.sdk!.session.messages({
    sessionID: input.current.sessionId,
    directory: input.runtime.dir,
  })

  const message = messages.data?.find((item) => item.info.role === "user" && item.info.id === input.messageID)
  if (!message) {
    return undefined
  }

  return (await input.runtime.sdk!.session.fork({
    sessionID: input.current.sessionId,
    directory: input.runtime.dir,
    messageID: input.messageID,
  })).data
}

export function resolveReusableNewSession(input: {
  sessions: SessionInfo[]
  emptySessionIds: Set<string>
  statuses: Map<string, SessionStatus>
  preferredSessionId?: string
}) {
  const reusable = [...input.sessions]
    .filter((session) => input.emptySessionIds.has(session.id))
    .filter((session) => isDefaultNewSessionTitle(session.title))
    .filter((session) => {
      const status = input.statuses.get(session.id)
      return !status?.type || status.type === "idle"
    })
    .sort((a, b) => b.time.updated - a.time.updated)

  const keep = reusable.find((session) => session.id === input.preferredSessionId) ?? reusable[0]

  return {
    keep,
    stale: keep ? reusable.filter((session) => session.id !== keep.id) : [],
  }
}
