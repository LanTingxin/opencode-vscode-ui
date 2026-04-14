import assert from "node:assert/strict"
import { describe, test } from "node:test"
import * as vscode from "vscode"

import type { SessionMessage } from "../../core/sdk"
import { providerAuthAction, restoredPromptPartsFromMessage, runComposerAction, runMcpAction, runShellCommand, runSlashCommand, submit } from "./actions"

async function withImmediateTimeout<T>(run: () => Promise<T>) {
  const original = globalThis.setTimeout
  globalThis.setTimeout = (((handler: TimerHandler) => {
    if (typeof handler === "function") {
      handler()
    }
    return 0 as never
  }) as unknown) as typeof setTimeout

  try {
    return await run()
  } finally {
    globalThis.setTimeout = original
  }
}

function createContext(overrides?: {
  promptAsync?: (input: unknown) => Promise<unknown>
  command?: (input: unknown) => Promise<unknown>
  shell?: (input: unknown) => Promise<unknown>
  get?: (input: unknown) => Promise<{ data?: unknown }>
  messages?: (input: unknown) => Promise<{ data?: unknown[] }>
  status?: (input: unknown) => Promise<{ data?: Record<string, { type: string }> }>
  revert?: (input: unknown) => Promise<unknown>
  abort?: (input: unknown) => Promise<unknown>
  providerAuth?: (input: unknown) => Promise<{ data?: Record<string, Array<{ type: "oauth" | "api"; label: string }>> }>
  providerAuthorize?: (input: unknown) => Promise<{ data?: { url: string; method: "auto" | "code"; instructions: string } }>
  mcpConnect?: (input: unknown) => Promise<unknown>
  mcpDisconnect?: (input: unknown) => Promise<unknown>
  mcpAuthenticate?: (input: unknown) => Promise<unknown>
  mcpRemoveAuth?: (input: unknown) => Promise<unknown>
}): {
  ctx: Parameters<typeof submit>[0]
  posted: unknown[]
  syncStates: boolean[]
} {
  const posted: unknown[] = []
  const syncStates: boolean[] = []
  const rt = {
    state: "ready",
    dir: "/workspace",
    name: "workspace",
    sdk: {
      session: {
        promptAsync: overrides?.promptAsync ?? (async () => ({ data: undefined })),
        command: overrides?.command ?? (async () => ({ data: undefined })),
        shell: overrides?.shell ?? (async () => ({ data: undefined })),
        get: overrides?.get ?? (async () => ({ data: undefined })),
        messages: overrides?.messages ?? (async () => ({ data: [] })),
        status: overrides?.status ?? (async () => ({ data: { "session-1": { type: "idle" } } })),
        revert: overrides?.revert ?? (async () => ({ data: undefined })),
        abort: overrides?.abort ?? (async () => ({ data: undefined })),
      },
      provider: {
        auth: overrides?.providerAuth ?? (async () => ({ data: {} })),
        oauth: {
          authorize: overrides?.providerAuthorize ?? (async () => ({ data: undefined })),
        },
      },
      mcp: {
        connect: overrides?.mcpConnect ?? (async () => ({ data: undefined })),
        disconnect: overrides?.mcpDisconnect ?? (async () => ({ data: undefined })),
        auth: {
          authenticate: overrides?.mcpAuthenticate ?? (async () => ({ data: undefined })),
          remove: overrides?.mcpRemoveAuth ?? (async () => ({ data: undefined })),
        },
      },
    },
  }

  const ctx = {
    ref: {
      workspaceId: "file:///workspace",
      dir: "/workspace",
      sessionId: "session-1",
    },
    mgr: {
      get: () => rt,
    },
    panel: {
      webview: {
        postMessage: async (message: unknown) => {
          posted.push(message)
          return true
        },
      },
    },
    state: {
      disposed: false,
      run: 0,
      pendingSubmitCount: 0,
    },
    log: () => {},
    push: async () => {},
    syncSubmitting: async function () {
      syncStates.push(ctx.state.pendingSubmitCount > 0)
    },
  } as unknown as Parameters<typeof submit>[0]

  return {
    ctx,
    posted,
    syncStates,
  }
}

describe("provider actions submitting", () => {
  test("submit toggles submitting around promptAsync", async () => {
    let promptPayload: unknown
    const { ctx, posted, syncStates } = createContext({
      promptAsync: async (input) => {
        promptPayload = input
        return { data: undefined }
      },
    })

    await withImmediateTimeout(async () => {
      await submit(ctx, "hello", undefined, "coder", { providerID: "openai", modelID: "gpt-5" }, "fast")
    })

    assert.deepEqual(syncStates, [true, false])
    assert.equal(ctx.state.pendingSubmitCount, 0)
    assert.deepEqual(promptPayload, {
      sessionID: "session-1",
      directory: "/workspace",
      agent: "coder",
      model: { providerID: "openai", modelID: "gpt-5" },
      variant: "fast",
      parts: [{ type: "text", text: "hello" }],
    })
    assert.deepEqual(posted, [])
  })

  test("runSlashCommand toggles submitting around command execution", async () => {
    let commandPayload: unknown
    const { ctx, syncStates } = createContext({
      command: async (input) => {
        commandPayload = input
        return { data: undefined }
      },
    })

    await withImmediateTimeout(async () => {
      await runSlashCommand(ctx, "review", "src/panel", "planner", "gpt-5", "safe")
    })

    assert.deepEqual(syncStates, [true, false])
    assert.equal(ctx.state.pendingSubmitCount, 0)
    assert.deepEqual(commandPayload, {
      sessionID: "session-1",
      directory: "/workspace",
      command: "review",
      arguments: "src/panel",
      agent: "planner",
      model: "gpt-5",
      variant: "safe",
    })
  })

  test("runSlashCommand forwards attachment parts to command execution", async () => {
    let commandPayload: unknown
    const { ctx } = createContext({
      command: async (input) => {
        commandPayload = input
        return { data: undefined }
      },
    })

    await withImmediateTimeout(async () => {
      await runSlashCommand(ctx, "using-superpowers", "", "builder", "openai/gpt-5", "default", [{
        type: "file",
        mime: "image/png",
        url: "data:image/png;base64,AAAA",
        filename: "image.png",
      }])
    })

    assert.deepEqual(commandPayload, {
      sessionID: "session-1",
      directory: "/workspace",
      command: "using-superpowers",
      arguments: "",
      agent: "builder",
      model: "openai/gpt-5",
      variant: "default",
      parts: [{
        type: "file",
        mime: "image/png",
        url: "data:image/png;base64,AAAA",
        filename: "image.png",
      }],
    })
  })

  test("runShellCommand toggles submitting and posts success message", async () => {
    let shellPayload: unknown
    const { ctx, posted, syncStates } = createContext({
      shell: async (input) => {
        shellPayload = input
        return { data: undefined }
      },
    })

    await withImmediateTimeout(async () => {
      await runShellCommand(ctx, "bun test", "builder", { providerID: "openai", modelID: "gpt-5" }, "fast")
    })

    assert.deepEqual(syncStates, [true, false])
    assert.equal(ctx.state.pendingSubmitCount, 0)
    assert.deepEqual(shellPayload, {
      sessionID: "session-1",
      directory: "/workspace",
      command: "bun test",
      agent: "builder",
      model: { providerID: "openai", modelID: "gpt-5" },
    })
    assert.deepEqual(posted, [{ type: "shellCommandSucceeded" }])
  })

  test("submit clears submitting and posts error on failure", async () => {
    const { ctx, posted, syncStates } = createContext({
      promptAsync: async () => {
        throw new Error("boom")
      },
    })

    await withImmediateTimeout(async () => {
      await submit(ctx, "hello")
    })

    assert.deepEqual(syncStates, [true, false])
    assert.equal(ctx.state.pendingSubmitCount, 0)
    assert.deepEqual(posted, [{ type: "error", message: "boom" }])
  })

  test("runComposerAction targeted undo restores the selected user message and reverts to its id", async () => {
    let revertedPayload: unknown
    const userMessage = {
      info: {
        id: "msg-user-2",
        sessionID: "session-1",
        role: "user",
        time: { created: 2 },
      },
      parts: [{
        id: "part-text-1",
        sessionID: "session-1",
        messageID: "msg-user-2",
        type: "text",
        text: "Please try again",
      }],
    } satisfies SessionMessage

    const { ctx, posted, syncStates } = createContext({
      get: async () => ({ data: { id: "session-1" } }),
      messages: async () => ({
        data: [{
          info: {
            id: "msg-user-1",
            sessionID: "session-1",
            role: "user",
            time: { created: 1 },
          },
          parts: [],
        }, userMessage],
      }),
      revert: async (input) => {
        revertedPayload = input
        return { data: undefined }
      },
    })

    await withImmediateTimeout(async () => {
      await runComposerAction(ctx, "undoSession", undefined, "msg-user-2")
    })

    assert.deepEqual(syncStates, [true, false])
    assert.deepEqual(posted, [{
      type: "restoreComposer",
      parts: [{ type: "text", text: "Please try again" }],
    }])
    assert.deepEqual(revertedPayload, {
      sessionID: "session-1",
      directory: "/workspace",
      messageID: "msg-user-2",
    })
  })

  test("providerAuthAction requests provider auth metadata and opens the OAuth URL for auth-capable providers", async () => {
    let authPayload: unknown
    let authorizePayload: unknown
    let opened: string | undefined
    let info: string | undefined
    const originalOpenExternal = vscode.env.openExternal
    const originalShowInformationMessage = vscode.window.showInformationMessage
    ;(vscode.env as any).openExternal = async (uri: { toString(): string }) => {
      opened = uri.toString()
      return true
    }
    ;(vscode.window as any).showInformationMessage = async (message: string) => {
      info = message
      return undefined
    }

    try {
      const { ctx } = createContext({
        providerAuth: async (input) => {
          authPayload = input
          return {
            data: {
              openai: [{ type: "oauth", label: "Connect OpenAI" }],
            },
          }
        },
        providerAuthorize: async (input) => {
          authorizePayload = input
          return {
            data: {
              url: "https://auth.example/openai",
              method: "code",
              instructions: "Paste the returned code to finish connecting.",
            },
          }
        },
      })

      await providerAuthAction(ctx, "openai")

      assert.deepEqual(authPayload, { directory: "/workspace" })
      assert.deepEqual(authorizePayload, {
        providerID: "openai",
        directory: "/workspace",
        method: 0,
      })
      assert.equal(opened, "https://auth.example/openai")
      assert.match(info ?? "", /Paste the returned code/i)
    } finally {
      ;(vscode.env as any).openExternal = originalOpenExternal
      ;(vscode.window as any).showInformationMessage = originalShowInformationMessage
    }
  })

  test("runMcpAction uses auth-specific MCP actions for authenticate requests", async () => {
    let authenticatePayload: unknown
    const { ctx, posted } = createContext({
      mcpAuthenticate: async (input) => {
        authenticatePayload = input
        return { data: undefined }
      },
    })

    await runMcpAction(ctx, "docs", "authenticate")

    assert.deepEqual(authenticatePayload, {
      name: "docs",
      directory: "/workspace",
    })
    assert.deepEqual(posted, [{ type: "mcpActionFinished", name: "docs" }])
  })
})

describe("restoredPromptPartsFromMessage", () => {
  test("extracts visible text and file mentions from a user message", () => {
    const message: SessionMessage = {
      info: {
        id: "msg-user-3",
        sessionID: "session-1",
        role: "user",
        time: { created: 3 },
      },
      parts: [{
        id: "part-text-1",
        sessionID: "session-1",
        messageID: "msg-user-3",
        type: "text",
        text: "Review this file",
      }, {
        id: "part-file-1",
        sessionID: "session-1",
        messageID: "msg-user-3",
        type: "file",
        mime: "text/plain",
        url: "file:///workspace/src/app.ts",
        source: {
          type: "file",
          path: "/workspace/src/app.ts",
          text: {
            value: "@src/app.ts#10-20",
            start: 0,
            end: 14,
          },
        },
      }],
    }

    const parts = restoredPromptPartsFromMessage(message)

    assert.deepEqual(parts, [
      { type: "text", text: "Review this file" },
      {
        type: "file",
        path: "src/app.ts",
        kind: "file",
        selection: {
          startLine: 10,
          endLine: 20,
        },
        source: {
          value: "@src/app.ts#10-20",
          start: 0,
          end: 14,
        },
      },
    ])
  })
})
