import type { SessionSnapshot } from "../../bridge/types"
import type { FileDiff, MessagePart, PermissionRequest, QuestionRequest, SessionEvent, SessionMessage, SessionStatus, Todo } from "../../core/sdk"

export function reduceSessionSnapshot(payload: SessionSnapshot, event: SessionEvent) {
  if (event.type === "session.diff") {
    const props = event.properties as { sessionID: string; diff: FileDiff[] }
    if (props.sessionID !== payload.sessionRef.sessionId) {
      return
    }
    return {
      ...payload,
      diff: sortDiff(props.diff),
    }
  }

  if (event.type === "session.status") {
    const props = event.properties as { sessionID: string; status: SessionStatus }
    if (props.sessionID !== payload.sessionRef.sessionId) {
      return
    }
    return {
      ...payload,
      sessionStatus: props.status,
    }
  }

  if (event.type === "todo.updated") {
    const props = event.properties as { sessionID: string; todos: Todo[] }
    if (props.sessionID !== payload.sessionRef.sessionId) {
      return
    }
    return {
      ...payload,
      todos: props.todos,
    }
  }

  if (event.type === "session.updated" || event.type === "session.created") {
    const props = event.properties as { info: SessionSnapshot["session"] }
    if (!props.info) {
      return
    }

    if (props.info.id === payload.sessionRef.sessionId) {
      return {
        ...payload,
        session: props.info,
        navigation: payload.session?.parentID ? payload.navigation : nextNavigation(props.info, payload.childSessions),
      }
    }

    if (payload.session?.parentID) {
      return
    }

    const inside = payload.relatedSessionIds.includes(props.info.id) || payload.relatedSessionIds.includes(props.info.parentID ?? "")
    if (!inside) {
      return
    }

    const nextChildren = nextChildSessions(payload.childSessions, props.info)
    const nextIds = subtreeIds(payload.sessionRef.sessionId, payload.session, nextChildren)
    return {
      ...payload,
      childSessions: nextChildren,
      childMessages: pruneChildMessages(payload.childMessages, nextIds),
      relatedSessionIds: nextIds,
      permissions: payload.permissions.filter((item) => nextIds.includes(item.sessionID)),
      questions: payload.questions.filter((item) => nextIds.includes(item.sessionID)),
      navigation: nextNavigation(payload.session, nextChildren),
    }
  }

  if (event.type === "session.deleted") {
    const props = event.properties as { info: SessionSnapshot["session"] }
    if (!props.info) {
      return
    }

    if (props.info.id === payload.sessionRef.sessionId) {
      return
    }

    if (payload.session?.parentID) {
      return
    }

    if (!payload.relatedSessionIds.includes(props.info.id)) {
      return
    }

    const removed = descendantIds(payload.childSessions, props.info.id)
    const nextChildren = removeChildSessions(payload.childSessions, removed)
    const nextIds = subtreeIds(payload.sessionRef.sessionId, payload.session, nextChildren)
    return {
      ...payload,
      childSessions: nextChildren,
      childMessages: removeChildMessages(payload.childMessages, removed),
      relatedSessionIds: nextIds,
      permissions: payload.permissions.filter((item) => nextIds.includes(item.sessionID)),
      questions: payload.questions.filter((item) => nextIds.includes(item.sessionID)),
      navigation: nextNavigation(payload.session, nextChildren),
    }
  }

  if (event.type === "message.updated") {
    const props = event.properties as { info: SessionMessage["info"] }
    if (!payload.relatedSessionIds.includes(props.info.sessionID)) {
      return
    }

    if (props.info.sessionID !== payload.sessionRef.sessionId) {
      return {
        ...payload,
        childMessages: {
          ...payload.childMessages,
          [props.info.sessionID]: upsertMessage(payload.childMessages[props.info.sessionID] ?? [], props.info),
        },
      }
    }

    return {
      ...payload,
      messages: upsertMessage(payload.messages, props.info),
    }
  }

  if (event.type === "message.removed") {
    const props = event.properties as { sessionID: string; messageID: string }
    if (!payload.relatedSessionIds.includes(props.sessionID)) {
      return
    }

    if (props.sessionID !== payload.sessionRef.sessionId) {
      return {
        ...payload,
        childMessages: {
          ...payload.childMessages,
          [props.sessionID]: (payload.childMessages[props.sessionID] ?? []).filter((item) => item.info.id !== props.messageID),
        },
      }
    }

    return {
      ...payload,
      messages: payload.messages.filter((item) => item.info.id !== props.messageID),
    }
  }

  if (event.type === "message.part.updated") {
    const props = event.properties as { part: MessagePart }
    if (!payload.relatedSessionIds.includes(props.part.sessionID)) {
      return
    }

    if (props.part.sessionID !== payload.sessionRef.sessionId) {
      return {
        ...payload,
        childMessages: {
          ...payload.childMessages,
          [props.part.sessionID]: upsertPart(payload.childMessages[props.part.sessionID] ?? [], props.part),
        },
      }
    }

    const messages = upsertPart(payload.messages, props.part)
    return {
      ...payload,
      messages,
      agentMode: nextAgentMode(payload.agentMode, props.part, messages),
    }
  }

  if (event.type === "message.part.removed") {
    const props = event.properties as { messageID: string; partID: string }
    return {
      ...payload,
      messages: removePart(payload.messages, props.messageID, props.partID),
      childMessages: removePartFromChildren(payload.childMessages, props.messageID, props.partID),
    }
  }

  if (event.type === "message.part.delta") {
    const props = event.properties as {
      sessionID: string
      messageID: string
      partID: string
      field: string
      delta: string
    }
    if (!payload.relatedSessionIds.includes(props.sessionID)) {
      return
    }

    if (props.sessionID !== payload.sessionRef.sessionId) {
      return {
        ...payload,
        childMessages: {
          ...payload.childMessages,
          [props.sessionID]: appendDelta(payload.childMessages[props.sessionID] ?? [], props.messageID, props.partID, props.field, props.delta),
        },
      }
    }

    return {
      ...payload,
      messages: appendDelta(payload.messages, props.messageID, props.partID, props.field, props.delta),
    }
  }

  if (event.type === "permission.asked") {
    const props = event.properties as PermissionRequest
    if (!payload.relatedSessionIds.includes(props.sessionID)) {
      return
    }
    return {
      ...payload,
      permissions: filterPermission(upsertPermission(payload.permissions, props), payload.relatedSessionIds),
    }
  }

  if (event.type === "permission.replied") {
    const props = event.properties as { sessionID: string; requestID: string }
    if (!payload.relatedSessionIds.includes(props.sessionID)) {
      return
    }
    return {
      ...payload,
      permissions: payload.permissions.filter((item) => item.id !== props.requestID),
    }
  }

  if (event.type === "question.asked") {
    const props = event.properties as QuestionRequest
    if (!payload.relatedSessionIds.includes(props.sessionID)) {
      return
    }
    return {
      ...payload,
      questions: filterQuestion(upsertQuestion(payload.questions, props), payload.relatedSessionIds),
    }
  }

  if (event.type === "question.replied" || event.type === "question.rejected") {
    const props = event.properties as { sessionID: string; requestID: string }
    if (!payload.relatedSessionIds.includes(props.sessionID)) {
      return
    }
    return {
      ...payload,
      questions: payload.questions.filter((item) => item.id !== props.requestID),
    }
  }
}

function nextAgentMode(current: SessionSnapshot["agentMode"], part: MessagePart, messages: SessionMessage[]) {
  const next = partAgentMode(part)
  if (next) {
    return next
  }
  return current || agentMode(messages)
}

function agentMode(messages: SessionMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const mode = messageAgentMode(messages[i])
    if (mode) {
      return mode
    }
  }

  return "build" as const
}

function messageAgentMode(message: SessionMessage) {
  for (let i = message.parts.length - 1; i >= 0; i -= 1) {
    const mode = partAgentMode(message.parts[i])
    if (mode) {
      return mode
    }
  }
}

function partAgentMode(part: MessagePart) {
  if (part.type !== "tool" || part.state.status !== "completed") {
    return undefined
  }
  if (part.tool === "plan_enter") {
    return "plan" as const
  }
  if (part.tool === "plan_exit") {
    return "build" as const
  }
}

function upsertMessage(messages: SessionMessage[], info: SessionMessage["info"]) {
  const idx = messages.findIndex((item) => item.info.id === info.id)
  if (idx < 0) {
    return sortMessages([...messages, { info, parts: [] }])
  }

  return messages.map((item, i) => {
    if (i !== idx) {
      return item
    }
    return {
      ...item,
      info,
    }
  })
}

function upsertPart(messages: SessionMessage[], part: MessagePart) {
  return messages.map((item) => {
    if (item.info.id !== part.messageID) {
      return item
    }

    const idx = item.parts.findIndex((entry) => entry.id === part.id)
    if (idx < 0) {
      return {
        ...item,
        parts: sortParts([...item.parts, part]),
      }
    }

    return {
      ...item,
      parts: item.parts.map((entry, i) => (i === idx ? part : entry)),
    }
  })
}

function removePart(messages: SessionMessage[], messageID: string, partID: string) {
  return messages.map((item) => {
    if (item.info.id !== messageID) {
      return item
    }

    return {
      ...item,
      parts: item.parts.filter((part) => part.id !== partID),
    }
  })
}

function removePartFromChildren(children: Record<string, SessionMessage[]>, messageID: string, partID: string) {
  const next: Record<string, SessionMessage[]> = {}
  for (const [sessionID, messages] of Object.entries(children)) {
    next[sessionID] = removePart(messages, messageID, partID)
  }
  return next
}

function appendDelta(messages: SessionMessage[], messageID: string, partID: string, field: string, delta: string) {
  return messages.map((item) => {
    if (item.info.id !== messageID) {
      return item
    }

    return {
      ...item,
      parts: item.parts.map((part) => {
        if (part.id !== partID) {
          return part
        }

        const current = part[field as keyof MessagePart]
        if (typeof current !== "string") {
          return part
        }

        return {
          ...part,
          [field]: current + delta,
        }
      }),
    }
  })
}

function sortMessages(messages: SessionMessage[]) {
  return [...messages].sort((a, b) => cmp(a.info.id, b.info.id))
}

function sortParts(parts: MessagePart[]) {
  return [...parts].sort((a, b) => cmp(a.id, b.id))
}

function upsertPermission(list: PermissionRequest[], item: PermissionRequest) {
  const idx = list.findIndex((entry) => entry.id === item.id)
  if (idx < 0) {
    return sortPending([...list, item])
  }
  return list.map((entry, i) => (i === idx ? item : entry))
}

function upsertQuestion(list: QuestionRequest[], item: QuestionRequest) {
  const idx = list.findIndex((entry) => entry.id === item.id)
  if (idx < 0) {
    return sortPending([...list, item])
  }
  return list.map((entry, i) => (i === idx ? item : entry))
}

function sortPending<T extends { id: string }>(list: T[]) {
  return [...list].sort((a, b) => cmp(a.id, b.id))
}

function filterPermission(list: PermissionRequest[], sessionIDs: string[]) {
  return sortRequests(list, sessionIDs)
}

function filterQuestion(list: QuestionRequest[], sessionIDs: string[]) {
  return sortRequests(list, sessionIDs)
}

function sortRequests<T extends { id: string; sessionID: string }>(list: T[], sessionIDs: string[]) {
  const order = new Map(sessionIDs.map((item, index) => [item, index]))
  return [...list]
    .filter((item) => order.has(item.sessionID))
    .sort((a, b) => {
      const sessionCmp = (order.get(a.sessionID) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.sessionID) ?? Number.MAX_SAFE_INTEGER)
      if (sessionCmp !== 0) {
        return sessionCmp
      }
      return cmp(a.id, b.id)
    })
}

function sortDiff(diff: FileDiff[]) {
  return [...diff].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
}

function nextChildSessions(children: Record<string, NonNullable<SessionSnapshot["session"]>>, info: NonNullable<SessionSnapshot["session"]>) {
  if (info.time.archived) {
    return removeChildSessions(children, descendantIds(children, info.id))
  }

  return {
    ...children,
    [info.id]: info,
  }
}

function removeChildSessions(children: Record<string, NonNullable<SessionSnapshot["session"]>>, ids: string[]) {
  const blocked = new Set(ids)
  const next: Record<string, NonNullable<SessionSnapshot["session"]>> = {}
  for (const [id, info] of Object.entries(children)) {
    if (!blocked.has(id)) {
      next[id] = info
    }
  }
  return next
}

function removeChildMessages(children: Record<string, SessionMessage[]>, ids: string[]) {
  const blocked = new Set(ids)
  const next: Record<string, SessionMessage[]> = {}
  for (const [id, messages] of Object.entries(children)) {
    if (!blocked.has(id)) {
      next[id] = messages
    }
  }
  return next
}

function pruneChildMessages(children: Record<string, SessionMessage[]>, ids: string[]) {
  const allowed = new Set(ids)
  const next: Record<string, SessionMessage[]> = {}
  for (const [id, messages] of Object.entries(children)) {
    if (allowed.has(id)) {
      next[id] = messages
    }
  }
  return next
}

function descendantIds(children: Record<string, NonNullable<SessionSnapshot["session"]>>, root: string) {
  const ids = [root]
  const queue = [root]
  while (queue.length > 0) {
    const parent = queue.shift()
    if (!parent) {
      continue
    }
    for (const info of Object.values(children)) {
      if (info.parentID === parent && !ids.includes(info.id)) {
        ids.push(info.id)
        queue.push(info.id)
      }
    }
  }
  return ids
}

function subtreeIds(rootID: string, root: SessionSnapshot["session"], children: Record<string, NonNullable<SessionSnapshot["session"]>>) {
  const sessions = root ? [root, ...Object.values(children)] : Object.values(children)
  const ids = [rootID]
  const queue = [rootID]
  while (queue.length > 0) {
    const parent = queue.shift()
    if (!parent) {
      continue
    }
    const next = sessions
      .filter((item) => item.id !== rootID && item.parentID === parent && !item.time.archived)
      .sort((a, b) => cmp(a.id, b.id))
    for (const info of next) {
      if (!ids.includes(info.id)) {
        ids.push(info.id)
        queue.push(info.id)
      }
    }
  }
  return ids
}

function nextNavigation(session: SessionSnapshot["session"], children: Record<string, NonNullable<SessionSnapshot["session"]>>) {
  if (!session) {
    return {}
  }

  const sessions = [session, ...Object.values(children)]
  const rootID = session.parentID || session.id
  const visible = sessions
    .filter((item) => item.parentID === rootID && !item.time.archived)
    .sort((a, b) => cmp(a.id, b.id))
  const firstChild = visible[0]

  if (!session.parentID) {
    return {
      firstChild: firstChild ? sessionRef(firstChild) : undefined,
    }
  }

  const parent = children[session.parentID]
  const index = visible.findIndex((item) => item.id === session.id)
  const prev = index >= 0 && visible.length > 1 ? visible[(index - 1 + visible.length) % visible.length] : undefined
  const next = index >= 0 && visible.length > 1 ? visible[(index + 1) % visible.length] : undefined
  return {
    firstChild: firstChild ? sessionRef(firstChild) : undefined,
    parent: parent ? sessionRef(parent) : undefined,
    prev: prev && prev.id !== session.id ? sessionRef(prev) : undefined,
    next: next && next.id !== session.id ? sessionRef(next) : undefined,
  }
}

function sessionRef(session: NonNullable<SessionSnapshot["session"]>) {
  return {
    id: session.id,
    title: session.title || session.id.slice(0, 8),
  }
}

function cmp(a: string, b: string) {
  if (a < b) {
    return -1
  }

  if (a > b) {
    return 1
  }

  return 0
}
