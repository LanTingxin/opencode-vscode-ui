import assert from "node:assert/strict"
import { describe, test } from "node:test"
import * as vscode from "vscode"

import type { SessionPanelRef } from "../bridge/types"
import type { SessionInfo, SessionStatus } from "../core/sdk"
import { forkSessionMessage, renameSession, resolveNewSessionOpenColumn, resolveReusableNewSession, resolveSeedSessionTarget } from "../core/commands"

function session(id: string, updated: number, title = `New session - ${id}`): SessionInfo {
  return {
    id,
    directory: "/workspace-a",
    title,
    time: {
      created: updated,
      updated,
    },
  }
}

describe("resolveSeedSessionTarget", () => {
  test("prefers a visible session in the same workspace before the most recent one", () => {
    const visible = {
      workspaceId: "file:///workspace-a",
      dir: "/workspace-a",
      sessionId: "session-visible",
    } satisfies SessionPanelRef

    const recent = {
      workspaceId: "file:///workspace-a",
      dir: "/workspace-a",
      sessionId: "session-recent",
    } satisfies SessionPanelRef

    const target = resolveSeedSessionTarget({
      workspaceId: "file:///workspace-a",
      visibleSession: visible,
      recentSession: recent,
    })

    assert.deepEqual(target, visible)
  })

  test("reuses the most recent open session in the same workspace when no panel is active", () => {
    const recent = {
      workspaceId: "file:///workspace-a",
      dir: "/workspace-a",
      sessionId: "session-1",
    } satisfies SessionPanelRef

    const target = resolveSeedSessionTarget({
      workspaceId: "file:///workspace-a",
      recentSession: recent,
    })

    assert.deepEqual(target, recent)
  })

  test("ignores open sessions from other workspaces", () => {
    const recent = {
      workspaceId: "file:///workspace-b",
      dir: "/workspace-b",
      sessionId: "session-2",
    } satisfies SessionPanelRef

    const target = resolveSeedSessionTarget({
      workspaceId: "file:///workspace-a",
      recentSession: recent,
    })

    assert.equal(target, undefined)
  })
})

describe("resolveReusableNewSession", () => {
  test("reuses the most recent empty default new session and marks older ones as stale", () => {
    const newest = session("session-newest", 30)
    const older = session("session-older", 20)
    const keep = session("session-keep", 10, "Investigation notes")
    const statuses = new Map<string, SessionStatus>()

    const target = resolveReusableNewSession({
      sessions: [older, keep, newest],
      emptySessionIds: new Set([newest.id, older.id]),
      statuses,
    })

    assert.equal(target.keep?.id, newest.id)
    assert.deepEqual(target.stale.map((item) => item.id), [older.id])
  })

  test("keeps an explicitly preferred empty new session while pruning older empty duplicates", () => {
    const newest = session("session-newest", 30)
    const created = session("session-created", 40)
    const statuses = new Map<string, SessionStatus>()

    const target = resolveReusableNewSession({
      sessions: [newest, created],
      emptySessionIds: new Set([newest.id, created.id]),
      statuses,
      preferredSessionId: created.id,
    })

    assert.equal(target.keep?.id, created.id)
    assert.deepEqual(target.stale.map((item) => item.id), [newest.id])
  })

  test("treats the compact New session title as a reusable default session", () => {
    const newest = session("session-newest", 30, "New session")
    const renamed = session("session-renamed", 10, "Refactor task")
    const statuses = new Map<string, SessionStatus>()

    const target = resolveReusableNewSession({
      sessions: [renamed, newest],
      emptySessionIds: new Set([newest.id, renamed.id]),
      statuses,
    })

    assert.equal(target.keep?.id, newest.id)
    assert.deepEqual(target.stale, [])
  })

  test("ignores sessions that are busy, have messages, or no longer use the default new-session title", () => {
    const busy = session("session-busy", 30)
    const withMessages = session("session-with-messages", 20)
    const renamed = session("session-renamed", 10, "Refactor task")
    const statuses = new Map<string, SessionStatus>([
      [busy.id, { type: "busy" }],
    ])

    const target = resolveReusableNewSession({
      sessions: [busy, withMessages, renamed],
      emptySessionIds: new Set([busy.id, renamed.id]),
      statuses,
    })

    assert.equal(target.keep, undefined)
    assert.deepEqual(target.stale, [])
  })
})

describe("resolveNewSessionOpenColumn", () => {
  test("opens newly created session panels beside the current editor column", () => {
    assert.equal(resolveNewSessionOpenColumn(), vscode.ViewColumn.Beside)
  })
})

describe("forkSessionMessage", () => {
  test("uses official session.fork with the selected message id", async () => {
    let forked: unknown

    const result = await forkSessionMessage({
      runtime: {
        workspaceId: "file:///workspace-a",
        dir: "/workspace-a",
        name: "workspace-a",
        state: "ready",
        sdk: {
          session: {
            messages: async () => ({
              data: [{
                info: {
                  id: "msg-1",
                  sessionID: "session-root",
                  role: "user",
                  time: { created: 1 },
                },
                parts: [],
              }],
            }),
            fork: async (input: unknown) => {
              forked = input
              return {
                data: {
                  id: "session-fork",
                  directory: "/workspace-a",
                  title: "Fork",
                  time: { created: 2, updated: 2 },
                },
              }
            },
          },
        },
      } as any,
      current: {
        workspaceId: "file:///workspace-a",
        dir: "/workspace-a",
        sessionId: "session-root",
      },
      messageID: "msg-1",
    })

    assert.deepEqual(forked, {
      sessionID: "session-root",
      directory: "/workspace-a",
      messageID: "msg-1",
    })
    assert.equal(result?.id, "session-fork")
  })
})

describe("renameSession", () => {
  test("prompts with the current title, updates the session title, and refreshes workspace sessions", async () => {
    let inputOptions: vscode.InputBoxOptions | undefined
    let updated: unknown
    let refreshed: unknown

    await renameSession({
      target: {
        runtime: {
          workspaceId: "file:///workspace-a",
          dir: "/workspace-a",
          name: "workspace-a",
          state: "ready",
          sdk: {
            session: {
              update: async (input: unknown) => {
                updated = input
                return { data: {} }
              },
            },
          },
        } as any,
        session: session("session-rename", 1, "Current title"),
      },
      sessions: {
        refresh: async (...args: unknown[]) => {
          refreshed = args
        },
      } as any,
      showInputBox: async (options) => {
        inputOptions = options
        return "Renamed session"
      },
      showErrorMessage: async () => undefined,
      showInformationMessage: async () => undefined,
    })

    assert.equal(inputOptions?.value, "Current title")
    assert.match(inputOptions?.prompt ?? "", /Current title/)
    assert.deepEqual(updated, {
      sessionID: "session-rename",
      directory: "/workspace-a",
      title: "Renamed session",
    })
    assert.deepEqual(refreshed, ["file:///workspace-a", true])
  })
})
