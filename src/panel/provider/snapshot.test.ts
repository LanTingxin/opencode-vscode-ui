import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { buildSessionSnapshot } from "./snapshot"
import type { SkillCatalogEntry } from "../../bridge/types"
import type { SessionInfo, SessionMessage, SessionStatus } from "../../core/sdk"

type Runtime = {
  workspaceId: string
  dir: string
  name: string
  state: "ready"
  sdk: any
  sessions: Map<string, SessionInfo>
  sessionStatuses: Map<string, SessionStatus>
}

function session(id: string, parentID?: string): SessionInfo {
  return {
    id,
    directory: "/workspace",
    parentID,
    title: id,
    time: {
      created: 1,
      updated: 1,
    },
  }
}

const BRAINSTORMING_SKILL: SkillCatalogEntry = {
  name: "brainstorming",
  content: `# Brainstorming Ideas Into Designs

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.
`.trim(),
  location: "/Users/lantingxin/.codex/superpowers/skills/brainstorming/SKILL.md",
}

function sessionMessage(sessionID: string, id: string): SessionMessage {
  return {
    info: {
      id,
      sessionID,
      role: "assistant",
      time: { created: 1 },
    },
    parts: [{
      id: `${id}-part`,
      sessionID,
      messageID: id,
      type: "text",
      text: id,
    }],
  }
}

function createSdk(
  current: SessionInfo,
  skills: Array<{ name: string; description: string; location: string; content: string }> = [],
  messagesBySessionId: Record<string, SessionMessage[]> = {},
) {
  const root = session("root")

  return {
    session: {
      get: async ({ sessionID }: { sessionID: string }) => {
        if (sessionID === current.id) {
          return { data: current }
        }
        if (sessionID === root.id) {
          return { data: root }
        }
        return { data: undefined }
      },
      messages: async (input: { sessionID: string; directory: string; limit: number }) => ({
        data: (messagesBySessionId[input.sessionID] ?? []).slice(-input.limit),
      }),
      todo: async () => ({ data: [] }),
      diff: async () => ({ data: [] }),
      status: async () => ({ data: {} }),
      children: async ({ sessionID }: { sessionID: string; directory: string }) => {
        if (sessionID === root.id) {
          return { data: [current] }
        }
        return { data: [] }
      },
    },
    provider: {
      list: async () => ({ data: { all: [], default: {} } }),
      auth: async () => ({ data: {} }),
    },
    permission: {
      list: async () => ({ data: [] }),
    },
    question: {
      list: async () => ({ data: [] }),
    },
    mcp: {
      status: async () => ({ data: {} }),
    },
    lsp: {
      status: async () => ({ data: [] }),
    },
    formatter: {
      status: async () => ({ data: [] }),
    },
    command: {
      list: async () => ({
        data: [{
          name: "init",
          description: "create/update AGENTS.md",
          template: "Create or update AGENTS.md for this repository.",
          hints: [],
          source: "command",
        }],
      }),
    },
    app: {
      skills: async () => ({ data: skills }),
    },
  }
}

describe("buildSessionSnapshot session list filtering", () => {
  test("does not add child sessions to the root session list", async () => {
    const root = session("root")
    const child = session("child", root.id)
    const rt: Runtime = {
      workspaceId: "ws-1",
      dir: "/workspace",
      name: "workspace",
      state: "ready",
      sdk: createSdk(child),
      sessions: new Map([[root.id, root]]),
      sessionStatuses: new Map([[root.id, { type: "idle" }]]),
    }

    const build = await buildSessionSnapshot({
      ref: {
        workspaceId: rt.workspaceId,
        dir: rt.dir,
        sessionId: child.id,
      },
      mgr: {
        get(id: string) {
          return id === rt.workspaceId ? rt : undefined
        },
      } as any,
      log() {},
      isSubmitting: () => false,
    })

    assert.equal(build.snapshot.session?.id, child.id)
    assert.deepEqual([...rt.sessions.keys()], [root.id])
    assert.equal(rt.sessionStatuses.has(child.id), false)
  })

  test("loads the skill catalog from the official sdk skills endpoint", async () => {
    const current = session("child", "root")
    const rt: Runtime = {
      workspaceId: "ws-1",
      dir: "/workspace",
      name: "workspace",
      state: "ready",
      sdk: createSdk(current, [{
        name: "brainstorming",
        description: "Turn ideas into designs.",
        location: "/Users/lantingxin/.codex/superpowers/skills/brainstorming/SKILL.md",
        content: BRAINSTORMING_SKILL.content,
      }]),
      sessions: new Map(),
      sessionStatuses: new Map(),
    }

    const build = await buildSessionSnapshot({
      ref: {
        workspaceId: rt.workspaceId,
        dir: rt.dir,
        sessionId: current.id,
      },
      mgr: {
        get(id: string) {
          return id === rt.workspaceId ? rt : undefined
        },
      } as any,
      log() {},
      isSubmitting: () => false,
    })

    assert.deepEqual(build.snapshot.skillCatalog, [BRAINSTORMING_SKILL])
  })

  test("loads command templates from the official sdk commands endpoint", async () => {
    const current = session("child", "root")
    const rt: Runtime = {
      workspaceId: "ws-1",
      dir: "/workspace",
      name: "workspace",
      state: "ready",
      sdk: createSdk(current),
      sessions: new Map(),
      sessionStatuses: new Map(),
    }

    const build = await buildSessionSnapshot({
      ref: {
        workspaceId: rt.workspaceId,
        dir: rt.dir,
        sessionId: current.id,
      },
      mgr: {
        get(id: string) {
          return id === rt.workspaceId ? rt : undefined
        },
      } as any,
      log() {},
      isSubmitting: () => false,
    })

    const deferred = await build.deferred
    assert.deepEqual(deferred?.commands, [{
      name: "init",
      description: "create/update AGENTS.md",
      template: "Create or update AGENTS.md for this repository.",
      hints: [],
      source: "command",
    }])
  })

  test("tracks whether earlier session messages still need to be loaded", async () => {
    const current = session("child", "root")
    const allMessages = Array.from({ length: 250 }, (_, index) =>
      sessionMessage(current.id, `m${String(index).padStart(4, "0")}`),
    )
    const rt: Runtime = {
      workspaceId: "ws-1",
      dir: "/workspace",
      name: "workspace",
      state: "ready",
      sdk: createSdk(current, [], {
        [current.id]: allMessages,
      }),
      sessions: new Map(),
      sessionStatuses: new Map(),
    }

    const clipped = await buildSessionSnapshot({
      ref: {
        workspaceId: rt.workspaceId,
        dir: rt.dir,
        sessionId: current.id,
      },
      mgr: {
        get(id: string) {
          return id === rt.workspaceId ? rt : undefined
        },
      } as any,
      log() {},
      isSubmitting: () => false,
      messageLimit: 200,
    })

    assert.equal(clipped.snapshot.messages.length, 200)
    assert.deepEqual(clipped.snapshot.messageHistory, {
      limit: 200,
      hasEarlier: true,
    })

    const expanded = await buildSessionSnapshot({
      ref: {
        workspaceId: rt.workspaceId,
        dir: rt.dir,
        sessionId: current.id,
      },
      mgr: {
        get(id: string) {
          return id === rt.workspaceId ? rt : undefined
        },
      } as any,
      log() {},
      isSubmitting: () => false,
      messageLimit: 400,
    })

    assert.equal(expanded.snapshot.messages.length, 250)
    assert.deepEqual(expanded.snapshot.messageHistory, {
      limit: 400,
      hasEarlier: false,
    })
  })
})
