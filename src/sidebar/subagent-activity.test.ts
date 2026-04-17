import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { summarizeSubagentActivity } from "./subagent-activity"

describe("sidebar subagent activity", () => {
  test("matches session task body by preferring the latest titled child tool", () => {
    const activity = summarizeSubagentActivity(
      { type: "busy" },
      [
        userMessage("child-a", "user-1", 1_000),
        assistantMessage("child-a", "assistant-1", 2_000, undefined, [
          runningTool("child-a", "assistant-1", "tool-1", "webfetch", "https://www.qwen.ai"),
          completedTool("child-a", "assistant-1", "tool-2", "webfetch", "https://codeium.com"),
        ]),
      ],
    )

    assert.equal(activity, "webfetch: https://codeium.com")
  })

  test("matches completed session summaries", () => {
    const activity = summarizeSubagentActivity(
      { type: "idle" },
      [
        userMessage("child-a", "user-1", 10_000),
        assistantMessage("child-a", "assistant-1", 11_000, 13_000, [
          completedTool("child-a", "assistant-1", "tool-1", "read", "README.md"),
        ]),
      ],
    )

    assert.equal(activity, "1 tools · 3s")
  })
})

function userMessage(sessionID: string, id: string, created: number) {
  return {
    info: {
      id,
      sessionID,
      role: "user" as const,
      time: { created },
    },
    parts: [],
  }
}

function assistantMessage(sessionID: string, id: string, created: number, completed?: number, parts: Array<ReturnType<typeof runningTool> | ReturnType<typeof completedTool>> = []) {
  return {
    info: {
      id,
      sessionID,
      role: "assistant" as const,
      time: completed === undefined ? { created } : { created, completed },
    },
    parts,
  }
}

function runningTool(sessionID: string, messageID: string, id: string, tool: string, title: string) {
  return {
    id,
    sessionID,
    messageID,
    type: "tool" as const,
    tool,
    state: {
      status: "running" as const,
      input: {},
      title,
      time: {
        start: 1,
      },
    },
  }
}

function completedTool(sessionID: string, messageID: string, id: string, tool: string, title: string) {
  return {
    id,
    sessionID,
    messageID,
    type: "tool" as const,
    tool,
    state: {
      status: "completed" as const,
      input: {},
      output: "",
      title,
      metadata: {},
      time: {
        start: 1,
        end: 2,
      },
    },
  }
}
