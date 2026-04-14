import assert from "node:assert/strict"
import { describe, test } from "node:test"

import type { CommandInfo } from "../../../core/sdk"
import type { ComposerPromptPart } from "../../../bridge/types"
import { buildComposerHostMessage } from "./composer-submit"

const commands: CommandInfo[] = [
  {
    name: "review",
    description: "Review changes",
    hints: [],
    source: "command",
  },
  {
    name: "using-superpowers",
    description: "Load the superpowers workflow",
    hints: [],
    source: "skill",
  },
]

const model = {
  providerID: "openai",
  modelID: "gpt-5",
} as const

const image = {
  dataUrl: "data:image/png;base64,AAAA",
  mime: "image/png",
  name: "image.png",
} as const

describe("buildComposerHostMessage", () => {
  test("keeps skill slash commands on the slash-command path and forwards image parts", () => {
    const parts: ComposerPromptPart[] = [{ type: "text", text: "/using-superpowers " }]

    assert.deepEqual(buildComposerHostMessage({
      draft: "/using-superpowers ",
      commands,
      parts,
      images: [image],
      agent: "build",
      model,
      variant: "default",
    }), {
      type: "runSlashCommand",
      command: "using-superpowers",
      arguments: "",
      parts: [{
        type: "file",
        mime: "image/png",
        url: "data:image/png;base64,AAAA",
        filename: "image.png",
      }],
      agent: "build",
      model: "openai/gpt-5",
      variant: "default",
    })
  })

  test("keeps skill slash commands on the slash-command path without images", () => {
    assert.deepEqual(buildComposerHostMessage({
      draft: "/using-superpowers ",
      commands,
      parts: [{ type: "text", text: "/using-superpowers " }],
      images: [],
      agent: "build",
      model,
      variant: "default",
    }), {
      type: "runSlashCommand",
      command: "using-superpowers",
      arguments: "",
      agent: "build",
      model: "openai/gpt-5",
      variant: "default",
    })
  })

  test("keeps non-skill slash commands on the slash-command path and forwards image parts", () => {
    assert.deepEqual(buildComposerHostMessage({
      draft: "/review src/panel ",
      commands,
      parts: [{ type: "text", text: "/review src/panel " }],
      images: [image],
      agent: "build",
      model,
      variant: "default",
    }), {
      type: "runSlashCommand",
      command: "review",
      arguments: "src/panel",
      parts: [{
        type: "file",
        mime: "image/png",
        url: "data:image/png;base64,AAAA",
        filename: "image.png",
      }],
      agent: "build",
      model: "openai/gpt-5",
      variant: "default",
    })
  })
})
