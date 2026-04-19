import type { CommandInfo } from "../../../core/sdk"

export type ComposerSlashAction =
  | {
      type: "newSession"
    }
  | {
      type: "openSkillPicker"
    }
  | {
      type: "openThemePicker"
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

  if (command === "skills" && !args) {
    return { type: "openSkillPicker" }
  }

  if (command === "theme" && !args) {
    return { type: "openThemePicker" }
  }

  const known = commands.find((item) => item.name === command)
  if (!known) {
    return undefined
  }

  return {
    type: "command",
    command,
    arguments: args,
  }
}

export function isCompletedSlashCommand(draft: string, commands: CommandInfo[]) {
  const slashMatch = draft.match(/^\/(\S+)\s+$/) ?? draft.trim().match(/^\/(\S+)$/)
  if (!slashMatch) {
    return false
  }

  const command = slashMatch[1] ?? ""
  return commands.some((item) => item.name === command)
}
