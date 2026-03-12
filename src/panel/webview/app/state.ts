import type { ComposerFileSelection, ComposerPathKind, SessionBootstrap, SessionSnapshot } from "../../../bridge/types"
import type { AgentInfo, CommandInfo, FileDiff, LspStatus, McpResource, McpStatus, MessageInfo, PermissionRequest, ProviderInfo, QuestionRequest, SessionInfo, SessionMessage, SessionStatus, Todo } from "../../../core/sdk"

export type VsCodeApi = {
  postMessage(message: unknown): void
  getState<T>(): T | undefined
  setState<T>(state: T): void
}

export type FormState = {
  selected: Record<string, string[]>
  custom: Record<string, string>
  reject: Record<string, string>
}

type ComposerMentionBase = {
  content: string
  start: number
  end: number
}

export type ComposerMention = ({
  type: "agent"
  name: string
} | {
  type: "file"
  path: string
  kind?: ComposerPathKind
  selection?: ComposerFileSelection
} | {
  type: "resource"
  uri: string
  name: string
  clientName: string
  mimeType?: string
}) & ComposerMentionBase

export type ComposerEditorPart = ({
  type: "text"
  content: string
} | {
  type: "agent"
  name: string
  content: string
} | {
  type: "file"
  path: string
  kind?: ComposerPathKind
  selection?: ComposerFileSelection
  content: string
} | {
  type: "resource"
  uri: string
  name: string
  clientName: string
  mimeType?: string
  content: string
}) & ComposerMentionBase

export type ComposerModelRef = NonNullable<MessageInfo["model"]>

export type AppState = {
  bootstrap: SessionBootstrap
  snapshot: {
    session?: SessionInfo
    messages: SessionMessage[]
    childMessages: Record<string, SessionMessage[]>
    childSessions: Record<string, SessionInfo>
    sessionStatus?: SessionStatus
    submitting: boolean
    todos: Todo[]
    diff: FileDiff[]
    permissions: PermissionRequest[]
    questions: QuestionRequest[]
    agents: AgentInfo[]
    defaultAgent?: string
    providers: ProviderInfo[]
    providerDefault?: Record<string, string>
    configuredModel?: {
      providerID: string
      modelID: string
    }
    mcp: Record<string, McpStatus>
    mcpResources: Record<string, McpResource>
    lsp: LspStatus[]
    commands: CommandInfo[]
    agentMode: "build" | "plan"
    navigation: {
      firstChild?: { id: string; title: string }
      parent?: { id: string; title: string }
      prev?: { id: string; title: string }
      next?: { id: string; title: string }
    }
  }
  draft: string
  composerParts: ComposerEditorPart[]
  composerMentions: ComposerMention[]
  composerAgentOverride?: string
  composerMentionAgentOverride?: string
  composerModelOverrides: Record<string, ComposerModelRef>
  composerRecentModels: ComposerModelRef[]
  composerFavoriteModels: ComposerModelRef[]
  composerModelVariants: Record<string, string>
  composerHydratedMessageID?: string
  error: string
  form: FormState
}

export type PersistedAppState = {
  dir: string
  sessionId: string
  composerAgentOverride?: string
  composerModelOverrides?: Record<string, ComposerModelRef>
  composerRecentModels?: ComposerModelRef[]
  composerFavoriteModels?: ComposerModelRef[]
  composerModelVariants?: Record<string, string>
}

export function createInitialState(initialRef: SessionBootstrap["sessionRef"] | null, persisted?: PersistedAppState): AppState {
  const sameSession = persisted?.dir === initialRef?.dir && persisted?.sessionId === initialRef?.sessionId
  return {
    bootstrap: {
      status: "loading",
      workspaceName: initialRef?.dir ? initialRef.dir.split(/[\\/]/).pop() || initialRef.dir : "-",
      sessionRef: initialRef ?? { dir: "-", sessionId: "-" },
      message: "Waiting for workspace server and session metadata.",
    },
    snapshot: {
      messages: [],
      session: undefined,
      childMessages: {},
      childSessions: {},
      sessionStatus: undefined,
      submitting: false,
      todos: [],
      diff: [],
      permissions: [],
      questions: [],
      agents: [],
      defaultAgent: undefined,
      providers: [],
      providerDefault: undefined,
      configuredModel: undefined,
      mcp: {},
      mcpResources: {},
      lsp: [],
      commands: [],
      agentMode: "build",
      navigation: {},
    },
    draft: "",
    composerParts: [{ type: "text", content: "", start: 0, end: 0 }],
    composerMentions: [],
    composerAgentOverride: sameSession ? persisted?.composerAgentOverride : undefined,
    composerMentionAgentOverride: undefined,
    composerModelOverrides: sameSession ? normalizeModelMap(persisted?.composerModelOverrides) : {},
    composerRecentModels: sameSession ? normalizeModelList(persisted?.composerRecentModels) : [],
    composerFavoriteModels: normalizeModelList(persisted?.composerFavoriteModels),
    composerModelVariants: sameSession ? normalizeVariantMap(persisted?.composerModelVariants) : {},
    composerHydratedMessageID: undefined,
    error: "",
    form: {
      selected: {},
      custom: {},
      reject: {},
    },
  }
}

export function persistableAppState(state: AppState): PersistedAppState {
  return {
    dir: state.bootstrap.sessionRef.dir,
    sessionId: state.bootstrap.sessionRef.sessionId,
    composerAgentOverride: state.composerAgentOverride,
    composerModelOverrides: normalizeModelMap(state.composerModelOverrides),
    composerRecentModels: normalizeModelList(state.composerRecentModels),
    composerFavoriteModels: normalizeModelList(state.composerFavoriteModels),
    composerModelVariants: normalizeVariantMap(state.composerModelVariants),
  }
}

export function bootstrapFromSnapshot(payload: SessionSnapshot): SessionBootstrap {
  return {
    status: payload.status,
    workspaceName: payload.workspaceName,
    sessionRef: payload.sessionRef,
    session: payload.session,
    message: payload.message,
  }
}

export function normalizeSnapshotPayload(payload: SessionSnapshot): AppState["snapshot"] {
  return {
    session: payload.session,
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    childMessages: recordOfMessageLists(payload.childMessages),
    childSessions: recordOfSessions(payload.childSessions),
    sessionStatus: payload.sessionStatus,
    submitting: !!payload.submitting,
    todos: Array.isArray(payload.todos) ? payload.todos : [],
    diff: Array.isArray(payload.diff) ? payload.diff : [],
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    questions: Array.isArray(payload.questions) ? payload.questions : [],
    agents: Array.isArray(payload.agents) ? payload.agents : [],
    defaultAgent: payload.defaultAgent,
    providers: Array.isArray(payload.providers) ? payload.providers : [],
    providerDefault: payload.providerDefault,
    configuredModel: payload.configuredModel,
    mcp: recordValue(payload.mcp) as Record<string, McpStatus>,
    mcpResources: recordValue(payload.mcpResources) as Record<string, McpResource>,
    lsp: Array.isArray(payload.lsp) ? payload.lsp : [],
    commands: Array.isArray(payload.commands) ? payload.commands : [],
    agentMode: payload.agentMode === "plan" ? "plan" : "build",
    navigation: payload.navigation || {},
  }
}

function recordOfMessageLists(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, SessionMessage[]>
  }

  const out: Record<string, SessionMessage[]> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = Array.isArray(entry) ? entry.filter((item): item is SessionMessage => !!item && typeof item === "object") : []
  }
  return out
}

function recordOfSessions(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, SessionInfo>
  }

  const out: Record<string, SessionInfo> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry && typeof entry === "object") {
      out[key] = entry as SessionInfo
    }
  }
  return out
}

function recordValue(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

function normalizeModelList(value: ComposerModelRef[] | undefined) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(normalizeModelRef)
    .filter((item): item is ComposerModelRef => !!item)
}

function normalizeModelMap(value: Record<string, ComposerModelRef> | undefined) {
  if (!value || typeof value !== "object") {
    return {}
  }

  const out: Record<string, ComposerModelRef> = {}
  for (const [key, model] of Object.entries(value)) {
    const normalized = normalizeModelRef(model)
    if (normalized) {
      out[key] = normalized
    }
  }
  return out
}

function normalizeVariantMap(value: Record<string, string> | undefined) {
  if (!value || typeof value !== "object") {
    return {}
  }

  const out: Record<string, string> = {}
  for (const [key, variant] of Object.entries(value)) {
    if (typeof variant !== "string") {
      continue
    }
    const clean = variant.trim()
    if (clean) {
      out[key] = clean
    }
  }
  return out
}

function normalizeModelRef(model: ComposerModelRef | undefined) {
  const providerID = model?.providerID?.trim()
  const modelID = model?.modelID?.trim()
  if (!providerID || !modelID) {
    return undefined
  }

  return { providerID, modelID }
}
