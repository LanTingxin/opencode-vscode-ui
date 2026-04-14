import assert from "node:assert/strict"
import { describe, test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import type { MessageInfo, MessagePart, SessionMessage, TextPart } from "../../../core/sdk"
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

describe("Timeline user message rendering", () => {
  test("does not render a dedicated You header for user messages", () => {
    const html = renderToStaticMarkup(
      <Timeline
        bootstrapStatus="ready"
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "hello")])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
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
        diffMode="unified"
        messages={[sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "hello")])]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onRedoSession={() => {}}
        onUndoUserMessage={() => {}}
        showInternals={false}
        showThinking={true}
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
        diffMode="unified"
        messages={[
          sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "hello")]),
          sessionMessage(messageInfo("m2", "assistant"), [textPart("p2", "m2", "done")]),
        ]}
        onCopyUserMessage={() => {}}
        onForkUserMessage={() => {}}
        onUndoUserMessage={() => {}}
        onRedoSession={() => {}}
        revertID="m1"
        showInternals={false}
        showThinking={true}
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
})
