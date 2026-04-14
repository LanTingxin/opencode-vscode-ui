import type { ComposerPathResult } from "../../../bridge/types"
import type { AppState } from "./state"
import type { ComposerAutocompleteItem } from "../hooks/useComposerAutocomplete"
import { formatComposerFileContent, formatComposerFileDisplay, parseComposerFileQuery } from "../lib/composer-file-selection"

export function buildComposerMenuItems(state: AppState, files: ComposerPathResult[]): ComposerAutocompleteItem[] {
  const slashItems: ComposerAutocompleteItem[] = [
    {
      id: "slash-new",
      label: "new",
      detail: "Start a new session in this workspace.",
      keywords: ["session", "fresh", "conversation"],
      trigger: "slash",
      kind: "action",
    },
    {
      id: "slash-compact",
      label: "compact",
      detail: "Summarize this session immediately using the current model.",
      keywords: ["summarize", "summary", "compress", "session"],
      trigger: "slash",
      kind: "action",
    },
    {
      id: "slash-model",
      label: "model",
      detail: "Open the model picker for the current agent.",
      keywords: ["switch", "provider", "variant", "llm"],
      trigger: "slash",
      kind: "action",
    },
    {
      id: "slash-skills",
      label: "skills",
      detail: "Open the skill picker and insert a skill command.",
      keywords: ["skill", "picker", "workflow"],
      trigger: "slash",
      kind: "action",
    },
    {
      id: "slash-undo",
      label: "undo",
      detail: "Revert the previous user turn immediately.",
      keywords: ["revert", "previous", "message", "back"],
      trigger: "slash",
      kind: "action",
    },
    {
      id: "slash-refresh",
      label: "refresh",
      detail: "Ask the host to reload the current session snapshot.",
      keywords: ["reload", "snapshot", "panel", "host"],
      trigger: "slash",
      kind: "action",
    },
  ]

  if (state.snapshot.session?.revert?.messageID) {
    slashItems.push({
      id: "slash-redo",
      label: "redo",
      detail: "Restore previously reverted messages immediately.",
      keywords: ["unrevert", "restore", "forward"],
      trigger: "slash",
      kind: "action",
    })
  }

  if (state.composerAgentOverride || state.composerMentionAgentOverride) {
    slashItems.push({
      id: "slash-reset-agent",
      label: "reset-agent",
      detail: "Return the composer to the default agent selection.",
      keywords: ["agent", "default", "override"],
      trigger: "slash",
      kind: "action",
    })
  }

  const commandItems: ComposerAutocompleteItem[] = state.snapshot.commands
    .filter((cmd) => cmd.source !== "skill")
    .map((cmd) => {
      const isMcp = cmd.source === "mcp"
      return {
        id: `command:${cmd.name}`,
        label: cmd.name,
        detail: cmd.description ? (isMcp ? `${cmd.description} :mcp` : cmd.description) : (isMcp ? ":mcp" : ""),
        keywords: [cmd.source ?? "", cmd.agent ?? ""].filter(Boolean),
        trigger: "slash" as const,
        kind: "command" as const,
      }
    })

  const skillItems: ComposerAutocompleteItem[] = state.snapshot.commands
    .filter((cmd) => cmd.source === "skill")
    .map((cmd) => ({
      id: `skill:${cmd.name}`,
      label: cmd.name,
      detail: cmd.description ?? "",
      keywords: [cmd.agent ?? "", ...cmd.hints].filter(Boolean),
      trigger: "skill" as const,
      kind: "command" as const,
    }))

  const agentItems = state.snapshot.agents
    .filter((agent) => !agent.hidden && agent.mode !== "primary")
    .map((agent) => ({
    id: `agent:${agent.name}`,
    label: `@${agent.name}`,
    detail: "",
    keywords: [agent.mode, agent.variant ?? ""].filter(Boolean),
    value: `@${agent.name}`,
    trigger: "mention" as const,
    kind: "agent" as const,
    mention: {
      type: "agent" as const,
      name: agent.name,
      content: `@${agent.name}`,
    },
  }))

  const resourceItems = Object.values(state.snapshot.mcpResources).map((resource) => ({
    id: `resource:${resource.client}:${resource.uri}`,
    label: `@${resource.name}`,
    detail: `${resource.name} (${resource.uri})`,
    keywords: [resource.client, resource.uri, resource.description ?? ""].filter(Boolean),
    value: `${resource.name} (${resource.uri})`,
    trigger: "mention" as const,
    kind: "resource" as const,
    mention: {
      type: "resource" as const,
      uri: resource.uri,
      name: resource.name,
      clientName: resource.client,
      mimeType: resource.mimeType,
      content: `@${resource.name}`,
    },
  }))

  const fileItems = files.map((item) => ({
    id: `${item.source}:${item.kind}:${item.path}:${item.selection?.startLine ?? ""}:${item.selection?.endLine ?? ""}`,
    label: `@${item.path}`,
    detail: item.path,
    keywords: item.path.split("/").filter(Boolean).concat(item.source, item.kind, item.selection ? [String(item.selection.startLine), String(item.selection.endLine ?? "")] : []),
    value: item.path,
    trigger: "mention" as const,
    kind: item.source === "selection" ? "selection" as const : item.source === "recent" ? "recent" as const : item.kind === "directory" ? "directory" as const : "file" as const,
    mention: {
      type: "file" as const,
      path: item.path,
      kind: item.kind,
      selection: item.selection,
      content: formatComposerFileContent(item.path, item.selection),
    },
  }))

  return [...slashItems, ...commandItems, ...skillItems, ...agentItems, ...fileItems, ...resourceItems]
}

export function mentionForQuery(mention: Extract<NonNullable<ComposerAutocompleteItem["mention"]>, { type: "file" }>, query: string): Extract<NonNullable<ComposerAutocompleteItem["mention"]>, { type: "file" }> {
  const parsed = parseComposerFileQuery(query)
  if (!parsed.selection || mention.kind === "directory" || mention.selection) {
    return mention
  }

  return {
    ...mention,
    selection: parsed.selection,
    content: formatComposerFileContent(mention.path, parsed.selection),
  }
}

export function autocompleteItemView(query: string, item: ComposerAutocompleteItem) {
  const mention = item.mention
  if (!mention || mention.type === "agent") {
    return { label: item.label, detail: item.detail, kind: item.kind }
  }

  if (mention.type === "resource") {
    return {
      label: item.label,
      detail: item.detail,
      kind: item.kind,
    }
  }

  const next = mentionForQuery(mention, query)
  const label = next.selection
    ? formatComposerFileDisplay(item.label, next.selection)
    : item.label
  const detail = next.selection
    ? formatComposerFileDisplay(item.detail, next.selection)
    : item.detail
  return { label, detail, kind: item.kind }
}
