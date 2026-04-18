import assert from "node:assert/strict"
import { describe, test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import type { SkillCatalogEntry } from "../../../bridge/types"
import type { MessagePart, ToolPart } from "../../../core/sdk"
import { TranscriptVisibilityContext } from "./contexts"
import { PartView, ToolPartView, WebviewBindingsProvider } from "./webview-bindings"

const SKILL_OUTPUT = `<skill_content name="using-superpowers">
# Skill: using-superpowers

# Using Skills

Always check the skill list first.

Base directory for this skill: file:///tmp/skills/using-superpowers
Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.
Note: file list is sampled.

<skill_files>

</skill_files>
</skill_content>`

const ARTICLE_WRITING_SKILL: SkillCatalogEntry[] = [{
  name: "article-writing",
  content: `# Article Writing

Write long-form content that sounds like a real person or brand, not generic AI output.
`,
}]

function renderSkillPart(options?: { compactSkillInvocations?: boolean; active?: boolean }) {
  const part: ToolPart = {
    id: "tool-1",
    sessionID: "session-1",
    messageID: "message-1",
    type: "tool",
    tool: "skill",
    state: {
      status: "completed",
      input: { name: "using-superpowers" },
      output: SKILL_OUTPUT,
    },
  }

  return renderToStaticMarkup(
    <WebviewBindingsProvider
      fileRefStatus={new Map()}
      vscode={{
        postMessage: () => {},
        getState: () => undefined,
        setState: () => {},
      }}
    >
      <TranscriptVisibilityContext.Provider
        value={{
          showThinking: true,
          showInternals: false,
          compactSkillInvocations: options?.compactSkillInvocations !== false,
          panelTheme: "default",
          skillCatalog: [],
        }}
      >
        <ToolPartView part={part} active={options?.active} />
      </TranscriptVisibilityContext.Provider>
    </WebviewBindingsProvider>,
  )
}

function renderSkillTextPart(options?: { compactSkillInvocations?: boolean }) {
  const part: MessagePart = {
    id: "text-1",
    sessionID: "session-1",
    messageID: "message-1",
    type: "text",
    text: `${SKILL_OUTPUT}\n继续执行`,
  }

  return renderToStaticMarkup(
    <WebviewBindingsProvider
      fileRefStatus={new Map()}
      vscode={{
        postMessage: () => {},
        getState: () => undefined,
        setState: () => {},
      }}
    >
      <TranscriptVisibilityContext.Provider
        value={{
          showThinking: true,
          showInternals: false,
          compactSkillInvocations: options?.compactSkillInvocations !== false,
          panelTheme: "default",
          skillCatalog: [],
        }}
      >
        <PartView part={part} />
      </TranscriptVisibilityContext.Provider>
    </WebviewBindingsProvider>,
  )
}

function renderExactSkillTextPart(options?: { compactSkillInvocations?: boolean }) {
  const part: MessagePart = {
    id: "text-2",
    sessionID: "session-1",
    messageID: "message-2",
    type: "text",
    text: ARTICLE_WRITING_SKILL[0]!.content,
  }

  return renderToStaticMarkup(
    <WebviewBindingsProvider
      fileRefStatus={new Map()}
      vscode={{
        postMessage: () => {},
        getState: () => undefined,
        setState: () => {},
      }}
    >
      <TranscriptVisibilityContext.Provider
        value={{
          showThinking: true,
          showInternals: false,
          compactSkillInvocations: options?.compactSkillInvocations !== false,
          panelTheme: "default",
          skillCatalog: ARTICLE_WRITING_SKILL,
        }}
      >
        <PartView part={part} />
      </TranscriptVisibilityContext.Provider>
    </WebviewBindingsProvider>,
  )
}

function renderAssistantTextPart(panelTheme: "default" | "codex" | "claude") {
  const part: MessagePart = {
    id: "text-3",
    sessionID: "session-1",
    messageID: "message-3",
    type: "text",
    text: "# 其他产品动态\n\n- Canva\n- DeepL",
  }

  return renderToStaticMarkup(
    <WebviewBindingsProvider
      fileRefStatus={new Map()}
      vscode={{
        postMessage: () => {},
        getState: () => undefined,
        setState: () => {},
      }}
    >
      <TranscriptVisibilityContext.Provider
        value={{
          showThinking: true,
          showInternals: false,
          compactSkillInvocations: true,
          panelTheme,
          skillCatalog: [],
        }}
      >
        <PartView part={part} />
      </TranscriptVisibilityContext.Provider>
    </WebviewBindingsProvider>,
  )
}

describe("skill tool rendering", () => {
  test("renders a compact skill pill when compact mode is enabled", () => {
    const html = renderSkillPart()

    assert.equal(html.includes("SKILL"), true)
    assert.equal(html.includes("using-superpowers"), true)
    assert.equal(html.includes("Always check the skill list first."), false)
  })

  test("renders the expanded skill output when compact mode is disabled", () => {
    const html = renderSkillPart({ compactSkillInvocations: false, active: true })

    assert.equal(html.includes("Always check the skill list first."), true)
    assert.equal(html.includes("Base directory for this skill:"), true)
  })

  test("renders a compact skill pill for wrapped text parts", () => {
    const html = renderSkillTextPart()

    assert.equal(html.includes("SKILL"), true)
    assert.equal(html.includes("using-superpowers"), true)
    assert.equal(html.includes("继续执行"), true)
    assert.equal(html.includes("Always check the skill list first."), false)
  })

  test("renders a compact skill pill for exact matched skill content", () => {
    const html = renderExactSkillTextPart()

    assert.equal(html.includes("SKILL"), true)
    assert.equal(html.includes("article-writing"), true)
    assert.equal(html.includes("Write long-form content"), false)
  })

  test("keeps assistant markdown source text literal in the default theme", () => {
    const html = renderAssistantTextPart("default")

    assert.equal(html.includes("# 其他产品动态"), true)
    assert.equal(html.includes("<h1>"), false)
    assert.equal(html.includes("<li>Canva</li>"), false)
  })

  test("renders assistant markdown as rich content in codex and claude themes", () => {
    const codexHtml = renderAssistantTextPart("codex")
    const claudeHtml = renderAssistantTextPart("claude")

    assert.equal(codexHtml.includes("<h1>其他产品动态</h1>"), true)
    assert.equal(codexHtml.includes("<li>Canva</li>"), true)
    assert.equal(codexHtml.includes("# 其他产品动态"), false)
    assert.equal(claudeHtml.includes("<h1>其他产品动态</h1>"), true)
    assert.equal(claudeHtml.includes("<li>DeepL</li>"), true)
    assert.equal(claudeHtml.includes("# 其他产品动态"), false)
  })
})
