import * as vscode from "vscode"
import { SessionPanelManager } from "./provider"

export class SessionPanelSerializer implements vscode.WebviewPanelSerializer {
  constructor(private panels: SessionPanelManager) {}

  async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown) {
    await this.panels.restore(panel, state)
  }
}
