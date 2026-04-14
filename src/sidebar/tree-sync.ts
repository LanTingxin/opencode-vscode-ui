import type * as vscode from "vscode"
import type { SessionPanelRef } from "../bridge/types"

type SessionTreeLookup = {
  findSessionItem(workspaceId: string, sessionId: string): unknown
}

export async function syncTreeSelectionToActiveSession(input: {
  ref?: SessionPanelRef
  tree: SessionTreeLookup
  treeView: Pick<vscode.TreeView<unknown>, "visible" | "reveal">
}) {
  if (!input.ref || !input.treeView.visible) {
    return false
  }

  const item = input.tree.findSessionItem(input.ref.workspaceId, input.ref.sessionId)
  if (!item) {
    return false
  }

  await input.treeView.reveal(item, {
    select: true,
    focus: false,
    expand: true,
  })
  return true
}
