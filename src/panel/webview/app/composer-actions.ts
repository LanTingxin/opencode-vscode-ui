import type { CommandInfo } from "../../../core/sdk"

export type ComposerSlashAction =
  | {
      type: "newSession"
    }
  | {
      type: "command"
      command: string
      arguments: string
    }

export function resolveComposerSlashAction(draft: string, commands: CommandInfo[]): ComposerSlashAction | undefined {
  const slashMatch = draft.trim().match(/^\/(\S+)(?:\s+([\s\S]*))?$/)
  if (!slashMatch) {
    return undefined
  }

  const command = slashMatch[1] ?? ""
  const args = (slashMatch[2] ?? "").trim()

  if (command === "new" && !args) {
    return { type: "newSession" }
  }

  const known = commands.find((item) => item.name === command && item.source !== "skill")
  if (!known) {
    return undefined
  }

  return {
    type: "command",
    command,
    arguments: args,
  }
}
