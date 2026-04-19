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
    assert.equal(html.includes("oc-chainItem oc-chainItem-assistant-meta"), false)
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
