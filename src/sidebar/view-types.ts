import type { SessionPanelRef } from "../bridge/types"
import type { FileDiff, SessionInfo, SessionStatus, Todo } from "../core/sdk"

export type SidebarViewMode = "todo" | "diff" | "subagents"
export type TaskFilter = "all" | "open" | "completed"
export type SidebarSubagent = {
  session: SessionInfo
  status: SessionStatus
}

export type SidebarViewState = {
  status: "idle" | "loading" | "ready" | "error"
  mode: SidebarViewMode
  sessionTitle?: string
  sessionRef?: SessionPanelRef
  todos: Todo[]
  diff: FileDiff[]
  subagents: SidebarSubagent[]
  branch?: string
  defaultBranch?: string
  error?: string
}

export type SidebarHostMessage = {
  type: "state"
  payload: SidebarViewState
}

export type SidebarWebviewMessage = {
  type: "ready"
} | {
  type: "openFile"
  filePath: string
} | {
  type: "openSession"
  workspaceId: string
  dir: string
  sessionId: string
}
