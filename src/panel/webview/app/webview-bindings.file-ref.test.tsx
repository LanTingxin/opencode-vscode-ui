import assert from "node:assert/strict"
import { describe, test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import type { ToolPart } from "../../../core/sdk"
import { TranscriptVisibilityContext, WorkspaceDirContext } from "./contexts"
import { ToolPartView, WebviewBindingsProvider } from "./webview-bindings"

function renderTool(tool: "write" | "edit", filePath: string) {
  const part: ToolPart = {
    id: `${tool}-1`,
    sessionID: "session-1",
    messageID: "message-1",
    type: "tool",
    tool,
    state: {
      status: "completed",
      input: {
        filePath,
      },
      metadata: {},
    },
  }

  return renderToStaticMarkup(
    <WebviewBindingsProvider
      fileRefStatus={new Map([[filePath, true]])}
      vscode={{
        postMessage: () => {},
        getState: () => undefined,
        setState: () => {},
      }}
    >
      <WorkspaceDirContext.Provider value="/workspace">
        <TranscriptVisibilityContext.Provider
          value={{
            showThinking: true,
            showInternals: false,
            compactSkillInvocations: true,
            panelTheme: "default",
            skillCatalog: [],
          }}
        >
          <ToolPartView part={part} />
        </TranscriptVisibilityContext.Provider>
      </WorkspaceDirContext.Provider>
    </WebviewBindingsProvider>,
  )
}

describe("tool file references", () => {
  test("renders clickable write tool titles", () => {
    const html = renderTool("write", "src/panel/webview/app/App.tsx")

    assert.equal(html.includes("oc-fileRefText"), true)
    assert.equal(html.includes("is-openable"), true)
    assert.equal(html.includes("src/panel/webview/app/App.tsx"), true)
  })

  test("renders clickable edit tool titles when no diff is available", () => {
    const html = renderTool("edit", "src/panel/provider/files.ts")

    assert.equal(html.includes("oc-fileRefText"), true)
    assert.equal(html.includes("is-openable"), true)
    assert.equal(html.includes("src/panel/provider/files.ts"), true)
  })
})
