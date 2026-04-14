import type { ComposerPromptPart, WebviewMessage } from "../../../bridge/types"
import type { CommandInfo, MessageInfo } from "../../../core/sdk"
import { resolveComposerSlashAction } from "./composer-actions"

type ComposerImageInput = NonNullable<Extract<WebviewMessage, { type: "submit" }>["images"]>

type ComposerHostMessage = Extract<WebviewMessage, { type: "submit" | "runSlashCommand" }>

type BuildComposerHostMessageInput = {
  draft: string
  commands: CommandInfo[]
  parts: ComposerPromptPart[]
  images: ComposerImageInput
  agent?: string
  model?: MessageInfo["model"]
  variant?: string
}

export function buildComposerHostMessage(input: BuildComposerHostMessageInput): ComposerHostMessage {
  const slashAction = resolveComposerSlashAction(input.draft, input.commands)
  const commandParts = input.images.map((attachment) => ({
    type: "file" as const,
    mime: attachment.mime,
    url: attachment.dataUrl,
    filename: attachment.name,
  }))

  if (slashAction?.type === "command") {
    return {
      type: "runSlashCommand",
      command: slashAction.command,
      arguments: slashAction.arguments,
      ...(commandParts.length > 0 ? { parts: commandParts } : {}),
      agent: input.agent,
      model: input.model ? `${input.model.providerID}/${input.model.modelID}` : undefined,
      variant: input.variant,
    }
  }

  return {
    type: "submit",
    text: input.draft,
    parts: input.parts,
    images: input.images.length > 0 ? input.images : undefined,
    agent: input.agent,
    model: input.model,
    variant: input.variant,
  }
}
