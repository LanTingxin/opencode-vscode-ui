import * as vscode from "vscode"

type SessionTagRecord = {
  tags: string[]
}

type SessionTagSnapshot = Record<string, SessionTagRecord>

const storageKey = "session-tags"

export class SessionTagStore {
  constructor(private state: vscode.Memento) {}

  tags(workspaceId: string, sessionId: string) {
    return this.tagsBySession(workspaceId)[sessionId] ?? []
  }

  workspaceTags(workspaceId: string) {
    const tags = new Set<string>()

    for (const value of Object.values(this.tagsBySession(workspaceId))) {
      for (const tag of value) {
        tags.add(tag)
      }
    }

    return [...tags].sort((a, b) => a.localeCompare(b))
  }

  tagsBySession(workspaceId: string) {
    const prefix = `${workspaceId}::`
    const out: Record<string, string[]> = {}

    for (const [key, value] of Object.entries(this.snapshot())) {
      if (!key.startsWith(prefix)) {
        continue
      }

      out[key.slice(prefix.length)] = value.tags
    }

    return out
  }

  async setTags(workspaceId: string, sessionId: string, tags: string[]) {
    const snapshot = this.snapshot()
    const key = sessionTagKey(workspaceId, sessionId)
    const next = tags.map((tag) => tag.trim()).filter(Boolean)

    if (next.length === 0) {
      delete snapshot[key]
    } else {
      snapshot[key] = { tags: next }
    }

    await this.state.update(storageKey, snapshot)
  }

  private snapshot() {
    return { ...(this.state.get<SessionTagSnapshot>(storageKey, {}) ?? {}) }
  }
}

export function parseSessionTagsInput(input: string) {
  const seen = new Set<string>()
  const out: string[] = []

  for (const raw of input.split(",")) {
    const tag = raw.trim()
    if (!tag || seen.has(tag)) {
      continue
    }
    seen.add(tag)
    out.push(tag)
  }

  return out
}

function sessionTagKey(workspaceId: string, sessionId: string) {
  return `${workspaceId}::${sessionId}`
}
