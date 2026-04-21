import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { FilePart, MessageInfo, MessagePart, SessionMessage, TextPart, ToolPart } from "../../../core/sdk"
import { assistantCopyText, attachmentOpenPath, attachmentPreviewSource, createTimelineDerivationCache, findSkillLocation, reconcileTimelineBlocks } from "./timeline"

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

function toolPart(id: string, messageID: string, tool: string, status: ToolPart["state"]["status"] = "completed"): ToolPart {
  return {
    id,
    sessionID: "session-1",
    messageID,
    type: "tool",
    tool,
    state: {
      status,
    },
  }
}

function toolPartWithState(id: string, messageID: string, tool: string, state: Partial<ToolPart["state"]>): ToolPart {
  return {
    id,
    sessionID: "session-1",
    messageID,
    type: "tool",
    tool,
    state: {
      status: "completed",
      ...state,
    },
  }
}

function filePart(id: string, messageID: string, extras?: Partial<FilePart>): FilePart {
  return {
    id,
    sessionID: "session-1",
    messageID,
    type: "file",
    mime: "text/plain",
    url: "file:///workspace/notes.txt",
    ...extras,
  }
}

function sessionMessage(info: MessageInfo, parts: MessagePart[]): SessionMessage {
  return { info, parts }
}

const defaultOptions = {
  showThinking: true,
  showInternals: false,
}

describe("timeline block reconciliation", () => {
  test("delta-like updates rebuild only affected assistant blocks", () => {
    const user = sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "hello")])
    const assistantText = textPart("p2", "m2", "before")
    const assistantTool = toolPart("p3", "m2", "bash")
    const assistant = sessionMessage(messageInfo("m2", "assistant", { agent: "build" }), [assistantText, assistantTool])

    const cache = createTimelineDerivationCache()
    const first = reconcileTimelineBlocks(cache, [user, assistant], defaultOptions)

    const nextAssistantText = { ...assistantText, text: "before and after" }
    const nextAssistant = sessionMessage(assistant.info, [nextAssistantText, assistantTool])
    const second = reconcileTimelineBlocks(cache, [user, nextAssistant], defaultOptions)

    assert.equal(second.length, first.length)
    assert.strictEqual(second[0], first[0], "user block should be reused")
    assert.notStrictEqual(second[1], first[1], "changed assistant text block should be rebuilt")
    assert.strictEqual(second[2], first[2], "unchanged assistant tool block should be reused")
    assert.notStrictEqual(second[3], first[3], "assistant meta block should update for changed assistant message group")
    assert.equal(second[1]?.kind, "assistant-part")
    assert.equal(second[1]?.kind === "assistant-part" ? second[1].part.type : undefined, "text")
    assert.equal(second[1]?.kind === "assistant-part" && second[1].part.type === "text" ? second[1].part.text : undefined, "before and after")
    assert.equal(second[3]?.kind === "assistant-meta" ? second[3].messages[0] : undefined, nextAssistant)
  })

  test("reuses all block objects when inputs are identical", () => {
    const user = sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "hello")])
    const assistant = sessionMessage(messageInfo("m2", "assistant", { agent: "build" }), [textPart("p2", "m2", "done")])

    const cache = createTimelineDerivationCache()
    const first = reconcileTimelineBlocks(cache, [user, assistant], defaultOptions)
    const second = reconcileTimelineBlocks(cache, [user, assistant], defaultOptions)

    assert.equal(second.length, first.length)
    second.forEach((block, index) => {
      assert.strictEqual(block, first[index], `block ${index} should be reused`)
    })
  })

  test("appending a new assistant part preserves earlier block reuse", () => {
    const user = sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "hello")])
    const assistantText = textPart("p2", "m2", "before")
    const assistant = sessionMessage(messageInfo("m2", "assistant", { agent: "build" }), [assistantText])

    const cache = createTimelineDerivationCache()
    const first = reconcileTimelineBlocks(cache, [user, assistant], defaultOptions)

    const appendedTool = toolPart("p3", "m2", "bash")
    const nextAssistant = sessionMessage(assistant.info, [assistantText, appendedTool])
    const second = reconcileTimelineBlocks(cache, [user, nextAssistant], defaultOptions)

    assert.equal(second.length, first.length + 1)
    assert.strictEqual(second[0], first[0], "user block should be reused")
    assert.strictEqual(second[1], first[1], "existing assistant text block should be reused")
    assert.notStrictEqual(second[2], first[2], "assistant meta block should rebuild when the assistant message group changes")
    assert.equal(second[2]?.kind, "assistant-part")
    assert.equal(second[2]?.kind === "assistant-part" ? second[2].part : undefined, appendedTool)
    assert.equal(second[3]?.kind === "assistant-meta" ? second[3].messages[0] : undefined, nextAssistant)
  })

  test("adds an assistant error block ahead of assistant metadata", () => {
    const user = sessionMessage(messageInfo("m1", "user"), [textPart("p1", "m1", "hello")])
    const assistant = sessionMessage({
      ...messageInfo("m2", "assistant", { agent: "build" }),
      error: {
        name: "UnknownError",
        data: {
          message: "unknown certificate verification error",
        },
      },
    } as MessageInfo, [])

    const blocks = reconcileTimelineBlocks(createTimelineDerivationCache(), [user, assistant], defaultOptions)

    assert.equal(blocks.length, 3)
    assert.equal(blocks[1]?.kind, "assistant-error")
    assert.equal(blocks[1]?.kind === "assistant-error" ? blocks[1].message.info.id : undefined, "m2")
    assert.equal(blocks[2]?.kind, "assistant-meta")
  })

  test("groups codex assistant exploration, search, and command tools into one activity block", () => {
    const assistant = sessionMessage(messageInfo("m2", "assistant", { agent: "build" }), [
      toolPartWithState("p1", "m2", "read", { input: { filePath: "src/a.ts" } }),
      toolPartWithState("p2", "m2", "read", { input: { filePath: "src/b.ts" } }),
      toolPartWithState("p3", "m2", "glob", { input: { pattern: "**/*.tsx" } }),
      toolPartWithState("p4", "m2", "grep", { input: { pattern: "renderToolRowTitle" } }),
      toolPartWithState("p5", "m2", "bash", { input: { command: "echo hi" }, metadata: { output: "hi" } }),
    ])

    const blocks = reconcileTimelineBlocks(createTimelineDerivationCache(), [assistant], {
      ...defaultOptions,
      panelTheme: "codex",
    })

    assert.equal(blocks[0]?.kind, "assistant-activity")
    assert.equal(blocks[0]?.kind === "assistant-activity" ? blocks[0].summary : undefined, "explored 2 files, 2 searches, ran 1 command")
    assert.equal(blocks[0]?.kind === "assistant-activity" ? blocks[0].parts.length : undefined, 5)
    assert.equal(blocks[1]?.kind, "assistant-meta")
  })

  test("keeps assistant tools on the existing part path outside codex theme", () => {
    const assistant = sessionMessage(messageInfo("m2", "assistant", { agent: "build" }), [
      toolPartWithState("p1", "m2", "read", { input: { filePath: "src/a.ts" } }),
      toolPartWithState("p2", "m2", "grep", { input: { pattern: "renderToolRowTitle" } }),
      toolPartWithState("p3", "m2", "bash", { input: { command: "echo hi" }, metadata: { output: "hi" } }),
    ])

    const blocks = reconcileTimelineBlocks(createTimelineDerivationCache(), [assistant], defaultOptions)

    assert.equal(blocks.filter((block) => block.kind === "assistant-activity").length, 0)
    assert.equal(blocks.filter((block) => block.kind === "assistant-part").length, 3)
    assert.equal(blocks.at(-1)?.kind, "assistant-meta")
  })
})

describe("timeline attachment helpers", () => {
  test("returns the original assistant markdown text for copy actions", () => {
    assert.equal(assistantCopyText(textPart("p1", "m1", "# 标题\n\n- 条目")), "# 标题\n\n- 条目")
  })

  test("does not expose synthetic assistant text to the copy action", () => {
    assert.equal(assistantCopyText({
      ...textPart("p2", "m2", "hidden"),
      synthetic: true,
    }), "")
  })

  test("finds the configured skill file location", () => {
    assert.equal(findSkillLocation("brainstorming", [
      {
        name: "brainstorming",
        content: "# Brainstorming",
        location: "/Users/lantingxin/.codex/superpowers/skills/brainstorming/SKILL.md",
      },
    ]), "/Users/lantingxin/.codex/superpowers/skills/brainstorming/SKILL.md")
  })

  test("prefers the original source path when opening file attachments", () => {
    assert.equal(attachmentOpenPath(filePart("f1", "m1", {
      source: {
        type: "file",
        path: "src/app.tsx",
        text: {
          value: "@src/app.tsx",
          start: 0,
          end: 12,
        },
      },
    })), "src/app.tsx")
  })

  test("returns a preview source for inline image attachments", () => {
    assert.equal(attachmentPreviewSource(filePart("f2", "m1", {
      mime: "image/png",
      filename: "image.png",
      url: "data:image/png;base64,abc123",
    })), "data:image/png;base64,abc123")
  })

  test("does not inline-preview local image files without a webview-safe source", () => {
    assert.equal(attachmentPreviewSource(filePart("f3", "m1", {
      mime: "image/png",
      filename: "image.png",
      url: "file:///workspace/image.png",
    })), undefined)
  })

  test("does not inline-preview insecure http image sources", () => {
    assert.equal(attachmentPreviewSource(filePart("f4", "m1", {
      mime: "image/png",
      filename: "image.png",
      url: "http://example.com/image.png",
    })), undefined)
  })

  test("does not route remote urls through the local file opener", () => {
    assert.equal(attachmentOpenPath(filePart("f5", "m1", {
      url: "https://example.com/file.txt",
    })), undefined)
  })
})
