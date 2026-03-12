import * as path from "node:path"
import type { SessionPanelRef, SessionSnapshot } from "../../bridge/types"
import type { AgentInfo, Client, CommandInfo, FileDiff, LspStatus, McpResource, McpStatus, ProviderInfo, SessionInfo, SessionMessage } from "../../core/sdk"
import { WorkspaceManager } from "../../core/workspace"
import { filterPermission, filterQuestion, nav, relatedSessionMap, subtreeSessionIds } from "./navigation"
import { sortMessages } from "./mutations"
import { idle, text } from "./utils"

type SnapshotContext = {
  ref: SessionPanelRef
  mgr: WorkspaceManager
  log: (message: string) => void
  isSubmitting: () => boolean
}

export async function buildSessionSnapshot({ ref, mgr, log, isSubmitting }: SnapshotContext): Promise<SessionSnapshot> {
  const rt = mgr.get(ref.dir)
  const workspaceName = rt?.name || path.basename(ref.dir)

  if (!rt) {
    return fallbackSnapshot(ref, workspaceName, "error", "Workspace runtime is unavailable for this folder.", isSubmitting())
  }

  if (rt.state === "starting" || rt.state === "stopping" || !rt.sdk) {
    return fallbackSnapshot(
      ref,
      workspaceName,
      "loading",
      rt.state === "stopping" ? "Workspace runtime is stopping." : "Workspace runtime is starting.",
      isSubmitting(),
    )
  }

  if (rt.state !== "ready") {
    return fallbackSnapshot(ref, workspaceName, "error", rt.err || "Workspace runtime is not ready.", isSubmitting())
  }

  try {
    const [sessionRes, rootMessageRes, statusRes, todoRes, diffRes, permissionRes, questionRes, configRes, configProvidersRes, agentRes, providerRes, mcpRes, resourceRes, lspRes, commandRes] = await Promise.all([
      rt.sdk.session.get({
        sessionID: ref.sessionId,
        directory: rt.dir,
      }),
      rt.sdk.session.messages({
        sessionID: ref.sessionId,
        directory: rt.dir,
        limit: 200,
      }),
      rt.sdk.session.status({
        directory: rt.dir,
      }),
      rt.sdk.session.todo({
        sessionID: ref.sessionId,
        directory: rt.dir,
      }),
      rt.sdk.session.diff({
        sessionID: ref.sessionId,
        directory: rt.dir,
      }),
      rt.sdk.permission.list({
        directory: rt.dir,
      }),
      rt.sdk.question.list({
        directory: rt.dir,
      }),
      configInfo(rt.sdk, rt.dir),
      configProviders(rt.sdk, rt.dir),
      agentInfo(rt.sdk, rt.dir),
      rt.sdk.provider.list({
        directory: rt.dir,
      }),
      rt.sdk.mcp.status({
        directory: rt.dir,
      }),
      experimentalResources(rt.sdk, rt.dir),
      rt.sdk.lsp.status({
        directory: rt.dir,
      }),
      commandList(rt.sdk, rt.dir),
    ])

    const session = sessionRes.data

    if (!session) {
      return fallbackSnapshot(ref, workspaceName, "error", "Session metadata was not found for this workspace.", isSubmitting())
    }

    rt.sessions.set(session.id, session)
    const tree = await sessionTree(rt.sdk, rt.dir, session)
    const [messages, childMessages] = await relatedMessages(rt.sdk, rt.dir, session.id, tree.relatedSessionIds, rootMessageRes.data ?? [])
    const childSessions = relatedSessionMap(tree.sessions, session.id, tree.relatedSessionIds)
    const navigation = nav(session, tree.navSessions)
    const agents = agentList(agentRes.data)
    const defaultAgent = defaultAgentName(agentRes.data)
    const providers = providerSnapshot(configProvidersRes.data, providerRes.data)
    const defaults = providerDefaults(configProvidersRes.data, providerRes.data)
    const configuredModel = parseModelRef(configRes.data?.model)
    const firstAgent = agents[0]
    const freshModel = firstAgent?.model || (agents.length === 0 ? configuredModel || fallbackModelRef(providers, defaults) : undefined)

    log(
      [
        `agent count=${agents.length}`,
        `first=${firstAgent?.name || "-"}`,
        `firstModel=${modelLabel(firstAgent?.model)}`,
        `defaultAgent=${defaultAgent || "-"}`,
        `freshModel=${modelLabel(freshModel)}`,
        `agentSource=${agents.length > 0 ? "agent" : "fallback"}`,
      ].join(" "),
    )

    return patch({
      status: "ready",
      sessionRef: ref,
      workspaceName,
      session,
      sessionStatus: statusRes.data?.[ref.sessionId] ?? idle(),
      messages,
      childMessages,
      childSessions,
      submitting: isSubmitting(),
      todos: todoRes.data ?? [],
      diff: sortDiff(diffRes.data ?? []),
      permissions: filterPermission(permissionRes.data ?? [], tree.requestSessionIds),
      questions: filterQuestion(questionRes.data ?? [], tree.requestSessionIds),
      agents,
      defaultAgent,
      providers,
      providerDefault: defaults,
      configuredModel,
      mcp: mcpStatusMap(mcpRes.data),
      mcpResources: mcpResourceMap(resourceRes.data),
      lsp: lspStatuses(lspRes.data ?? [], rt.dir),
      commands: commandArr(commandRes.data),
      relatedSessionIds: tree.relatedSessionIds,
      agentMode: agentMode(messages),
      navigation,
    })
  } catch (err) {
    log(`snapshot failed: ${text(err)}`)
    return fallbackSnapshot(ref, workspaceName, "error", text(err), isSubmitting())
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

    const parentSession = parent.data
    const navSessions = parentSession ? [parentSession, ...siblings] : [session, ...siblings]

    return {
      sessions: navSessions,
      navSessions,
      relatedSessionIds: [session.id],
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
    message: summary(payload),
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
): Promise<[SessionMessage[], Record<string, SessionMessage[]>]> {
  const children = relatedSessionIds.filter((item) => item !== rootSessionID)
  if (children.length === 0) {
    return [sortMessages(rootMessages), {}]
  }

  const results = await Promise.all(children.map(async (sessionID) => ({
    sessionID,
    data: await sdk.session.messages({
      sessionID,
      directory: dir,
      limit: 200,
    }),
  })))

  const childMessages: Record<string, SessionMessage[]> = {}
  for (const item of results) {
    childMessages[item.sessionID] = sortMessages(item.data.data ?? [])
  }

  return [sortMessages(rootMessages), childMessages]
}

function fallbackSnapshot(
  ref: SessionPanelRef,
  workspaceName: string,
  status: SessionSnapshot["status"],
  message: string,
  submitting: boolean,
): SessionSnapshot {
  return {
    status,
    sessionRef: ref,
    workspaceName,
    message,
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
    providerDefault: undefined,
    configuredModel: undefined,
    mcp: {},
    mcpResources: {},
    lsp: [],
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

function summary(payload: Omit<SessionSnapshot, "message">) {
  if (payload.permissions.length > 0) {
    return "Session is waiting for a permission decision."
  }

  if (payload.questions.length > 0) {
    return "Session is waiting for your answer."
  }

  if (payload.submitting) {
    return "Sending message to workspace runtime."
  }

  const status = payload.sessionStatus ?? idle()
  if (status.type === "busy") {
    return `Session is responding. ${payload.messages.length} messages loaded.`
  }

  if (status.type === "retry") {
    return `Session is retrying. ${payload.messages.length} messages loaded.`
  }

  if (payload.messages.length === 0) {
    return "Session is ready. Send the first message to start the conversation."
  }

  if (payload.todos.length > 0) {
    return `Session is ready. ${payload.todos.length} todo items are being tracked.`
  }

  return `Session is ready. ${payload.messages.length} messages loaded.`
}
