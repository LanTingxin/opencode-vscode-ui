import * as vscode from "vscode"

export type DiffMode = "unified" | "split"
export type PanelTheme = "classic" | "codex" | "claude"

export type DisplaySettings = {
  showInternals: boolean
  showThinking: boolean
  diffMode: DiffMode
  compactSkillInvocations?: boolean
  showSkillsInSlashAutocomplete?: boolean
  panelTheme: PanelTheme
}

const SECTION = "opencode-ui"

export const HTTP_PROXY_KEY = "httpProxy"
export const SHOW_INTERNALS_KEY = "showInternals"
export const SHOW_THINKING_KEY = "showThinking"
export const DIFF_MODE_KEY = "diffMode"
export const COMPACT_SKILL_INVOCATIONS_KEY = "compactSkillInvocations"
export const SHOW_SKILLS_IN_SLASH_AUTOCOMPLETE_KEY = "showSkillsInSlashAutocomplete"
export const PANEL_THEME_KEY = "panelTheme"

export function getDisplaySettings(): DisplaySettings {
  const config = vscode.workspace.getConfiguration(SECTION)
  return {
    showInternals: config.get<boolean>(SHOW_INTERNALS_KEY, false),
    showThinking: config.get<boolean>(SHOW_THINKING_KEY, true),
    diffMode: config.get<DiffMode>(DIFF_MODE_KEY, "unified") === "split" ? "split" : "unified",
    compactSkillInvocations: config.get<boolean>(COMPACT_SKILL_INVOCATIONS_KEY, true),
    showSkillsInSlashAutocomplete: config.get<boolean>(SHOW_SKILLS_IN_SLASH_AUTOCOMPLETE_KEY, false),
    panelTheme: normalizePanelTheme(config.get<string>(PANEL_THEME_KEY, "codex")),
  }
}

export function getHttpProxy() {
  const config = vscode.workspace.getConfiguration(SECTION)
  const proxy = config.get<string>(HTTP_PROXY_KEY, "").trim()

  if (proxy) {
    return proxy
  }

  if (hasInheritedProxy()) {
    return ""
  }

  return vscode.workspace.getConfiguration("http").get<string>("proxy", "").trim()
}

export function affectsDisplaySettings(event: vscode.ConfigurationChangeEvent) {
  return event.affectsConfiguration(`${SECTION}.${SHOW_INTERNALS_KEY}`)
    || event.affectsConfiguration(`${SECTION}.${SHOW_THINKING_KEY}`)
    || event.affectsConfiguration(`${SECTION}.${DIFF_MODE_KEY}`)
    || event.affectsConfiguration(`${SECTION}.${COMPACT_SKILL_INVOCATIONS_KEY}`)
    || event.affectsConfiguration(`${SECTION}.${SHOW_SKILLS_IN_SLASH_AUTOCOMPLETE_KEY}`)
    || event.affectsConfiguration(`${SECTION}.${PANEL_THEME_KEY}`)
}

export function affectsHttpProxySetting(event: vscode.ConfigurationChangeEvent) {
  return event.affectsConfiguration(`${SECTION}.${HTTP_PROXY_KEY}`)
    || event.affectsConfiguration("http.proxy")
}

export async function updatePanelTheme(theme: PanelTheme) {
  await vscode.workspace.getConfiguration(SECTION).update(PANEL_THEME_KEY, normalizePanelTheme(theme), vscode.ConfigurationTarget.Global)
}

export function openSettingsQuery() {
  return "@ext:lantingxin.opencode-enhanced-ui"
}

export function proxyRestartMessage() {
  return "Proxy setting changed. Restart the editor to apply it to opencode serve."
}

function hasInheritedProxy() {
  return [
    process.env.HTTP_PROXY,
    process.env.HTTPS_PROXY,
    process.env.http_proxy,
    process.env.https_proxy,
  ].some((value) => typeof value === "string" && value.trim().length > 0)
}

function normalizePanelTheme(value: string): PanelTheme {
  switch (value) {
    case "classic":
    case "codex":
    case "claude":
      return value
    case "default":
      return "classic"
    default:
      return "codex"
  }
}
