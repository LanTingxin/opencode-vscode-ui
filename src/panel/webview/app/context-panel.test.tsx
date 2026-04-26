import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { describe, test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import type { ProviderInfo, SessionInfo, SessionMessage } from "../../../core/sdk"

function session(): SessionInfo {
  return {
    id: "session-1",
    directory: "/workspace",
    title: "Shell collapse polish",
    time: {
      created: new Date("2026-04-21T10:46:00Z").getTime(),
      updated: new Date("2026-04-21T10:50:00Z").getTime(),
    },
  }
}

function providers(): ProviderInfo[] {
  return [{
    id: "anthropic",
    name: "Anthropic",
    models: {
      "claude-opus-4-1": {
        id: "claude-opus-4-1",
        name: "Claude Opus 4.1",
        limit: {
          context: 1000,
        },
      },
    },
  }]
}

function messages(): SessionMessage[] {
  return [
    {
      info: {
        id: "msg-user-1",
        sessionID: "session-1",
        role: "user",
        time: {
          created: new Date("2026-04-21T10:46:00Z").getTime(),
        },
      },
      parts: [{
        id: "part-user-text-1",
        sessionID: "session-1",
        messageID: "msg-user-1",
        type: "text",
        text: "Please polish the shell collapse behavior.",
      }],
    },
    {
      info: {
        id: "msg-assistant-1",
        sessionID: "session-1",
        role: "assistant",
        agent: "Claude",
        cost: 3.67,
        time: {
          created: new Date("2026-04-21T10:47:00Z").getTime(),
          completed: new Date("2026-04-21T10:50:00Z").getTime(),
        },
        tokens: {
          input: 400,
          output: 200,
          reasoning: 50,
          cache: {
            read: 50,
            write: 0,
          },
        },
        model: {
          providerID: "anthropic",
          modelID: "claude-opus-4-1",
        },
      },
      parts: [
        {
          id: "part-assistant-reasoning-1",
          sessionID: "session-1",
          messageID: "msg-assistant-1",
          type: "reasoning",
          text: "Check the current panel shell layout and tighten the collapsed summary.",
        },
        {
          id: "part-assistant-tool-1",
          sessionID: "session-1",
          messageID: "msg-assistant-1",
          type: "tool",
          tool: "bash",
          state: {
            status: "completed",
            input: {
              command: "bun test src/panel/webview/app/composer-footer.test.tsx",
            },
            output: "1 passed",
          },
        },
        {
          id: "part-assistant-text-1",
          sessionID: "session-1",
          messageID: "msg-assistant-1",
          type: "text",
          text: "I updated the shell block rendering.",
        },
      ],
    },
  ]
}

describe("ContextPanel", () => {
  test("renders official-style session context stats, breakdown, and raw messages", async () => {
    const moduleUrl = pathToFileURL(resolve(process.cwd(), "src/panel/webview/app/context-panel.tsx")).href
    const mod = await import(moduleUrl).catch(() => null)

    assert.notEqual(mod, null)
    if (!mod) {
      return
    }

    const ContextPanel = (mod as {
      ContextPanel: (props: {
        session?: SessionInfo
        messages: SessionMessage[]
        providers: ProviderInfo[]
      }) => React.JSX.Element
    }).ContextPanel

    assert.equal(typeof ContextPanel, "function")

    const html = renderToStaticMarkup(
      <ContextPanel
        session={session()}
        messages={messages()}
        providers={providers()}
      />,
    )

    assert.equal(html.includes("Shell collapse polish"), true)
    assert.equal(html.includes("Anthropic"), true)
    assert.equal(html.includes("Claude Opus 4.1"), true)
    assert.equal(html.includes("1,000"), true)
    assert.equal(html.includes("700"), true)
    assert.equal(html.includes("70%"), true)
    assert.equal(html.includes("User"), true)
    assert.equal(html.includes("Assistant"), true)
    assert.equal(html.includes("Tool"), true)
    assert.equal(html.includes("msg-user-1"), true)
    assert.equal(html.includes("msg-assistant-1"), true)
  })

  test("renders upstream-style provider metadata and highlighted wrapping raw JSON", async () => {
    const moduleUrl = pathToFileURL(resolve(process.cwd(), "src/panel/webview/app/context-panel.tsx")).href
    const mod = await import(moduleUrl).catch(() => null)

    assert.notEqual(mod, null)
    if (!mod) {
      return
    }

    const ContextPanel = (mod as {
      ContextPanel: (props: {
        session?: SessionInfo
        messages: SessionMessage[]
        providers: ProviderInfo[]
      }) => React.JSX.Element
    }).ContextPanel

    const upstreamMessages = messages()
    const assistant = upstreamMessages[1]
    assert.equal(assistant?.info.role, "assistant")
    if (assistant?.info.role !== "assistant") {
      return
    }

    upstreamMessages[1] = {
      ...assistant,
      info: {
        ...assistant.info,
        model: undefined,
        providerID: "anthropic",
        modelID: "claude-opus-4-1",
      } as SessionMessage["info"],
      parts: assistant.parts.map((part) => part.type === "text"
        ? {
            ...part,
            text: "A very long raw message value that should wrap inside the context drawer instead of forcing horizontal scrolling across the entire panel.",
          }
        : part),
    }

    const html = renderToStaticMarkup(
      <ContextPanel
        session={session()}
        messages={upstreamMessages}
        providers={providers()}
      />,
    )
    const css = readFileSync(resolve(process.cwd(), "src/panel/webview/context.css"), "utf8")

    assert.equal(html.includes("Anthropic"), true)
    assert.equal(html.includes("Claude Opus 4.1"), true)
    assert.equal(html.includes("1,000"), true)
    assert.equal(html.includes("70%"), true)
    assert.equal(html.includes("oc-contextJsonLine"), true)
    assert.equal(html.includes("oc-contextJsonKey"), true)
    assert.equal(html.includes("oc-contextJsonString"), true)
    assert.equal(html.includes("oc-contextJsonNumber"), true)
    assert.match(css, /\.oc-contextMessageBody\s*\{[\s\S]*white-space:\s*pre-wrap;/)
    assert.match(css, /\.oc-contextJsonLine\s*\{[\s\S]*overflow-wrap:\s*anywhere;/)
  })
})
