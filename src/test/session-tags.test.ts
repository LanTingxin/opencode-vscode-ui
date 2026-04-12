import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { parseSessionTagsInput, SessionTagStore } from "../core/session-tags"

function memoryState() {
  const state = new Map<string, unknown>()

  return {
    get<T>(key: string, fallback?: T) {
      return (state.has(key) ? state.get(key) : fallback) as T
    },
    async update(key: string, value: unknown) {
      state.set(key, value)
    },
  }
}

describe("session tag store", () => {
  test("stores tags by workspace and session id", async () => {
    const store = new SessionTagStore(memoryState() as any)
    await store.setTags("ws-1", "s1", ["bug", "urgent"])

    assert.deepEqual(store.tags("ws-1", "s1"), ["bug", "urgent"])
    assert.deepEqual(store.tags("ws-2", "s1"), [])
  })

  test("clears empty tag sets instead of keeping blank metadata", async () => {
    const store = new SessionTagStore(memoryState() as any)
    await store.setTags("ws-1", "s1", ["bug"])
    await store.setTags("ws-1", "s1", [])

    assert.deepEqual(store.tags("ws-1", "s1"), [])
  })

  test("lists known tags for one workspace without leaking from others", async () => {
    const store = new SessionTagStore(memoryState() as any)
    await store.setTags("ws-1", "s1", ["bug", "urgent"])
    await store.setTags("ws-1", "s2", ["backend"])
    await store.setTags("ws-2", "s3", ["frontend"])

    assert.deepEqual(store.workspaceTags("ws-1"), ["backend", "bug", "urgent"])
  })

  test("normalizes comma-separated tag input into unique trimmed tags", () => {
    assert.deepEqual(parseSessionTagsInput("bug, urgent, bug , backend"), ["bug", "urgent", "backend"])
  })
})
