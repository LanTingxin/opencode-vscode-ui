import type { SessionInfo } from "./sdk"
import { SessionPanelManager } from "../panel/provider"

export class TabManager {
  constructor(private panels: SessionPanelManager) {}

  async openSession(dir: string, session: SessionInfo) {
    await this.panels.open({
      dir,
      sessionId: session.id,
    })
  }

  closeSession(dir: string, sessionID: string) {
    return this.panels.close({
      dir,
      sessionId: sessionID,
    })
  }
}
