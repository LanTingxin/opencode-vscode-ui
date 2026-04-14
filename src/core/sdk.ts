import type {
  File as OfficialWorkspaceFileStatus,
  FormatterStatus as OfficialFormatterStatus,
  OpencodeClient as OfficialOpencodeClient,
  ProviderAuthAuthorization as OfficialProviderAuthAuthorization,
  ProviderAuthMethod as OfficialProviderAuthMethod,
  Session as OfficialSessionInfo,
  SessionStatus as OfficialSessionStatus,
  VcsInfo as OfficialVcsInfo,
} from "@opencode-ai/sdk/v2/client" with { "resolution-mode": "import" }

export type SessionInfo = Omit<OfficialSessionInfo, "slug" | "projectID" | "version"> & {
  slug?: OfficialSessionInfo["slug"]
  projectID?: OfficialSessionInfo["projectID"]
  version?: OfficialSessionInfo["version"]
}

export type SessionStatus = OfficialSessionStatus

export type PermissionReply = "once" | "always" | "reject"

export type PermissionRequest = {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata: Record<string, unknown>
  always: string[]
  tool?: {
    messageID: string
    callID: string
  }
}

export type QuestionOption = {
  label: string
  description: string
}

export type QuestionInfo = {
  question: string
  header: string
  options: QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export type QuestionRequest = {
  id: string
  sessionID: string
  questions: QuestionInfo[]
  tool?: {
    messageID: string
    callID: string
  }
}

export type Todo = {
  content: string
  status: string
  priority: string
}

export type FileDiff = {
  file: string
  patch: string
  additions: number
  deletions: number
  status?: "added" | "deleted" | "modified"
}

export type ProviderModel = {
  id: string
  name?: string
  variants?: Record<string, Record<string, unknown>>
  limit?: {
    context?: number
  }
}

export type ProviderInfo = {
  id: string
  name?: string
  models?: Record<string, ProviderModel>
}

export type ProviderAuthMethod = OfficialProviderAuthMethod

export type ProviderAuthAuthorization = OfficialProviderAuthAuthorization

export type VcsInfo = OfficialVcsInfo

export type WorkspaceFileStatus = OfficialWorkspaceFileStatus

export type FormatterStatus = OfficialFormatterStatus

export type ProviderList = {
  all?: ProviderInfo[]
  connected?: string[]
  default?: Record<string, string>
}

export type AgentInfo = {
  name: string
  mode: "subagent" | "primary" | "all"
  hidden?: boolean
  model?: {
    providerID: string
    modelID: string
  }
  variant?: string
}

export type ConfigInfo = {
  model?: string
  default_agent?: string
}

export type McpStatus =
  | { status: "connected" }
  | { status: "disabled" }
  | { status: "failed"; error?: string }
  | { status: "needs_auth"; error?: string }
  | { status: "needs_client_registration"; error?: string }

export type McpResource = {
  name: string
  uri: string
  description?: string
  mimeType?: string
  client: string
}

export type LspStatus = {
  id: string
  name: string
  root: string
  status: "connected" | "error"
}

export type CommandInfo = {
  name: string
  description?: string
  agent?: string
  model?: string
  source?: "command" | "mcp" | "skill"
  hints: string[]
}

export type MessageInfo = {
  id: string
  sessionID: string
  role: "user" | "assistant"
  time: {
    created: number
    completed?: number
  }
  agent?: string
  cost?: number
  tokens?: {
    input: number
    output: number
    reasoning: number
    cache: {
      read: number
      write: number
    }
  }
  model?: {
    providerID: string
    modelID: string
  }
  variant?: string
}

export type PromptSource = {
  value: string
  start: number
  end: number
}

export type PromptTextPartInput = {
  type: "text"
  text: string
}

export type PromptAgentPartInput = {
  type: "agent"
  name: string
  source?: PromptSource
}

export type PromptFilePartInput = {
  type: "file"
  mime: string
  filename?: string
  url: string
  source?: {
    type: "file"
    path: string
    text: PromptSource
  } | {
    type: "resource"
    uri: string
    clientName: string
    text: PromptSource
  }
}

export type PromptPartInput = PromptTextPartInput | PromptAgentPartInput | PromptFilePartInput

export type TextPart = {
  id: string
  sessionID: string
  messageID: string
  type: "text"
  text: string
  synthetic?: boolean
  ignored?: boolean
}

export type ReasoningPart = {
  id: string
  sessionID: string
  messageID: string
  type: "reasoning"
  text: string
}

export type FilePart = {
  id: string
  sessionID: string
  messageID: string
  type: "file"
  mime: string
  filename?: string
  url: string
  source?: {
    type: "file"
    path: string
    text: PromptSource
  } | {
    type: "resource"
    uri: string
    clientName: string
    text: PromptSource
  } | {
    type: "symbol"
    path: string
    name: string
    kind: number
    range: unknown
    text: PromptSource
  }
}

export type ToolPart = {
  id: string
  sessionID: string
  messageID: string
  callID?: string
  type: "tool"
  tool: string
  state: {
    status: "pending" | "running" | "completed" | "error"
    title?: string
    input?: Record<string, unknown>
    output?: string
    error?: string
    metadata?: Record<string, unknown>
  }
}

export type SimplePart = {
  id: string
  sessionID: string
  messageID: string
  type: "step-start" | "step-finish" | "snapshot" | "patch" | "agent" | "retry" | "compaction" | "subtask"
  [key: string]: unknown
}

export type MessagePart = TextPart | ReasoningPart | FilePart | ToolPart | SimplePart

export type SessionMessage = {
  info: MessageInfo
  parts: MessagePart[]
}

export type SessionEvent =
  | {
      type: "server.instance.disposed"
      properties?: {
        workspaceID?: string
      }
    }
  | {
      type: "session.status"
      properties: {
        sessionID: string
        status: SessionStatus
      }
    }
  | {
      type: "session.updated" | "session.created"
      properties: {
        info: SessionInfo
      }
    }
  | {
      type: "session.deleted"
      properties: {
        info: SessionInfo
      }
    }
  | {
      type: "session.diff"
      properties: {
        sessionID: string
        diff: FileDiff[]
      }
    }
  | {
      type: "message.updated"
      properties: {
        info: MessageInfo
      }
    }
  | {
      type: "message.removed"
      properties: {
        sessionID: string
        messageID: string
      }
    }
  | {
      type: "message.part.updated"
      properties: {
        part: MessagePart
      }
    }
  | {
      type: "message.part.removed"
      properties: {
        messageID: string
        partID: string
      }
    }
  | {
      type: "message.part.delta"
      properties: {
        sessionID: string
        messageID: string
        partID: string
        field: string
        delta: string
      }
    }
  | {
      type: "permission.asked"
      properties: PermissionRequest
    }
  | {
      type: "permission.replied"
      properties: {
        sessionID: string
        requestID: string
        reply: PermissionReply
      }
    }
  | {
      type: "question.asked"
      properties: QuestionRequest
    }
  | {
      type: "question.replied"
      properties: {
        sessionID: string
        requestID: string
        answers: string[][]
      }
    }
  | {
      type: "question.rejected"
      properties: {
        sessionID: string
        requestID: string
      }
    }
  | {
      type: "todo.updated"
      properties: {
        sessionID: string
        todos: Todo[]
      }
    }
  | {
      type: string
      properties?: unknown
    }

type AdaptedFind = Omit<OfficialOpencodeClient["find"], "files"> & {
  files(input: {
    query: string
    directory?: string
    workspace?: string
    dirs?: boolean
    type?: "file" | "directory"
    limit?: number
  }): Promise<{ data?: string[] }>
}

type AdaptedEvent = Omit<OfficialOpencodeClient["event"], "subscribe"> & {
  subscribe(input?: {
    directory?: string
    workspace?: string
  }, options?: {
    signal?: AbortSignal
    onSseError?: (error: unknown) => void
  }): Promise<{
    stream: AsyncIterable<SessionEvent>
  }>
}

export type Client = Omit<OfficialOpencodeClient, "find" | "event"> & {
  find: AdaptedFind
  event: AdaptedEvent
}

export function createClientAdapter(client: OfficialOpencodeClient): Client {
  const adapted = Object.create(client) as Client

  if (client.find) {
    Object.defineProperty(adapted, "find", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: {
        ...client.find,
        files(input: {
          directory?: string
          query: string
          dirs?: boolean
        }) {
          return client.find.files({
            ...input,
            dirs: input.dirs === undefined ? undefined : input.dirs ? "true" : "false",
          }) as Promise<{ data?: string[] }>
        },
      },
    })
  }

  if (client.event) {
    Object.defineProperty(adapted, "event", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: {
        ...client.event,
        async subscribe(input?: {
          directory?: string
          workspace?: string
        }, options?: {
          signal?: AbortSignal
          onSseError?: (error: unknown) => void
        }) {
          const result = await client.event.subscribe(input, options)
          const stream = "stream" in result ? result.stream : result
          return { stream: stream as AsyncIterable<SessionEvent> }
        },
      },
    })
  }

  return adapted
}

export async function client(url: string, dir: string): Promise<Client> {
  const mod = await import("@opencode-ai/sdk/v2/client")
  return createClientAdapter(mod.createOpencodeClient({
    baseUrl: url,
    directory: dir,
    throwOnError: true,
  }))
}
