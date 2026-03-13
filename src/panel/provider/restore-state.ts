import type { SessionPanelRef } from "../../bridge/types"

export type SessionPanelState = SessionPanelRef

type WorkspaceFolderLike = {
  uri: {
    toString(): string
    fsPath: string
  }
}

export function reviveState(state: unknown): SessionPanelState | undefined {
  if (!state || typeof state !== "object") {
    return undefined
  }

  const maybe = state as Partial<SessionPanelState>

  if (!maybe.dir || !maybe.sessionId) {
    return undefined
  }

  return {
    workspaceId: maybe.workspaceId || maybe.dir,
    dir: maybe.dir,
    sessionId: maybe.sessionId,
  }
}

export function canRestoreRef(ref: SessionPanelRef, folders: readonly WorkspaceFolderLike[] | undefined) {
  return !!folders?.some((folder) => folder.uri.toString() === ref.workspaceId || folder.uri.fsPath === ref.dir)
}
