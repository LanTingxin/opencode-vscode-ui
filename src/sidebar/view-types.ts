import type { SessionPanelRef } from "../bridge/types"
import type { FileDiff, Todo } from "../core/sdk"

export type SidebarViewMode = "todo" | "diff"
export type TaskFilter = "all" | "open" | "completed"

export type SidebarViewState = {
  status: "idle" | "loading" | "ready" | "error"
  mode: SidebarViewMode
  sessionTitle?: string
  sessionRef?: SessionPanelRef
  todos: Todo[]
  diff: FileDiff[]
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
