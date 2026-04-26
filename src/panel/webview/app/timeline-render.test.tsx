import assert from "node:assert/strict"
import { describe, test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import type { SkillCatalogEntry } from "../../../bridge/types"
import type { CommandInfo, FilePart, MessageInfo, MessagePart, SessionMessage, TextPart } from "../../../core/sdk"
import { fingerprintCommandPromptText } from "./command-prompt"
import { Timeline } from "./timeline"

function messageInfo(id: string, role: "user" | "assistant", extras?: Partial<MessageInfo>): MessageInfo {
  return {
    id,
    sessionID: "session-1",
    role,
    time: {
      created: 0,
      completed: role === "assistant" ? 1 : undefined,
    },
    ...extras,
  }
}

function textPart(id: string, messageID: string, text: string): TextPart {
  return {
    id,
    sessionID: "session-1",
    messageID,
    type: "text",
    text,
  }
}

function sessionMessage(info: MessageInfo, parts: MessagePart[]): SessionMessage {
  return { info, parts }
}

function toolPart(id: string, messageID: string, tool = "webfetch"): Extract<MessagePart, { type: "tool" }> {
  return {
    id,
    sessionID: "session-1",
    messageID,
    type: "tool",
    tool,
    callID: `${id}-call`,
    state: {
      status: "completed",
    },
  }
}

function toolPartWithState(
  id: string,
  messageID: string,
  tool: string,
  state: Partial<Extract<MessagePart, { type: "tool" }>["state"]>,
): Extract<MessagePart, { type: "tool" }> {
  return {
    id,
    sessionID: "session-1",
    messageID,
    type: "tool",
    tool,
    callID: `${id}-call`,
    state: {
      status: "completed",
      ...state,
    },
  }
}

const WRAPPED_SKILL_OUTPUT = `<skill_content name="using-superpowers">
# Skill: using-superpowers

# Using Skills

Always check the skill list first.

</skill_content>`

const ARTICLE_WRITING_SKILL: SkillCatalogEntry[] = [{
  name: "article-writing",
  content: `# Article Writing

Write long-form content that sounds like a real person or brand, not generic AI output.

## When to Activate

- drafting blog posts, essays, launch posts, guides, tutorials, or newsletter issues
`,
  location: "/Users/lantingxin/.codex/skills/article-writing/SKILL.md",
}]

const INIT_PROMPT = `Create or update AGENTS.md for this repository.

The goal is a compact instruction file that helps future OpenCode sessions avoid mistakes and ramp up quickly. Every line should answer: "Would an agent likely miss this without help?" If not, leave it out.

# How to investigate

Read the highest-value sources first:

- README, root manifests, workspace config, lockfiles
- build, test, lint, formatter, typecheck, and codegen config
- existing instruction files

# What to extract

Look for the highest-signal facts for an agent working in this repo:

- exact developer commands, especially non-obvious ones
- required command order when it matters
- testing quirks and important constraints
`

const INIT_COMMAND: CommandInfo = {
  name: "init",
  description: "create/update AGENTS.md",
  template: INIT_PROMPT,
  hints: [],
  source: "command",
}

function filePart(id: string, messageID: string, extras?: Partial<FilePart>): FilePart {
  return {
    id,
    sessionID: "session-1",
    messageID,
    type: "file",
    mime: "text/plain",
    filename: "notes.txt",
    url: "file:///workspace/notes.txt",
    ...extras,
  }
}

describe("Timeline user message rendering", () => {
  test("renders new session tips in the empty state", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text, tips }: { title: string; text: string; tips?: Array<{ command: string; text: string }> }) => (
          <div>
            <h2>{title}</h2>
            <p>{text}</p>
            {tips?.map((tip) => <div key={tip.command}>{tip.command}:{tip.text}</div>)}
          </div>
        )}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes("/theme"), true)
    assert.equal(html.includes("change the theme"), true)
  })

  test("does not render a dedicated You header for user messages", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "hello")])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes("You"), false)
    assert.equal(html.includes("oc-entryHeader"), false)
  })

  test("renders a message action bar for user messages", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "hello")])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes("oc-messageActions"), true)
    assert.equal(html.includes('aria-label="Copy"'), true)
    assert.equal(html.includes('aria-label="Fork"'), true)
    assert.equal(html.includes('aria-label="Undo"'), true)
    assert.equal(html.includes('data-tooltip="Copy"'), true)
    assert.equal(html.includes('data-tooltip="Fork"'), true)
    assert.equal(html.includes('data-tooltip="Undo"'), true)
    assert.equal(html.includes(">Copy<"), false)
  })

  test("renders a redo action for revert notices", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[
          sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "hello")]),
          sessionMessage(messageInfo("m2", "assistant"), [textPart("p2", "m2", "done")]),
        ]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onUndoUserMessage={() => {}}
        onRedoSession={() => {}}
        revertID="m1"
        showInternals={false}
        showThinking={true}
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes('aria-label="Redo"'), true)
    assert.equal(html.includes('data-tooltip="Redo"'), true)
  })

  test("renders assistant message errors as a dedicated transcript block before metadata", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[
          sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "hello")]),
          sessionMessage({
            ...messageInfo("m2", "assistant", { agent: "build" }),
            error: {
              name: "UnknownError",
              data: {
                message: "unknown certificate verification error",
              },
            },
          } as MessageInfo, []),
        ]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes("unknown certificate verification error"), true)
    assert.equal(html.includes("oc-assistantError"), true)
    assert.ok(html.indexOf("unknown certificate verification error") < html.indexOf("build"))
  })

  test("renders a single automatic history hint instead of manual controls", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        historyStatus="ready"
        messages={[sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "hello")])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes("Scroll up to load earlier messages"), true)
    assert.equal(html.includes("Load earlier messages"), false)
    assert.equal(html.includes("Render earlier messages"), false)
    assert.equal(html.includes("oc-transcriptHistoryBadge"), true)
  })

  test("renders a loading state for automatic history loading", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        historyStatus="loading"
        messages={[sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "hello")])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes("Loading earlier messages..."), true)
    assert.equal(html.includes("is-loading"), true)
  })

  test("renders a hover copy action for assistant text replies", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "assistant"), [textPart("p1", "m1", "# 标题\n\n- 条目")])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>rendered:{content}</div>}
        PartView={({ part }) => <div>{part.type === "text" ? `rendered:${part.text}` : part.type}</div>}
      />,
    )

    assert.equal(html.includes("oc-assistantReplyWrap"), true)
    assert.equal(html.includes('aria-label="Copy"'), true)
    assert.equal(html.includes('data-tooltip="Copy"'), true)
    assert.equal(html.includes("rendered:# 标题"), true)
  })

  test("renders assistant copy only for the final text output in a turn", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[
          sessionMessage(messageInfo("m1", "assistant"), [textPart("p1", "m1", "First output")]),
          sessionMessage(messageInfo("m2", "assistant"), [toolPart("p2", "m2"), textPart("p3", "m2", "Final output")]),
        ]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type === "text" ? `text:${part.text}` : part.type}</div>}
      />,
    )

    assert.equal(html.match(/aria-label="Copy"/g)?.length, 1)
    assert.ok(html.indexOf("text:Final output") < html.indexOf('aria-label="Copy"'))
  })

  test("renders codex assistant meta in the final text hover footer with copy", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[
          sessionMessage(messageInfo("m1", "assistant", {
            agent: "ultraworker",
            model: { providerID: "anthropic", modelID: "claude-opus-4.6" },
            time: { created: 0, completed: 42000 },
          }), [textPart("p1", "m1", "Final output")]),
        ]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        panelTheme="codex"
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type === "text" ? `text:${part.text}` : part.type}</div>}
      />,
    )

    assert.equal(html.includes("oc-assistantReplyFooter"), true)
    assert.equal(html.includes("oc-assistantReplyMeta"), true)
    assert.equal(html.includes("ultraworker"), true)
    assert.equal(html.includes("anthropic/claude-opus-4.6"), true)
    assert.equal(html.includes("42s"), true)
    assert.equal(html.includes('<section class="oc-turnMeta"'), false)
    assert.ok(html.indexOf("oc-assistantReplyMeta") < html.indexOf('aria-label="Copy"'))
    assert.equal(html.includes("oc-messageActionCopiedTip"), true)
    assert.equal(html.includes("Copied!"), true)
  })

  test("wraps claude assistant outputs in unified chain items while leaving user messages unchained", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[
          sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "hello")]),
          sessionMessage(messageInfo("m2", "assistant", { agent: "build" }), [toolPart("p2", "m2"), textPart("p3", "m2", "done")]),
        ]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        panelTheme="claude"
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes("oc-turnUser"), true)
    assert.equal(html.includes("oc-chainItem"), true)
    assert.equal(html.includes("oc-chainItem-first"), true)
    assert.equal(html.includes("oc-chainItem-last"), true)
    assert.equal(html.includes("oc-chainItem oc-chainItem-assistant-part"), true)
    assert.equal(html.includes("oc-chainItem oc-chainItem-assistant-meta oc-chainItem-last"), false)
    assert.match(html, /oc-chainItem oc-chainItem-assistant-part oc-chainItem-part-text oc-chainItem-last/)
    assert.equal(html.includes("oc-chainItem-tool-webfetch"), true)
    assert.equal(html.includes('<div class="oc-turnUserWrap oc-turnUserWrap-theme-claude">'), true)
    assert.equal(html.includes('<section class="oc-turnUser oc-turnUser-theme-claude">'), true)
    assert.equal(html.includes('<div class="oc-chainItem oc-chainItem-user-message'), false)
  })

  test("renders claude user actions in a top-right hover layout", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "你好")])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        panelTheme="claude"
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes('class="oc-turnUserWrap oc-turnUserWrap-theme-claude"'), true)
    assert.equal(html.includes('class="oc-messageActions oc-messageActions-topRightExternal"'), true)
  })

  test("renders codex user messages as end-aligned compact bubbles with below actions", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "还是没变化，比首字高，需要和首字中心平行")])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        panelTheme="codex"
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes('class="oc-turnUserWrap oc-turnUserWrap-theme-codex oc-turnUserWrap-compactEnd"'), true)
    assert.equal(html.includes('class="oc-turnUser oc-turnUser-theme-codex oc-turnUser-compactEnd"'), true)
    assert.equal(html.includes('class="oc-messageActions oc-messageActions-belowHover"'), true)
  })

  test("renders codex assistant activity expanded until text follows", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "assistant", { agent: "build" }), [
          textPart("p1", "m1", "I checked the current UI."),
          toolPartWithState("t1", "m1", "read", { input: { filePath: "src/panel/webview/app/timeline.tsx" } }),
          toolPartWithState("t2", "m1", "grep", { input: { pattern: "oc-toolRowWrap" } }),
          toolPartWithState("t3", "m1", "bash", { input: { command: "echo hi" }, metadata: { output: "hi" } }),
        ])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        panelTheme="codex"
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type === "tool" ? JSON.stringify(part.state?.input || {}) : part.type === "text" ? `text:${part.text}` : part.type}</div>}
      />,
    )

    assert.equal(html.includes("text:I checked the current UI."), true)
    assert.equal(html.includes("oc-codexActivityGroup"), true)
    assert.equal(html.includes("Explored 1 file, 1 search, Ran 1 command"), true)
    assert.equal(html.includes('aria-expanded="true"'), true)
    assert.equal(html.includes("echo hi"), true)
  })

  test("renders codex assistant activity with webfetch counted as explored", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "assistant", { agent: "build" }), [
          toolPartWithState("t1", "m1", "webfetch", { input: { url: "https://example.com" } }),
          toolPartWithState("t2", "m1", "webfetch", { input: { url: "https://news.ycombinator.com" } }),
          toolPartWithState("t3", "m1", "read", { input: { filePath: "src/index.ts" } }),
        ])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        panelTheme="codex"
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type === "tool" ? JSON.stringify(part.state?.input || {}) : part.type === "text" ? `text:${part.text}` : part.type}</div>}
      />,
    )

    assert.equal(html.includes("oc-codexActivityGroup"), true)
    assert.equal(html.includes("Explored 3 files"), true)
    assert.equal(html.includes('aria-expanded="true"'), true)
  })

  test("renders codex assistant activity expanded before the next text reply", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "assistant", { agent: "build" }), [
          toolPartWithState("t1", "m1", "bash", { status: "completed", input: { command: "bun test" } }),
        ])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        panelTheme="codex"
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type === "tool" ? JSON.stringify(part.state?.input || {}) : part.type === "text" ? `text:${part.text}` : part.type}</div>}
      />,
    )

    assert.equal(html.includes("Ran 1 command"), true)
    assert.equal(html.includes('aria-expanded="true"'), true)
    assert.equal(html.includes("bun test"), true)
  })

  test("renders codex assistant copy actions inside the reply block instead of below it", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "assistant"), [textPart("p1", "m1", "Reply body")])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        panelTheme="codex"
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type === "text" ? `text:${part.text}` : part.type}</div>}
      />,
    )

    assert.equal(html.includes('class="oc-assistantReplyWrap oc-assistantReplyWrap-theme-codex"'), true)
    assert.equal(html.includes('class="oc-assistantReplyFooter oc-assistantReplyFooter-theme-codex"'), true)
    assert.equal(html.includes('class="oc-messageActions oc-messageActions-belowHover"'), false)
  })

  test("ignores codex placeholder text so activity summaries stay compact across assistant messages", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[
          sessionMessage(messageInfo("m1", "assistant", { agent: "build" }), [
            toolPartWithState("t1", "m1", "edit", { input: { filePath: "src/a.ts" } }),
          ]),
          sessionMessage(messageInfo("m2", "assistant", { agent: "build" }), [
            textPart("p2", "m2", "..."),
          ]),
          sessionMessage(messageInfo("m3", "assistant", { agent: "build" }), [
            toolPartWithState("t3", "m3", "edit", { input: { filePath: "src/b.ts" } }),
          ]),
        ]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        panelTheme="codex"
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type === "tool" ? JSON.stringify(part.state?.input || {}) : part.type === "text" ? `text:${part.text}` : part.type}</div>}
      />,
    )

    assert.equal(html.includes("Edited 2 files"), true)
    assert.equal(html.includes(">...<"), false)
  })

  test("hides assistant placeholder text in the classic theme too", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "assistant", { agent: "build" }), [
          textPart("p1", "m1", "。。。"),
        ])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        panelTheme="classic"
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type === "text" ? `text:${part.text}` : part.type}</div>}
      />,
    )

    assert.equal(html.includes(">。。。<"), false)
  })

  test("keeps classic-theme assistant tools on the existing inline path", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "assistant", { agent: "build" }), [
          textPart("p1", "m1", "I checked the current UI."),
          toolPartWithState("t1", "m1", "read", { input: { filePath: "src/panel/webview/app/timeline.tsx" } }),
          toolPartWithState("t2", "m1", "bash", { input: { command: "echo hi" }, metadata: { output: "hi" } }),
        ])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        panelTheme="classic"
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type === "tool" ? JSON.stringify(part.state?.input || {}) : part.type === "text" ? `text:${part.text}` : part.type}</div>}
      />,
    )

    assert.equal(html.includes("oc-codexActivityGroup"), false)
    assert.equal(html.includes("echo hi"), true)
  })

  test("renders a compact skill marker for wrapped user text", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", `${WRAPPED_SKILL_OUTPUT}\n继续执行`)])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes("SKILL"), true)
    assert.equal(html.includes("using-superpowers"), true)
    assert.equal(html.includes("继续执行"), true)
    assert.equal(html.includes("Always check the skill list first."), false)
  })

  test("keeps user prompt markdown as literal text instead of rendering it", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "# 用户标题\n\n- 条目")])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>rendered:{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes("rendered:# 用户标题"), false)
    assert.equal(html.includes("# 用户标题"), true)
    assert.equal(html.includes("<li>条目</li>"), false)
  })

  test("renders a compact skill marker for exact matched skill content", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", ARTICLE_WRITING_SKILL[0]!.content)])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        skillCatalog={ARTICLE_WRITING_SKILL}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes("SKILL"), true)
    assert.equal(html.includes("article-writing"), true)
    assert.equal(html.includes("Write long-form content"), false)
  })

  test("renders clickable skill and file attachments ahead of the prompt text", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [
          textPart("p1", "m1", `${ARTICLE_WRITING_SKILL[0]!.content}\n继续执行`),
          filePart("f1", "m1"),
        ])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        skillCatalog={ARTICLE_WRITING_SKILL}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes('aria-label="Open skill article-writing"'), true)
    assert.equal(html.includes('aria-label="Open attachment notes.txt"'), true)
    assert.ok(html.indexOf("article-writing") < html.indexOf("继续执行"))
    assert.ok(html.indexOf("notes.txt") < html.indexOf("继续执行"))
  })

  test("renders image attachments with a preview action", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [
          textPart("p1", "m1", "这个图片看看"),
          filePart("f1", "m1", {
            mime: "image/png",
            filename: "image.png",
            url: "data:image/png;base64,abc123",
          }),
        ])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes('aria-label="Preview image.png"'), true)
  })

  test("renders previewable image attachments as thumbnails above themed user bubbles", () => {
    for (const panelTheme of ["codex", "claude"] as const) {
      const html = renderToStaticMarkup(
        <Timeline
          bootstrapStatus="ready"
          compactSkillInvocations={true}
          diffMode="unified"
          messages={[sessionMessage(messageInfo("m1", "user"), [
            textPart("p1", "m1", "这个图片看看"),
            filePart("f1", "m1", {
              mime: "image/png",
              filename: "image.png",
              url: "data:image/png;base64,abc123",
            }),
          ])]}
          onCopyUserMessage={() => {}}
          onForkUserMessage={() => {}}
          onOpenFileAttachment={() => {}}
          onPreviewImageAttachment={() => {}}
          onRedoSession={() => {}}
          onUndoUserMessage={() => {}}
          panelTheme={panelTheme}
          showInternals={false}
          showThinking={true}
          skillCatalog={[]}
          AgentBadge={({ name }) => <span>{name}</span>}
          CompactionDivider={() => <div>divider</div>}
          EmptyState={({ title, text }) => <div>{title}:{text}</div>}
          MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
          PartView={({ part }) => <div>{part.type}</div>}
        />,
      )

      const stripIndex = html.indexOf("oc-userAttachmentThumbStrip")
      const bubbleIndex = html.indexOf('class="oc-turnUser ')

      assert.equal(stripIndex > -1, true)
      assert.equal(stripIndex < bubbleIndex, true)
      assert.equal(html.includes('class="oc-pillFileType">IMG</span>'), false)
      assert.equal(html.includes('aria-label="Preview image.png"'), true)
      assert.equal(html.includes('src="data:image/png;base64,abc123"'), true)
    }
  })

  test("hides inline file mention text when the same file is rendered as an attachment pill", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [
          textPart("p1", "m1", "我已经截了一些图片放到screenshot目录了，@README.md，图片可以重命名一下"),
          filePart("f1", "m1", {
            mime: "text/markdown",
            filename: "README.md",
            url: "file:///workspace/README.md",
            source: {
              type: "file",
              path: "/workspace/README.md",
              text: {
                value: "@README.md",
                start: 25,
                end: 35,
              },
            },
          }),
        ])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes('aria-label="Open attachment README.md"'), true)
    assert.equal(html.includes("我已经截了一些图片放到screenshot目录了，，图片可以重命名一下"), true)
    assert.equal(html.includes("@README.md"), false)
  })

  test("renders a compact command marker for prompt-style slash command text", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", INIT_PROMPT)])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        commandPromptInvocations={{}}
        commands={[INIT_COMMAND]}
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes("COMMAND"), true)
    assert.equal(html.includes("init"), true)
    assert.equal(html.includes('data-preview="Create or update AGENTS.md for this repository.'), true)
    assert.equal(html.includes("# What to extract"), false)
    assert.equal(html.includes('aria-label="Toggle command prompt init"'), true)
    assert.equal(html.includes('aria-expanded="false"'), true)
    assert.equal(html.includes("data-preview="), true)
  })

  test("does not crash when a user text part is not a string", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [{
          id: "p1",
          sessionID: "session-1",
          messageID: "m1",
          type: "text",
          text: { value: "bad payload" } as unknown as string,
        }])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        commandPromptInvocations={{}}
        commands={[INIT_COMMAND]}
        skillCatalog={[]}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes("No visible prompt text."), true)
    assert.equal(html.includes("COMMAND"), false)
  })

  test("does not render a command pill for skill-sourced command metadata", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", ARTICLE_WRITING_SKILL[0]!.content)])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        commandPromptInvocations={{}}
        commands={[{
          name: "article-writing",
          description: "skill entry",
          template: ARTICLE_WRITING_SKILL[0]!.content,
          hints: [],
          source: "skill",
        }]}
        skillCatalog={ARTICLE_WRITING_SKILL}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes("SKILL"), true)
    assert.equal(html.includes("COMMAND"), false)
  })

  test("does not render a persisted command pill for a skill slash command", () => {
    const fingerprint = fingerprintCommandPromptText(ARTICLE_WRITING_SKILL[0]!.content)

    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        compactSkillInvocations={true}
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", ARTICLE_WRITING_SKILL[0]!.content)])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onOpenFileAttachment={() => {}}
        onPreviewImageAttachment={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
        commandPromptInvocations={{
          [fingerprint]: {
            command: "article-writing",
            arguments: "topic",
          },
        }}
        commands={[{
          name: "article-writing",
          description: "skill entry",
          hints: [],
          source: "skill",
        }]}
        skillCatalog={ARTICLE_WRITING_SKILL}
        AgentBadge={({ name }) => <span>{name}</span>}
        CompactionDivider={() => <div>divider</div>}
        EmptyState={({ title, text }) => <div>{title}:{text}</div>}
        MarkdownBlock={({ content, className }) => <div className={className}>{content}</div>}
        PartView={({ part }) => <div>{part.type}</div>}
      />,
    )

    assert.equal(html.includes("SKILL"), true)
    assert.equal(html.includes("COMMAND"), false)
  })
})
