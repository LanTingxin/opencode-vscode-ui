import assert from "node:assert/strict"
import { describe, test } from "node:test"

import type { SessionInfo } from "../core/sdk"
import { buildWorkspaceChildren, clearWorkspaceSearchState, getWorkspaceSearchQuery, setWorkspaceSearchError, setWorkspaceSearchLoading, setWorkspaceSearchResult } from "../sidebar/provider"

function session(id: string, title: string, updated = 1): SessionInfo {
  return {
    id,
    directory: "/workspace",
    title,
    time: {
      created: updated,
      updated,
    },
  }
}

function runtime() {
  return {
    workspaceId: "ws-1",
    dir: "/workspace",
    name: "Workspace",
    state: "ready" as const,
    sessionsState: "ready" as const,
    sessionStatuses: new Map(),
    url: "http://127.0.0.1:3000",
    port: 3000,
  }
}

describe("sidebar session search", () => {
  test("shows normal session items when search mode is inactive", () => {
    const items = buildWorkspaceChildren({
      runtime: {
        ...runtime(),
      },
      sessions: [session("s1", "Fix login")],
      statuses: new Map(),
    })

    assert.equal(items[0]?.contextValue, "session")
  })

  test("shows clear search and matching sessions while search mode is active", () => {
    const items = buildWorkspaceChildren({
      runtime: {
        ...runtime(),
      },
      sessions: [],
      statuses: new Map(),
      search: {
        query: "login",
        status: "ready",
        results: [session("s1", "Fix login")],
      },
    })

    assert.equal(items[0]?.contextValue, "clear-search")
    assert.equal(items[1]?.contextValue, "session")
  })

  test("shows a loading status while search is in progress", () => {
    const items = buildWorkspaceChildren({
      runtime: {
        ...runtime(),
      },
      sessions: [],
      statuses: new Map(),
      search: {
        query: "login",
        status: "loading",
        results: [],
      },
    })

    assert.equal(items[0]?.contextValue, "clear-search")
    assert.equal(items[1]?.label, "Searching sessions...")
  })

  test("shows an empty state when search has no results", () => {
    const items = buildWorkspaceChildren({
      runtime: {
        ...runtime(),
      },
      sessions: [],
      statuses: new Map(),
      search: {
        query: "login",
        status: "ready",
        results: [],
      },
    })

    assert.equal(items[0]?.contextValue, "clear-search")
    assert.equal(items[1]?.label, "No matching sessions")
  })

  test("shows an error state while keeping clear search available", () => {
    const items = buildWorkspaceChildren({
      runtime: {
        ...runtime(),
      },
      sessions: [],
      statuses: new Map(),
      search: {
        query: "login",
        status: "error",
        results: [],
        error: "request failed",
      },
    })

    assert.equal(items[0]?.contextValue, "clear-search")
    assert.equal(items[1]?.label, "Search error: request failed")
  })

  test("clears only the targeted workspace search state", () => {
    const state = new Map()

    setWorkspaceSearchResult(state, "ws-1", "login", [session("s1", "Fix login")])
    setWorkspaceSearchResult(state, "ws-2", "billing", [session("s2", "Fix billing")])

    clearWorkspaceSearchState(state, "ws-1")

    assert.equal(state.has("ws-1"), false)
    assert.equal(state.get("ws-2")?.query, "billing")
  })

  test("updates search state between loading result and error transitions", () => {
    const state = new Map()

    setWorkspaceSearchLoading(state, "ws-1", "login")
    assert.deepEqual(state.get("ws-1"), {
      query: "login",
      status: "loading",
      results: [],
    })

    setWorkspaceSearchResult(state, "ws-1", "login", [session("s1", "Fix login")])
    assert.equal(state.get("ws-1")?.status, "ready")
    assert.equal(state.get("ws-1")?.results.length, 1)

    setWorkspaceSearchError(state, "ws-1", "login", "request failed")
    assert.deepEqual(state.get("ws-1"), {
      query: "login",
      status: "error",
      results: [],
      error: "request failed",
    })
  })

  test("returns the last query for an active workspace search", () => {
    const state = new Map()

    setWorkspaceSearchResult(state, "ws-1", "login", [session("s1", "Fix login")])

    assert.equal(getWorkspaceSearchQuery(state, "ws-1"), "login")

    clearWorkspaceSearchState(state, "ws-1")

    assert.equal(getWorkspaceSearchQuery(state, "ws-1"), undefined)
  })

  test("renders tag summary on session items", () => {
    const items = buildWorkspaceChildren({
      runtime: {
        ...runtime(),
      },
      sessions: [session("s1", "Fix login")],
      statuses: new Map(),
      tags: {
        s1: ["bug", "urgent", "backend"],
      },
    })

    assert.equal(String(items[0]?.description).includes("bug"), true)
  })

  test("intersects workspace tag filters with text search results", () => {
    const items = buildWorkspaceChildren({
      runtime: {
        ...runtime(),
      },
      sessions: [session("s1", "Fix login"), session("s2", "Fix billing")],
      statuses: new Map(),
      search: {
        query: "fix",
        status: "ready",
        results: [session("s1", "Fix login"), session("s2", "Fix billing")],
      },
      tagFilter: "bug",
      tags: {
        s1: ["bug"],
        s2: ["billing"],
      },
    })

    assert.equal(items.filter((item) => item.contextValue === "session").length, 1)
    assert.equal(items.find((item) => item.contextValue === "session")?.label, "Fix login")
  })
})
