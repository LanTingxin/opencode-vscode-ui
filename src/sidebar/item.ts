import * as vscode from "vscode"
import { isMissingOpencodeError } from "../core/runtime-errors"
import type { SessionInfo, SessionStatus } from "../core/sdk"
import type { WorkspaceRuntime } from "../core/server"
import { displaySessionTitle } from "../core/session-titles"

export class WorkspaceItem extends vscode.TreeItem {
  constructor(
    readonly runtime: WorkspaceRuntime,
    searchActive = false,
    tagFilterActive = false,
  ) {
    super(runtime.name, vscode.TreeItemCollapsibleState.Expanded)
    this.label = runtime.name
    this.id = runtime.workspaceId
    this.description = desc(runtime)
    this.tooltip = `${runtime.dir}\n${runtime.url}`
    this.contextValue = workspaceContextValue(searchActive, tagFilterActive)
    this.iconPath = icon(runtime.state)
  }
}

export class StatusItem extends vscode.TreeItem {
  constructor(label: string, description?: string) {
    super(label, vscode.TreeItemCollapsibleState.None)
    this.label = label
    this.description = description
    this.contextValue = "status"
  }
}

export class SessionItem extends vscode.TreeItem {
  constructor(
    readonly runtime: Pick<WorkspaceRuntime, "workspaceId" | "dir">,
    readonly session: SessionInfo,
    status?: SessionStatus,
    tags: string[] = [],
  ) {
    const label = displaySessionTitle(session.title, session.id.slice(0, 8))
    super(label, vscode.TreeItemCollapsibleState.None)
    this.label = label
    this.id = `${runtime.workspaceId}:${session.id}`
    this.description = buildSessionDescription(session, tags)
    this.tooltip = buildSessionTooltip(runtime.dir, session, tags)
    this.contextValue = session.share?.url ? "session-shared" : "session"
    this.iconPath = status?.type === "busy"
      ? new vscode.ThemeIcon("loading~spin")
      : new vscode.ThemeIcon("comment-discussion")
    this.command = {
      command: "opencode-ui.openSession",
      title: "Open Session",
      arguments: [this],
    }
  }
}

export class ClearSearchItem extends vscode.TreeItem {
  constructor(readonly runtime: Pick<WorkspaceRuntime, "workspaceId">) {
    super("Clear Search", vscode.TreeItemCollapsibleState.None)
    this.id = `${runtime.workspaceId}:clear-search`
    this.contextValue = "clear-search"
    this.iconPath = new vscode.ThemeIcon("close")
    this.command = {
      command: "opencode-ui.clearWorkspaceSessionSearch",
      title: "Clear Session Search",
      arguments: [this],
    }
  }
}

export class ClearTagFilterItem extends vscode.TreeItem {
  constructor(
    readonly runtime: Pick<WorkspaceRuntime, "workspaceId">,
    tag: string,
  ) {
    super(`Clear Tag Filter (#${tag})`, vscode.TreeItemCollapsibleState.None)
    this.label = `Clear Tag Filter (#${tag})`
    this.id = `${runtime.workspaceId}:clear-tag-filter`
    this.contextValue = "clear-tag-filter"
    this.iconPath = new vscode.ThemeIcon("tag")
    this.command = {
      command: "opencode-ui.clearWorkspaceTagFilter",
      title: "Clear Tag Filter",
      arguments: [this],
    }
  }
}

function desc(runtime: WorkspaceRuntime) {
  if (runtime.state === "ready") {
    return `ready :${runtime.port}`
  }

  if (runtime.state === "starting") {
    return `starting :${runtime.port}`
  }

  if (runtime.state === "error") {
    if (isMissingOpencodeError(runtime.err)) {
      return "missing opencode"
    }

    return "error"
  }

  return "stopped"
}

function icon(state: WorkspaceRuntime["state"]) {
  if (state === "ready") {
    return new vscode.ThemeIcon("check")
  }

  if (state === "starting") {
    return new vscode.ThemeIcon("sync")
  }

  if (state === "error") {
    return new vscode.ThemeIcon("error")
  }

  return new vscode.ThemeIcon("circle-slash")
}

function workspaceContextValue(searchActive: boolean, tagFilterActive: boolean) {
  if (searchActive && tagFilterActive) {
    return "workspace-filtered"
  }

  if (searchActive) {
    return "workspace-searching"
  }

  if (tagFilterActive) {
    return "workspace-tag-filtered"
  }

  return "workspace"
}

function buildSessionDescription(session: SessionInfo, tags: string[]) {
  const base = session.id.slice(0, 8)
  const shared = session.share?.url ? "shared" : ""
  const summary = tagSummary(tags)
  return [base, shared, summary].filter(Boolean).join(" ")
}

function buildSessionTooltip(runtimeDir: string, session: SessionInfo, tags: string[]) {
  const lines = [`${displaySessionTitle(session.title, session.id)}`, session.id, runtimeDir]
  if (session.share?.url) {
    lines.push(`Shared: ${session.share.url}`)
  }
  if (tags.length > 0) {
    lines.push(`Tags: ${tags.join(", ")}`)
  }
  return lines.join("\n")
}

function tagSummary(tags: string[]) {
  if (tags.length === 0) {
    return ""
  }

  const visible = tags.slice(0, 2).map((tag) => `#${tag}`).join(" ")
  const rest = tags.length - 2
  return rest > 0 ? `${visible} +${rest}` : visible
}
