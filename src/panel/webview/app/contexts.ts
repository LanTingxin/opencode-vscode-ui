import React from "react"
import type { SessionInfo, SessionMessage } from "../../../core/sdk"

export const TranscriptVisibilityContext = React.createContext({
  showThinking: false,
  showInternals: false,
})

export const WorkspaceDirContext = React.createContext("")
export const ChildMessagesContext = React.createContext<Record<string, SessionMessage[]>>({})
export const ChildSessionsContext = React.createContext<Record<string, SessionInfo>>({})

export function useWorkspaceDir() {
  return React.useContext(WorkspaceDirContext)
}

export function useChildMessages() {
  return React.useContext(ChildMessagesContext)
}

export function useChildSessions() {
  return React.useContext(ChildSessionsContext)
}
