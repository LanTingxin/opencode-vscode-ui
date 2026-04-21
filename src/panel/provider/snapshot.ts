import * as path from "node:path"
import type { SessionPanelRef, SessionSnapshot } from "../../bridge/types"
import { syncTrackedSession } from "../../core/session-list"
import { loadSkillCatalog } from "../../core/skills"
import { getDisplaySettings } from "../../core/settings"
import type { AgentInfo, Client, CommandInfo, FileDiff, FormatterStatus, LspStatus, McpResource, McpStatus, ProviderAuthMethod, ProviderInfo, SessionInfo, SessionMessage } from "../../core/sdk"
import { WorkspaceManager } from "../../core/workspace"
import { summarizeSessionSnapshot } from "../shared/session-summary"
import { filterPermission, filterQuestion, nav, relatedSessionMap, subtreeSessionIds } from "./navigation"
import { sortMessages } from "./mutations"
import { idle, text } from "./utils"

type SnapshotContext = {
  ref: SessionPanelRef
  mgr: WorkspaceManager
  log: (message: string) => void
  isSubmitting: () => boolean
  messageLimit?: number
}

type DeferredSnapshotData = Pick<SessionSnapshot, "sessionStatus" | "permissions" | "questions" | "providerAuth" | "mcp" | "mcpResources" | "lsp" | "formatter" | "commands">

export type SessionSnapshotBuild = {
  snapshot: SessionSnapshot
  deferred?: Promise<DeferredSnapshotData>
}

export const DEFAULT_SESSION_MESSAGE_LIMIT = 200

export async function buildSessionSnapshot({ ref, mgr, log, isSubmitting, messageLimit: requestedMessageLimit }: SnapshotContext): Promise<SessionSnapshotBuild> {
  const display = getDisplaySettings()
  const rt = mgr.get(ref.workspaceId)
  const workspaceName = rt?.name || path.basename(ref.dir)
  const messageLimit = Math.max(1, requestedMessageLimit ?? DEFAULT_SESSION_MESSAGE_LIMIT)

  if (!rt) {
    return {
      snapshot: fallbackSnapshot(ref, workspaceName, "error", "Workspace runtime is unavailable for this folder.", isSubmitting()),
    }
  }

  if (rt.state === "starting" || rt.state === "stopping" || !rt.sdk) {
    return {
      snapshot: fallbackSnapshot(
        ref,
        workspaceName,
        "loading",
        rt.state === "stopping" ? "Workspace runtime is stopping." : "Workspace runtime is starting.",
        isSubmitting(),
      ),
    }
  }

  if (rt.state !== "ready") {
    return {
      snapshot: fallbackSnapshot(ref, workspaceName, "error", rt.err || "Workspace runtime is not ready.", isSubmitting()),
    }
  }

  try {
    const [sessionRes, rootMessageRes, todoRes, diffRes, configRes, configProvidersRes, agentRes, providerRes, skillCatalog] = await Promise.all([
      rt.sdk.session.get({
        sessionID: ref.sessionId,
        directory: rt.dir,
      }),
      rt.sdk.session.messages({
        sessionID: ref.sessionId,
        directory: rt.dir,
        limit: messageLimit,
      }),
      rt.sdk.session.todo({
        sessionID: ref.sessionId,
        directory: rt.dir,
      }),
      rt.sdk.session.diff({
        sessionID: ref.sessionId,
        directory: rt.dir,
      }),
      configInfo(rt.sdk, rt.dir),
      configProviders(rt.sdk, rt.dir),
      agentInfo(rt.sdk, rt.dir),
      rt.sdk.provider.list({
        directory: rt.dir,
      }),
      loadSkillCatalog(rt.dir, rt.sdk),
    ])

    const session = sessionRes.data

    if (!session) {
      return {
        snapshot: fallbackSnapshot(ref, workspaceName, "error", "Session metadata was not found for this workspace.", isSubmitting()),
      }
    }

    syncTrackedSession(rt.sessions, rt.sessionStatuses, session)
    const tree = await sessionTree(rt.sdk, rt.dir, session)
    const rootMessages = rootMessageRes.data ?? []
    const [messages, childMessages, childHasEarlier] = await relatedMessages(rt.sdk, rt.dir, session.id, tree.relatedSessionIds, rootMessages, messageLimit)
    const childSessions = relatedSessionMap(tree.sessions, session.id, tree.relatedSessionIds)
    const navigation = nav(session, tree.navSessions)
    const agents = agentList(agentRes.data)
    const defaultAgent = defaultAgentName(agentRes.data)
    const providers = providerSnapshot(configProvidersRes.data, providerRes.data)
    const defaults = providerDefaults(configProvidersRes.data, providerRes.data)
    const configuredModel = parseModelRef(configRes.data?.model)
    const firstAgent = agents[0]
    const freshModel = firstAgent?.model || (agents.length === 0 ? configuredModel || fallbackModelRef(providers, defaults) : undefined)

    log([
      `agent count=${agents.length}`,
      `first=${firstAgent?.name || "-"}`,
      `firstModel=${modelLabel(firstAgent?.model)}`,
      `defaultAgent=${defaultAgent || "-"}`,
      `freshModel=${modelLabel(freshModel)}`,
      `agentSource=${agents.length > 0 ? "agent" : "fallback"}`,
    ].join(" "))

    const snapshot = patch({
      status: "ready",
      display,
      skillCatalog,
      messageHistory: {
        limit: messageLimit,
        hasEarlier: rootMessages.length >= messageLimit || childHasEarlier,
      },
      sessionRef: ref,
      workspaceName,
      session,
      sessionStatus: idle(),
      messages,
      childMessages,
      childSessions,
      submitting: isSubmitting(),
      todos: todoRes.data ?? [],
      diff: sortDiff(diffRes.data ?? []),
      permissions: [],
      questions: [],
      agents,
      defaultAgent,
      providers,
      providerAuth: {},
      providerDefault: defaults,
      configuredModel,
      mcp: {},
      mcpResources: {},
      lsp: [],
      formatter: [],
      commands: [],
      relatedSessionIds: tree.relatedSessionIds,
      agentMode: agentMode(messages),
      navigation,
    })

    return {
      snapshot,
      deferred: loadDeferredSnapshot({
        sdk: rt.sdk,
        dir: rt.dir,
        sessionId: ref.sessionId,
        requestSessionIds: tree.requestSessionIds,
      }),
    }
  } catch (err) {
    log(`snapshot failed: ${text(err)}`)
    return {
      snapshot: fallbackSnapshot(ref, workspaceName, "error", text(err), isSubmitting()),
    }
  }
}

async function loadDeferredSnapshot({
  sdk,
  dir,
  sessionId,
  requestSessionIds,
}: {
  sdk: Client
  dir: string
  sessionId: string
  requestSessionIds: string[]
}) {
  const [statusRes, permissionRes, questionRes, providerAuthRes, mcpRes, resourceRes, lspRes, formatterRes, commandRes] = await Promise.all([
    sdk.session.status({
      directory: dir,
    }),
    sdk.permission.list({
      directory: dir,
    }),
    sdk.question.list({
      directory: dir,
    }),
    sdk.provider.auth({
      directory: dir,
    }),
    sdk.mcp.status({
      directory: dir,
    }),
    experimentalResources(sdk, dir),
    sdk.lsp.status({
      directory: dir,
    }),
    sdk.formatter.status({
      directory: dir,
    }),
    commandList(sdk, dir),
  ])

  return {
    sessionStatus: statusRes.data?.[sessionId] ?? idle(),
    permissions: filterPermission(permissionRes.data ?? [], requestSessionIds),
    questions: filterQuestion(questionRes.data ?? [], requestSessionIds),
    providerAuth: providerAuthMap(providerAuthRes.data),
    mcp: mcpStatusMap(mcpRes.data),
    mcpResources: mcpResourceMap(resourceRes.data),
    lsp: lspStatuses(lspRes.data ?? [], dir),
    formatter: formatterStatuses(formatterRes.data),
    commands: commandArr(commandRes.data),
  }
}

type SessionTree = {
  sessions: SessionInfo[]
  navSessions: SessionInfo[]
  relatedSessionIds: string[]
  requestSessionIds: string[]
}

async function sessionTree(sdk: Client, dir: string, session: SessionInfo): Promise<SessionTree> {
  if (session.parentID) {
    const [parent, siblings] = await Promise.all([
      sdk.session.get({
        sessionID: session.parentID,
        directory: dir,
      }),
      loadChildren(sdk, dir, session.parentID),
    ])

    const descendants = await loadTree(sdk, dir, session.id)

    const parentSession = parent.data
    const navSessions = parentSession ? [parentSession, ...siblings] : [session, ...siblings]
    const sessions = [session, ...descendants]

    return {
      sessions,
      navSessions,
      relatedSessionIds: subtreeSessionIds(session.id, sessions),
      requestSessionIds: [session.id],
    }
  }

  const sessions = [session, ...await loadTree(sdk, dir, session.id)]
  return {
    navSessions: sessions.filter((item) => item.id === session.id || item.parentID === session.id),
    sessions,
    relatedSessionIds: subtreeSessionIds(session.id, sessions),
    requestSessionIds: subtreeSessionIds(session.id, sessions),
  }
}

async function loadTree(sdk: Client, dir: string, rootID: string) {
  const out: SessionInfo[] = []
  const queue = [rootID]

  while (queue.length > 0) {
    const parentID = queue.shift()
    if (!parentID) {
      continue
    }

    const children = await loadChildren(sdk, dir, parentID)
    for (const child of children) {
      if (child.time.archived || out.some((item) => item.id === child.id)) {
        continue
      }
      out.push(child)
      queue.push(child.id)
    }
  }

  return out
}

async function loadChildren(sdk: Client, dir: string, sessionID: string) {
  const res = await sdk.session.children({
    sessionID,
    directory: dir,
  })

  return (res.data ?? []).filter((item) => !item.time.archived)
}

export function patch(payload: Omit<SessionSnapshot, "message">): SessionSnapshot {
  return {
    ...payload,
    message: summarizeSessionSnapshot(payload),
  }
}

export function sortDiff(diff: FileDiff[]) {
  return [...diff].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
}

async function relatedMessages(
  sdk: Client,
  dir: string,
  rootSessionID: string,
  relatedSessionIds: string[],
  rootMessages: SessionMessage[],
  limit: number,
): Promise<[SessionMessage[], Record<string, SessionMessage[]>, boolean]> {
  const children = relatedSessionIds.filter((item) => item !== rootSessionID)
  if (children.length === 0) {
    return [sortMessages(rootMessages), {}, false]
  }

  const results = await Promise.all(children.map(async (sessionID) => ({
    sessionID,
    data: await sdk.session.messages({
      sessionID,
      directory: dir,
      limit,
    }),
  })))

  const childMessages: Record<string, SessionMessage[]> = {}
  let hasEarlier = false
  for (const item of results) {
    hasEarlier = hasEarlier || (item.data.data?.length ?? 0) >= limit
    childMessages[item.sessionID] = sortMessages(item.data.data ?? [])
  }

  return [sortMessages(rootMessages), childMessages, hasEarlier]
}

function fallbackSnapshot(
  ref: SessionPanelRef,
  workspaceName: string,
  status: SessionSnapshot["status"],
  message: string,
  submitting: boolean,
): SessionSnapshot {
  const display = getDisplaySettings()
  return {
    status,
    display,
    sessionRef: ref,
    workspaceName,
    message,
    skillCatalog: [],
    messageHistory: {
      limit: DEFAULT_SESSION_MESSAGE_LIMIT,
      hasEarlier: false,
    },
    messages: [],
    childMessages: {},
    childSessions: {},
    submitting,
    todos: [],
    diff: [],
    permissions: [],
    questions: [],
    agents: [],
    defaultAgent: undefined,
    providers: [],
    providerAuth: {},
    providerDefault: undefined,
    configuredModel: undefined,
    mcp: {},
    mcpResources: {},
    lsp: [],
    formatter: [],
    commands: [],
    relatedSessionIds: [ref.sessionId],
    agentMode: "build",
    navigation: {},
  }
}

function configProviderList(data?: { providers?: ProviderInfo[] }) {
  return Array.isArray(data?.providers) ? data.providers : []
}

function legacyProviderList(data?: { all?: ProviderInfo[] }) {
  return Array.isArray(data?.all) ? data.all : []
}

function providerSnapshot(configData?: { providers?: ProviderInfo[] }, legacyData?: { all?: ProviderInfo[] }) {
  const providers = configProviderList(configData)
  if (providers.length > 0) {
    return providers
  }

  return legacyProviderList(legacyData)
}

function providerDefaults(configData?: { default?: Record<string, string> }, legacyData?: { default?: Record<string, string> }) {
  return configData?.default ?? legacyData?.default
}

function providerAuthMap(data?: Record<string, ProviderAuthMethod[]>) {
  if (!data || typeof data !== "object") {
    return {}
  }

  return Object.fromEntries(
    Object.entries(data).map(([providerID, methods]) => [providerID, Array.isArray(methods) ? methods : []]),
  )
}

function formatterStatuses(data?: FormatterStatus[]) {
  return Array.isArray(data) ? data : []
}

function fallbackModelRef(providers: ProviderInfo[], defaults?: Record<string, string>) {
  for (const provider of providers) {
    const modelID = defaults?.[provider.id]?.trim()
    if (modelID && provider.models?.[modelID]) {
      return {
        providerID: provider.id,
        modelID,
      }
    }
  }

  for (const provider of providers) {
    const model = provider.models ? Object.values(provider.models)[0] : undefined
    if (model?.id) {
      return {
        providerID: provider.id,
        modelID: model.id,
      }
    }
  }
}

function agentList(data?: AgentInfo[]) {
  return Array.isArray(data) ? data : []
}

function defaultAgentName(data?: AgentInfo[]) {
  return agentList(data)[0]?.name
}

async function configInfo(sdk: Client, directory: string) {
  const config = readSdkMember(sdk, "config")
  const get = readSdkMethod(config, "get")
  if (!get) {
    return { data: undefined as { model?: string } | undefined }
  }

  return get({ directory }) as Promise<{ data?: { model?: string } }>
}

async function configProviders(sdk: Client, directory: string) {
  const config = readSdkMember(sdk, "config")
  const providers = readSdkMethod(config, "providers")
  if (!providers) {
    return { data: undefined as { providers?: ProviderInfo[]; default?: Record<string, string> } | undefined }
  }

  return providers({ directory }) as Promise<{ data?: { providers?: ProviderInfo[]; default?: Record<string, string> } }>
}

async function agentInfo(sdk: Client, directory: string) {
  const app = readSdkMember(sdk, "app")
  const agents = readSdkMethod(app, "agents")
  if (!agents) {
    return { data: undefined as AgentInfo[] | undefined }
  }

  return agents({ directory }) as Promise<{ data?: AgentInfo[] }>
}

async function experimentalResources(sdk: Client, directory: string) {
  const experimental = readSdkMember(sdk, "experimental")
  const resource = readSdkMember(experimental ?? {}, "resource")
  const list = readSdkMethod(resource, "list")
  if (!list) {
    return { data: undefined as Record<string, McpResource> | undefined }
  }

  return list({ directory }) as Promise<{ data?: Record<string, McpResource> }>
}

async function commandList(sdk: Client, directory: string) {
  const command = readSdkMember(sdk, "command")
  const list = readSdkMethod(command, "list")
  if (!list) {
    return { data: undefined as CommandInfo[] | undefined }
  }

  return list({ directory }) as Promise<{ data?: CommandInfo[] }>
}

function commandArr(data?: CommandInfo[]) {
  return Array.isArray(data) ? data : []
}

function readSdkMember(target: object, key: string) {
  const value = Reflect.get(target, key)
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined
}

function readSdkMethod(target: Record<string, unknown> | undefined, key: string) {
  const value = target ? Reflect.get(target, key) : undefined
  return typeof value === "function"
    ? ((input: { directory: string }) => Reflect.apply(value, target, [input])) as (input: { directory: string }) => Promise<unknown>
    : undefined
}

function modelLabel(model?: { providerID: string; modelID: string }) {
  return model ? `${model.providerID}/${model.modelID}` : "-"
}

function mcpStatusMap(data?: Record<string, McpStatus>) {
  return data && typeof data === "object" ? data : {}
}

function mcpResourceMap(data?: Record<string, McpResource>) {
  return data && typeof data === "object" ? data : {}
}

function lspStatuses(items: LspStatus[], workspaceDir: string) {
  return items.map((item) => ({
    ...item,
    root: relativeLspRoot(item.root, workspaceDir),
  }))
}

function relativeLspRoot(root: string, workspaceDir: string) {
  if (!root) {
    return "."
  }

  const relative = path.relative(workspaceDir, root)
  if (!relative || relative === ".") {
    return "."
  }

  return relative
}

function agentMode(messages: SessionMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const mode = messageAgentMode(messages[i])
    if (mode) {
      return mode
    }
  }

  return "build" as const
}

function messageAgentMode(message: SessionMessage) {
  for (let i = message.parts.length - 1; i >= 0; i -= 1) {
    const mode = partAgentMode(message.parts[i])
    if (mode) {
      return mode
    }
  }
}

function partAgentMode(part: SessionMessage["parts"][number]) {
  if (part.type !== "tool" || part.state.status !== "completed") {
    return undefined
  }
  if (part.tool === "plan_enter") {
    return "plan" as const
  }
  if (part.tool === "plan_exit") {
    return "build" as const
  }
  return undefined
}

function parseModelRef(model?: string) {
  if (!model) {
    return undefined
  }

  const [providerID, ...rest] = model.split("/")
  const modelID = rest.join("/").trim()
  if (!providerID?.trim() || !modelID) {
    return undefined
  }

  return {
    providerID: providerID.trim(),
    modelID,
  }
}
