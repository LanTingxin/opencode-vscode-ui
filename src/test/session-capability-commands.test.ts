import assert from "node:assert/strict"
import { describe, test } from "node:test"

import type { SessionInfo } from "../core/sdk"
import { archiveSession, shareSession, unshareSession } from "../core/commands"

function session(id: string, title = "Session"): SessionInfo {
  return {
    id,
    directory: "/workspace-a",
    title,
    time: {
      created: 1,
      updated: 1,
    },
  }
}

function readyRuntime(overrides?: Record<string, unknown>) {
  return {
    workspaceId: "file:///workspace-a",
    dir: "/workspace-a",
    name: "workspace-a",
    state: "ready" as const,
    sdk: {
      session: {},
    },
    ...overrides,
  }
}

describe("archiveSession", () => {
  test("confirms before archiving, stores an archived timestamp, and refreshes workspace sessions", async () => {
    let prompt: string | undefined
    let updated: unknown
    let refreshed: unknown

    await archiveSession({
      target: {
        runtime: readyRuntime({
          sdk: {
            session: {
              update: async (input: unknown) => {
                updated = input
                return { data: {} }
              },
            },
          },
        }) as any,
        session: session("session-archive", "Archive me"),
      },
      sessions: {
        refresh: async (...args: unknown[]) => {
          refreshed = args
        },
      } as any,
      now: () => 123456,
      showWarningMessage: async (message) => {
        prompt = message
        return "Archive Session"
      },
      showErrorMessage: async () => undefined,
      showInformationMessage: async () => undefined,
    })

    assert.match(prompt ?? "", /Archive me/)
    assert.deepEqual(updated, {
      sessionID: "session-archive",
      directory: "/workspace-a",
      time: {
        archived: 123456,
      },
    })
    assert.deepEqual(refreshed, ["file:///workspace-a", true])
  })
})

describe("shareSession", () => {
  test("copies the shared URL and shows a success message", async () => {
    let copied: string | undefined
    let message: string | undefined
    let shared: unknown

    await shareSession({
      target: {
        runtime: readyRuntime({
          sdk: {
            session: {
              share: async (input: unknown) => {
                shared = input
                return {
                  data: {
                    ...session("session-share"),
                    share: { url: "https://share.example/session-share" },
                  },
                }
              },
            },
          },
        }) as any,
        session: session("session-share", "Share me"),
      },
      copyText: async (value) => {
        copied = value
      },
      sessions: {
        refresh: async () => undefined,
      } as any,
      showErrorMessage: async () => undefined,
      showInformationMessage: async (value) => {
        message = value
      },
    })

    assert.deepEqual(shared, {
      sessionID: "session-share",
      directory: "/workspace-a",
    })
    assert.equal(copied, "https://share.example/session-share")
    assert.match(message ?? "", /copied/i)
  })
})

describe("unshareSession", () => {
  test("unshares the session, refreshes workspace sessions, and shows a success message", async () => {
    let unshared: unknown
    let refreshed: unknown
    let message: string | undefined

    await unshareSession({
      target: {
        runtime: readyRuntime({
          sdk: {
            session: {
              unshare: async (input: unknown) => {
                unshared = input
                return { data: session("session-share") }
              },
            },
          },
        }) as any,
        session: {
          ...session("session-share", "Shared session"),
          share: {
            url: "https://share.example/session-share",
          },
        },
      },
      sessions: {
        refresh: async (...args: unknown[]) => {
          refreshed = args
        },
      } as any,
      showErrorMessage: async () => undefined,
      showInformationMessage: async (value) => {
        message = value
      },
    })

    assert.deepEqual(unshared, {
      sessionID: "session-share",
      directory: "/workspace-a",
    })
    assert.deepEqual(refreshed, ["file:///workspace-a", true])
    assert.match(message ?? "", /unshared/i)
  })
})
