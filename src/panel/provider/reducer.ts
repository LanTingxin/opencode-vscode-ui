import type { SessionSnapshot } from "../../bridge/types"
import type { SessionEvent } from "../../core/sdk"
import { reduceSessionSnapshot } from "../shared/session-reducer"

export function reduce(payload: SessionSnapshot, event: SessionEvent) {
  return reduceSessionSnapshot(payload, event)
}

export function needsRefresh(event: SessionEvent, payload: SessionSnapshot) {
  if (event.type === "server.instance.disposed") {
    return true
  }

  if (event.type === "session.deleted") {
    const props = event.properties as { info: { id: string; parentID?: string } }
    if (props.info.id === payload.sessionRef.sessionId) {
      return true
    }
    if (!payload.session?.parentID) {
      return false
    }
    return props.info.parentID === payload.session.parentID
      || props.info.id === payload.session.parentID
      || payload.relatedSessionIds.includes(props.info.id)
  }

  if (event.type === "session.created" || event.type === "session.updated") {
    const props = event.properties as { info: { id: string; parentID?: string } }
    if (props.info.id === payload.sessionRef.sessionId) {
      return false
    }
    if (!payload.session?.parentID) {
      return event.type === "session.updated"
        && !payload.relatedSessionIds.includes(props.info.id)
        && payload.relatedSessionIds.includes(props.info.parentID ?? "")
    }
    return props.info.parentID === payload.session.parentID
      || props.info.id === payload.session.parentID
      || payload.relatedSessionIds.includes(props.info.parentID ?? "")
      || payload.relatedSessionIds.includes(props.info.id)
  }

  return false
}
