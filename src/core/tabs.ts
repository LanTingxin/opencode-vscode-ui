import * as vscode from "vscode"
import type { WorkspaceRef } from "../bridge/types"
import type { SessionInfo } from "./sdk"
import { SessionPanelManager } from "../panel/provider"

export class TabManager {
  constructor(private panels: SessionPanelManager) {}

  async openSession(workspace: WorkspaceRef, session: SessionInfo, viewColumn?: vscode.ViewColumn) {
    await this.panels.open({
      workspaceId: workspace.workspaceId,
      dir: workspace.dir,
      sessionId: session.id,
    }, viewColumn)
  }

  closeSession(workspace: WorkspaceRef, sessionID: string) {
    return this.panels.close({
      workspaceId: workspace.workspaceId,
      dir: workspace.dir,
      sessionId: sessionID,
    })
  }
}
