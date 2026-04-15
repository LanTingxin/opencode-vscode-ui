import assert from "node:assert/strict"
import { describe, test } from "node:test"
import * as vscode from "vscode"

import type { HostMessage, SessionSnapshot } from "../../bridge/types"
import type { PermissionRequest, QuestionRequest, SessionEvent, SessionInfo, SessionMessage } from "../../core/sdk"
import { SessionPanelController } from "./controller"
import { panelTitle } from "./utils"

type Harness = {
  controller: SessionPanelController
  pushes: Array<{ force: boolean | undefined; reason: string | undefined }>
  snapshots: Array<{ payload: SessionSnapshot; reason: string }>
  events: Array<Extract<HostMessage, { type: "sessionEvent" }>>
  logs: string[]
}

function sessionInfo(id: string, parentID?: string): SessionInfo {
  return {
    id,
    directory: "/workspace",
    parentID,
    title: id,
    time: { created: 1, updated: 1 },
  }
}

function message(sessionID: string, id: string, text: string): SessionMessage {
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
      text,
    }],
  }
}

function snapshot(options?: {
  session?: SessionInfo
  messages?: SessionMessage[]
  childSessions?: Record<string, SessionInfo>
  childMessages?: Record<string, SessionMessage[]>
  relatedSessionIds?: string[]
}): SessionSnapshot {
  const session = options?.session ?? sessionInfo("root")
  return {
    status: "ready",
    workspaceName: "workspace",
    sessionRef: {
      workspaceId: "file:///workspace",
      dir: "/workspace",
      sessionId: session.id,
    },
    session,
    message: "ready",
    display: {
      showInternals: false,
      showThinking: true,
      diffMode: "unified",
      panelTheme: "default",
    },
    sessionStatus: { type: "idle" },
    messages: options?.messages ?? [message(session.id, "m1", "hello")],
    childMessages: options?.childMessages ?? {},
    childSessions: options?.childSessions ?? {},
    submitting: false,
    todos: [],
    diff: [],
    permissions: [],
    questions: [],
    agents: [],
    defaultAgent: undefined,
    providers: [],
    providerDefault: undefined,
    configuredModel: undefined,
    mcp: {},
    mcpResources: {},
    lsp: [],
    commands: [],
    relatedSessionIds: options?.relatedSessionIds ?? [session.id],
    agentMode: "build",
    navigation: {},
  }
}

function createHarness(current: SessionSnapshot, incrementalReady = true): Harness {
  const pushes: Harness["pushes"] = []
  const snapshots: Harness["snapshots"] = []
  const events: Harness["events"] = []
  const logs: Harness["logs"] = []
  const controller = Object.create(SessionPanelController.prototype) as any

  controller.ready = true
  controller.incrementalReady = incrementalReady
  controller.current = current
  controller.extensionUri = { path: "/extension", fsPath: "/extension", toString: () => "/extension" }
  controller.ref = current.sessionRef
  controller.panel = { title: panelTitle(current.session?.title || current.sessionRef.sessionId) }
  controller.deferredDirty = {
    sessionStatus: false,
    permissions: false,
    questions: false,
  }
  controller.state = {
    disposed: false,
    run: 0,
    pendingSubmitCount: 0,
  }
  controller.push = async (force: boolean | undefined, reason: string | undefined) => {
    pushes.push({ force, reason })
  }
  controller.post = async (payload: SessionSnapshot, reason: string) => {
    snapshots.push({ payload, reason })
  }
  controller.postEvent = async (hostMessage: Extract<HostMessage, { type: "sessionEvent" }>) => {
    events.push(hostMessage)
  }
  controller.out = {
    appendLine(message: string) {
      logs.push(message)
    },
  }
  controller.key = `${current.sessionRef.workspaceId}:${current.sessionRef.sessionId}`

  return { controller, pushes, snapshots, events, logs }
}

async function handle(controller: SessionPanelController, event: SessionEvent) {
  await (controller as any).handle(event)
}

function createWebviewMessageHarness(rt: Record<string, unknown>) {
  let onMessage: ((message: unknown) => void) | undefined
  const panel = {
    viewColumn: vscode.ViewColumn.Active,
    webview: {
      options: undefined,
      html: "",
      asWebviewUri: (value: unknown) => value,
      onDidReceiveMessage(listener: (message: unknown) => void) {
        onMessage = listener
        return { dispose() {} }
      },
      postMessage: async () => true,
    },
    onDidDispose: () => ({ dispose() {} }),
    onDidChangeViewState: () => ({ dispose() {} }),
    reveal() {},
    title: "",
    iconPath: undefined,
  }

  const controller = new SessionPanelController(
    vscode.Uri.parse("/extension"),
    {
      workspaceId: "file:///workspace",
      dir: "/workspace",
      sessionId: "session-1",
    },
    "file:///workspace:session-1",
    panel as any,
    {
      get: () => rt,
      onDidChange: () => ({ dispose() {} }),
    } as any,
    {
      onDidEvent: () => ({ dispose() {} }),
    } as any,
    {
      appendLine() {},
    } as any,
    () => {},
    () => {},
  )

  return {
    controller,
    send(message: unknown) {
      onMessage?.(message)
    },
  }
}

describe("SessionPanelController.handle", () => {
  test("keeps transcript delta events on sessionEvent when incremental routing is ready", async () => {
    const current = snapshot()
    const { controller, pushes, snapshots, events } = createHarness(current)
    const event = {
      type: "message.part.delta",
      properties: {
        sessionID: "root",
        messageID: "m1",
        partID: "m1-part",
        field: "text",
        delta: " world",
      },
    } as const satisfies SessionEvent

    await handle(controller, event)

    assert.deepEqual(pushes, [])
    assert.deepEqual(snapshots, [])
    assert.deepEqual(events, [{ type: "sessionEvent", event }])
    const next = (controller as any).current as SessionSnapshot
    assert.equal(next.messages[0]?.parts[0]?.type, "text")
    assert.equal(next.messages[0]?.parts[0]?.type === "text" ? next.messages[0].parts[0].text : undefined, "hello world")
  })

  test("keeps status, diff, permission, and question events incremental and marks deferred state dirty", async () => {
    const current = snapshot({ relatedSessionIds: ["root", "child"] })
    const statusHarness = createHarness(current)
    const statusEvent = {
      type: "session.status",
      properties: {
        sessionID: "root",
        status: { type: "busy" },
      },
    } as const satisfies SessionEvent

    await handle(statusHarness.controller, statusEvent)

    assert.equal(statusHarness.controller["deferredDirty"].sessionStatus, true)
    assert.deepEqual(statusHarness.events, [{ type: "sessionEvent", event: statusEvent }])
    assert.deepEqual((statusHarness.controller as any).current.sessionStatus, { type: "busy" })

    const diffHarness = createHarness(current)
    const diffEvent = {
      type: "session.diff",
      properties: {
        sessionID: "root",
        diff: [{
          file: "src/app.ts",
          patch: "@@ -1 +1 @@\n-before\n+after\n",
          additions: 1,
          deletions: 1,
          status: "modified" as const,
        }],
      },
    } as const satisfies SessionEvent

    await handle(diffHarness.controller, diffEvent)

    assert.deepEqual(diffHarness.events, [{ type: "sessionEvent", event: diffEvent }])
    assert.equal((diffHarness.controller as any).current.diff[0]?.file, "src/app.ts")

    const permissionHarness = createHarness(current)
    const permissionEvent = {
      type: "permission.asked",
      properties: {
        id: "perm-1",
        sessionID: "child",
        permission: "bash",
        patterns: [],
        metadata: {},
        always: [],
      } satisfies PermissionRequest,
    } as const satisfies SessionEvent

    await handle(permissionHarness.controller, permissionEvent)

    assert.equal(permissionHarness.controller["deferredDirty"].permissions, true)
    assert.deepEqual(permissionHarness.events, [{ type: "sessionEvent", event: permissionEvent }])
    assert.equal((permissionHarness.controller as any).current.permissions[0]?.id, "perm-1")

    const questionHarness = createHarness(current)
    const questionEvent = {
      type: "question.asked",
      properties: {
        id: "question-1",
        sessionID: "child",
        questions: [{
          header: "Approve",
          question: "Continue?",
          options: [{ label: "Yes", description: "Continue the run." }],
        }],
      } satisfies QuestionRequest,
    } as const satisfies SessionEvent

    await handle(questionHarness.controller, questionEvent)

    assert.equal(questionHarness.controller["deferredDirty"].questions, true)
    assert.deepEqual(questionHarness.events, [{ type: "sessionEvent", event: questionEvent }])
    assert.equal((questionHarness.controller as any).current.questions[0]?.id, "question-1")
  })

  test("keeps root panel subtree session updates incremental", async () => {
    const current = snapshot({ relatedSessionIds: ["root"] })
    const { controller, pushes, snapshots, events } = createHarness(current)
    const event = {
      type: "session.created",
      properties: {
        info: sessionInfo("child", "root"),
      },
    } as const satisfies SessionEvent

    await handle(controller, event)

    assert.deepEqual(pushes, [])
    assert.deepEqual(snapshots, [])
    assert.deepEqual(events, [{ type: "sessionEvent", event }])
    const next = (controller as any).current as SessionSnapshot
    assert.equal(next.childSessions.child?.parentID, "root")
    assert.equal(next.relatedSessionIds.includes("root"), true)
    assert.equal(next.relatedSessionIds.includes("child"), true)
  })

  test("refreshes child panels for sibling topology changes", async () => {
    const current = snapshot({
      session: sessionInfo("child", "root"),
      relatedSessionIds: ["child"],
    })
    const { controller, pushes, snapshots, events } = createHarness(current)
    const event = {
      type: "session.created",
      properties: {
        info: sessionInfo("sibling", "root"),
      },
    } as const satisfies SessionEvent

    await handle(controller, event)

    assert.deepEqual(events, [])
    assert.deepEqual(snapshots, [])
    assert.deepEqual(pushes, [{ force: true, reason: "event:session.created:refresh:child-navigation" }])
  })

  test("refreshes root panels for reparent-in topology changes", async () => {
    const current = snapshot({
      relatedSessionIds: ["root", "child"],
      childSessions: {
        child: sessionInfo("child", "root"),
      },
    })
    const { controller, pushes, snapshots, events } = createHarness(current)
    const event = {
      type: "session.updated",
      properties: {
        info: sessionInfo("outside", "child"),
      },
    } as const satisfies SessionEvent

    await handle(controller, event)

    assert.deepEqual(events, [])
    assert.deepEqual(snapshots, [])
    assert.deepEqual(pushes, [{ force: true, reason: "event:session.updated:refresh:reparent-in" }])
  })

  test("keeps transcript events incremental while a refresh is in progress and transcript state is already hydrated", async () => {
    const eventsUnderTest = [
      {
        type: "message.updated",
        properties: {
          info: {
            id: "m2",
            sessionID: "root",
            role: "assistant" as const,
            time: { created: 2 },
          },
        },
      },
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "m1-part",
            sessionID: "root",
            messageID: "m1",
            type: "text" as const,
            text: "hello refreshed",
          },
        },
      },
      {
        type: "message.part.removed",
        properties: {
          messageID: "m1",
          partID: "m1-part",
        },
      },
      {
        type: "message.part.delta",
        properties: {
          sessionID: "root",
          messageID: "m1",
          partID: "m1-part",
          field: "text",
          delta: " world",
        },
      },
    ] as const satisfies SessionEvent[]

    for (const event of eventsUnderTest) {
      const current = snapshot()
      const { controller, pushes, snapshots, events } = createHarness(current, false)
      ;(controller as any).pending = Promise.resolve()

      await handle(controller, event)

      assert.deepEqual(pushes, [], `unexpected refresh for ${event.type}`)
      assert.deepEqual(snapshots, [], `unexpected snapshot fallback for ${event.type}`)
      assert.deepEqual(events, [{ type: "sessionEvent", event }], `expected incremental event for ${event.type}`)
    }
  })

  test("falls back to snapshot routing while incremental delivery is not ready", async () => {
    const current = snapshot()
    const { controller, pushes, snapshots, events } = createHarness(current, false)
    const event = {
      type: "message.updated",
      properties: {
        info: {
          id: "m2",
          sessionID: "root",
          role: "user",
          time: { created: 2 },
        },
      },
    } as const satisfies SessionEvent

    await handle(controller, event)

    assert.deepEqual(pushes, [])
    assert.deepEqual(events, [])
    assert.equal(snapshots.length, 1)
    assert.equal(snapshots[0]?.reason, "event:message.updated:snapshot")
    assert.equal(snapshots[0]?.payload.messages.some((item) => item.info.id === "m2"), true)
  })

  test("updates panel title for incremental session rename events", async () => {
    const current = snapshot()
    const { controller, pushes, snapshots, events } = createHarness(current)
    const event = {
      type: "session.updated",
      properties: {
        info: {
          ...current.session,
          title: "session renamed",
        },
      },
    } as const satisfies SessionEvent

    await handle(controller, event)

    assert.deepEqual(pushes, [])
    assert.deepEqual(snapshots, [])
    assert.deepEqual(events, [{ type: "sessionEvent", event }])
    assert.equal((controller as any).panel.title, panelTitle("session renamed"))
  })

  test("logs key transcript events for the active panel session", async () => {
    const current = snapshot()
    const { controller, logs } = createHarness(current)

    await handle(controller, {
      type: "message.part.updated",
      properties: {
        part: {
          id: "m1-part",
          sessionID: "root",
          messageID: "m1",
          type: "text",
          text: "hello world",
        },
      },
    } satisfies SessionEvent)

    await handle(controller, {
      type: "session.status",
      properties: {
        sessionID: "root",
        status: { type: "busy" },
      },
    } satisfies SessionEvent)

    assert.equal(logs.some((line) => line.includes("event message.part.updated session=root message=m1 part=m1-part partType=text")), true)
    assert.equal(logs.some((line) => line.includes("event session.status session=root status=busy")), true)
  })

  test("routes provider auth recovery messages through the host action path", async () => {
    let authPayload: unknown
    let authorizePayload: unknown
    let opened: string | undefined
    const originalOpenExternal = vscode.env.openExternal
    ;(vscode.env as any).openExternal = async (uri: { toString(): string }) => {
      opened = uri.toString()
      return true
    }

    try {
      const { controller, send } = createWebviewMessageHarness({
        state: "ready",
        dir: "/workspace",
        name: "workspace",
        sdk: {
          provider: {
            auth: async (input: unknown) => {
              authPayload = input
              return {
                data: {
                  openai: [{ type: "oauth", label: "Connect OpenAI" }],
                },
              }
            },
            oauth: {
              authorize: async (input: unknown) => {
                authorizePayload = input
                return {
                  data: {
                    url: "https://auth.example/openai",
                    method: "auto",
                    instructions: "Open the browser to continue.",
                  },
                }
              },
            },
          },
        },
      })

      send({ type: "providerAuthAction", providerID: "openai" })
      await new Promise((resolve) => setTimeout(resolve, 0))

      assert.deepEqual(authPayload, { directory: "/workspace" })
      assert.deepEqual(authorizePayload, {
        providerID: "openai",
        directory: "/workspace",
        method: 0,
      })
      assert.equal(opened, "https://auth.example/openai")
      controller.dispose()
    } finally {
      ;(vscode.env as any).openExternal = originalOpenExternal
    }
  })

  test("routes MCP authenticate messages through auth-specific host behavior", async () => {
    let authenticatePayload: unknown
    const { controller, send } = createWebviewMessageHarness({
      state: "ready",
      dir: "/workspace",
      name: "workspace",
      sdk: {
        mcp: {
          connect: async () => ({ data: undefined }),
          disconnect: async () => ({ data: undefined }),
          auth: {
            authenticate: async (input: unknown) => {
              authenticatePayload = input
              return { data: undefined }
            },
            remove: async () => ({ data: undefined }),
          },
        },
      },
    })

    send({ type: "mcpAction", name: "docs", action: "authenticate" })
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.deepEqual(authenticatePayload, {
      name: "docs",
      directory: "/workspace",
    })
    controller.dispose()
  })
})

describe("SessionPanelController.actionContext", () => {
  test("retarget resets the controller to a different session in place", async () => {
    const current = snapshot()
    const { controller, pushes } = createHarness(current)
    const raw = controller as any

    raw.pending = Promise.resolve()
    raw.pendingComposerParts = [{ type: "text", text: "stale draft" }]
    raw.state.pendingSubmitCount = 2

    await raw.retarget({
      workspaceId: "file:///workspace",
      dir: "/workspace",
      sessionId: "new-session",
    }, "file:///workspace:new-session")

    assert.deepEqual(raw.ref, {
      workspaceId: "file:///workspace",
      dir: "/workspace",
      sessionId: "new-session",
    })
    assert.equal(raw.key, "file:///workspace:new-session")
    assert.equal(raw.current, undefined)
    assert.equal(raw.pending, undefined)
    assert.equal(raw.pendingComposerParts, undefined)
    assert.equal(raw.state.pendingSubmitCount, 0)
    assert.equal(raw.panel.title, panelTitle("new-session"))
    assert.deepEqual(pushes, [{ force: true, reason: "retarget" }])
  })

  test("posts restoreComposer after the webview becomes ready", async () => {
    const current = snapshot()
    const { controller } = createHarness(current)
    const posted: unknown[] = []
    const raw = controller as any

    raw.ready = false
    raw.panel = {
      title: "OpenCode",
      webview: {
        postMessage: async (message: unknown) => {
          posted.push(message)
          return true
        },
      },
    }

    await raw.seedComposer([{ type: "text", text: "@src/app.ts" }])
    raw.ready = true
    await raw.flushSeedComposer()

    assert.deepEqual(posted.at(-1), {
      type: "restoreComposer",
      parts: [{ type: "text", text: "@src/app.ts" }],
    })
  })

  test("syncSubmitting updates current state and posts submitting transport", async () => {
    const current = snapshot()
    const values: boolean[] = []
    const controller = Object.create(SessionPanelController.prototype) as any

    controller.ref = current.sessionRef
    controller.mgr = { get: () => undefined }
    controller.panel = { webview: { postMessage: async () => true } }
    controller.state = {
      disposed: false,
      run: 0,
      pendingSubmitCount: 1,
    }
    controller.current = current
    controller.log = () => {}
    controller.push = async () => {}
    controller.postSubmitting = async (value: boolean) => {
      values.push(value)
    }

    const ctx = controller.actionContext()
    await ctx.syncSubmitting()

    assert.equal(values[0], true)
    assert.equal(controller.current.submitting, true)

    controller.state.pendingSubmitCount = 0
    await ctx.syncSubmitting()

    assert.deepEqual(values, [true, false])
    assert.equal(controller.current.submitting, false)
  })
})
