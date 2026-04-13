import type { AgentInfo, CommandInfo, McpResource } from "../../core/sdk"
import type { ComposerParityFixture } from "./composer-parity"

const agents: AgentInfo[] = [
  { name: "helper", mode: "subagent", model: { providerID: "openai", modelID: "gpt-4.1" } },
  { name: "build", mode: "all", model: { providerID: "openai", modelID: "gpt-4.1" } },
]

const resources: Record<string, McpResource> = {
  docs: {
    name: "docs",
    uri: "mcp://docs/reference",
    description: "Reference docs",
    mimeType: "text/markdown",
    client: "reference",
  },
}

const files = {
  selected: {
    path: "src/panel/webview/app/App.tsx",
    kind: "file" as const,
    source: "selection" as const,
    selection: { startLine: 12, endLine: 20 },
  },
  recent: [
    "README.md",
    "src/panel/webview/app/App.tsx",
  ],
  workspace: [
    "README.md",
    "src/panel/webview/app/App.tsx",
    "src/panel/webview/app/composer-editor.ts",
    "src/panel/webview/hooks/useComposerAutocomplete.ts",
    "src/panel/provider/files.ts",
  ],
}

const searchOnlyFiles = {
  recent: ["README.md"],
  workspace: files.workspace,
}

const commands: CommandInfo[] = [
  { name: "review", description: "review changes [commit|branch|pr]", source: "command", hints: [] },
  { name: "init", description: "create/update AGENTS.md", source: "command", hints: [] },
  { name: "debug", description: "debug current issue", source: "mcp", hints: [] },
  { name: "summarize", description: "summarize session", source: "skill", hints: [] },
]

export const composerParityFixtures: ComposerParityFixture[] = [
  {
    name: "slash actions include compact and sort alphabetically",
    draft: "/",
    cursor: 1,
    expected: {
      trigger: "slash",
      query: "",
      items: [
        {
          id: "slash-compact",
          kind: "action",
          label: "compact",
          detail: "Summarize this session immediately using the current model.",
        },
        {
          id: "slash-model",
          kind: "action",
          label: "model",
          detail: "Open the model picker for the current agent.",
        },
        {
          id: "slash-new",
          kind: "action",
          label: "new",
          detail: "Start a new session in this workspace.",
        },
        {
          id: "slash-refresh",
          kind: "action",
          label: "refresh",
          detail: "Ask the host to reload the current session snapshot.",
        },
        {
          id: "slash-undo",
          kind: "action",
          label: "undo",
          detail: "Revert the previous user turn immediately.",
        },
      ],
      accepted: {
        action: "slash-compact",
      },
    },
    acceptIndex: 0,
  },
  {
    name: "slash actions filter and order",
    draft: "/re",
    cursor: 3,
    composerAgentOverride: "helper",
    expected: {
      trigger: "slash",
      query: "re",
      items: [
        {
          id: "slash-refresh",
          kind: "action",
          label: "refresh",
          detail: "Ask the host to reload the current session snapshot.",
        },
        {
          id: "slash-reset-agent",
          kind: "action",
          label: "reset-agent",
          detail: "Return the composer to the default agent selection.",
        },
        {
          id: "slash-undo",
          kind: "action",
          label: "undo",
          detail: "Revert the previous user turn immediately.",
        },
        {
          id: "slash-new",
          kind: "action",
          label: "new",
          detail: "Start a new session in this workspace.",
        },
        {
          id: "slash-compact",
          kind: "action",
          label: "compact",
          detail: "Summarize this session immediately using the current model.",
        },
        {
          id: "slash-model",
          kind: "action",
          label: "model",
          detail: "Open the model picker for the current agent.",
        },
      ],
      accepted: {
        action: "slash-refresh",
      },
    },
    acceptIndex: 0,
  },
  {
    name: "slash redo appears when session has revert state",
    draft: "/red",
    cursor: 4,
    session: {
      revert: { messageID: "msg-1" },
    },
    expected: {
      trigger: "slash",
      query: "red",
      items: [
        {
          id: "slash-redo",
          kind: "action",
          label: "redo",
          detail: "Restore previously reverted messages immediately.",
        },
        {
          id: "slash-refresh",
          kind: "action",
          label: "refresh",
          detail: "Ask the host to reload the current session snapshot.",
        },
        {
          id: "slash-compact",
          kind: "action",
          label: "compact",
          detail: "Summarize this session immediately using the current model.",
        },
        {
          id: "slash-undo",
          kind: "action",
          label: "undo",
          detail: "Revert the previous user turn immediately.",
        },
      ],
      accepted: {
        action: "slash-redo",
      },
    },
    acceptIndex: 0,
  },
  {
    name: "mention empty query mixes agent resource selection and recents",
    draft: "@",
    cursor: 1,
    agents,
    mcpResources: resources,
    files,
    expected: {
      trigger: "mention",
      query: "",
      items: [
        { id: "agent:helper", kind: "agent", label: "@helper", detail: "" },
        { id: "agent:build", kind: "agent", label: "@build", detail: "" },
        { id: "selection:file:src/panel/webview/app/App.tsx:12:20", kind: "selection", label: "@src/panel/webview/app/App.tsx#12-20", detail: "src/panel/webview/app/App.tsx#12-20" },
        { id: "recent:file:README.md::", kind: "recent", label: "@README.md", detail: "README.md" },
        { id: "resource:reference:mcp://docs/reference", kind: "resource", label: "@docs", detail: "docs (mcp://docs/reference)" },
      ],
    },
  },
  {
    name: "mention recent directory preserves directory kind",
    draft: "@panel/we",
    cursor: 9,
    files: {
      recent: ["src/panel/webview/"],
      workspace: [],
    },
    expected: {
      trigger: "mention",
      query: "panel/we",
      items: [
        { id: "recent:directory:src/panel/webview/::", kind: "recent", label: "@src/panel/webview/", detail: "src/panel/webview/" },
      ],
      accepted: {
        draft: "@src/panel/webview/ ",
        submitParts: [
          { type: "text", text: "@src/panel/webview/ " },
          {
            type: "file",
            path: "src/panel/webview/",
            kind: "directory",
            selection: undefined,
            source: {
              value: "@src/panel/webview/",
              start: 0,
              end: 19,
            },
          },
        ],
      },
    },
    acceptIndex: 0,
  },
  {
    name: "mention directory query returns directory result",
    draft: "@panel/we",
    cursor: 9,
    files,
    expected: {
      trigger: "mention",
      query: "panel/we",
      items: [
        { id: "search:directory:src/panel/webview/::", kind: "directory", label: "@src/panel/webview/", detail: "src/panel/webview/" },
        { id: "search:directory:src/panel/webview/app/::", kind: "directory", label: "@src/panel/webview/app/", detail: "src/panel/webview/app/" },
        { id: "search:directory:src/panel/webview/hooks/::", kind: "directory", label: "@src/panel/webview/hooks/", detail: "src/panel/webview/hooks/" },
        { id: "selection:file:src/panel/webview/app/App.tsx:12:20", kind: "selection", label: "@src/panel/webview/app/App.tsx#12-20", detail: "src/panel/webview/app/App.tsx#12-20" },
        { id: "search:file:src/panel/webview/app/composer-editor.ts::", kind: "file", label: "@src/panel/webview/app/composer-editor.ts", detail: "src/panel/webview/app/composer-editor.ts" },
        { id: "search:file:src/panel/webview/hooks/useComposerAutocomplete.ts::", kind: "file", label: "@src/panel/webview/hooks/useComposerAutocomplete.ts", detail: "src/panel/webview/hooks/useComposerAutocomplete.ts" },
      ],
      accepted: {
        draft: "@src/panel/webview/ ",
        submitParts: [
          { type: "text", text: "@src/panel/webview/ " },
          {
            type: "file",
            path: "src/panel/webview/",
            kind: "directory",
            selection: undefined,
            source: {
              value: "@src/panel/webview/",
              start: 0,
              end: 19,
            },
          },
        ],
      },
    },
    acceptIndex: 0,
  },
  {
    name: "mention search mixes files and directories by shared path ranking",
    draft: "@web",
    cursor: 4,
    files: {
      workspace: [
        "src/web.ts",
        "src/panel/webview/app.tsx",
      ],
    },
    expected: {
      trigger: "mention",
      query: "web",
      items: [
        { id: "search:file:src/web.ts::", kind: "file", label: "@src/web.ts", detail: "src/web.ts" },
        { id: "search:directory:src/panel/webview/::", kind: "directory", label: "@src/panel/webview/", detail: "src/panel/webview/" },
        { id: "search:file:src/panel/webview/app.tsx::", kind: "file", label: "@src/panel/webview/app.tsx", detail: "src/panel/webview/app.tsx" },
      ],
    },
  },
  {
    name: "mention file range query preserves selected lines in submit parts",
    draft: "open @src/panel/webview/app/App.tsx#12-20",
    cursor: 41,
    files: searchOnlyFiles,
    expected: {
      trigger: "mention",
      query: "src/panel/webview/app/App.tsx#12-20",
      items: [
        {
          id: "search:file:src/panel/webview/app/App.tsx::",
          kind: "file",
          label: "@src/panel/webview/app/App.tsx#12-20",
          detail: "src/panel/webview/app/App.tsx#12-20",
        },
      ],
      accepted: {
        draft: "open @src/panel/webview/app/App.tsx#12-20 ",
        submitParts: [
          { type: "text", text: "open @src/panel/webview/app/App.tsx#12-20 " },
          {
            type: "file",
            path: "src/panel/webview/app/App.tsx",
            kind: "file",
            selection: { startLine: 12, endLine: 20 },
            source: {
              value: "@src/panel/webview/app/App.tsx#12-20",
              start: 5,
              end: 41,
            },
          },
        ],
      },
    },
    acceptIndex: 0,
  },
  {
    name: "slash server commands appear in alphabetical order when no query",
    draft: "/",
    cursor: 1,
    commands,
    expected: {
      trigger: "slash",
      query: "",
      items: [
        { id: "slash-compact", kind: "action", label: "compact", detail: "Summarize this session immediately using the current model." },
        { id: "command:debug", kind: "command", label: "debug", detail: "debug current issue :mcp" },
        { id: "command:init", kind: "command", label: "init", detail: "create/update AGENTS.md" },
        { id: "slash-model", kind: "action", label: "model", detail: "Open the model picker for the current agent." },
        { id: "slash-new", kind: "action", label: "new", detail: "Start a new session in this workspace." },
        { id: "slash-refresh", kind: "action", label: "refresh", detail: "Ask the host to reload the current session snapshot." },
        { id: "command:review", kind: "command", label: "review", detail: "review changes [commit|branch|pr]" },
        { id: "slash-undo", kind: "action", label: "undo", detail: "Revert the previous user turn immediately." },
        // summarize (skill) must be absent
      ],
    },
  },
  {
    name: "slash server commands prefix match ranks before fuzzy detail match",
    draft: "/re",
    cursor: 3,
    commands,
    expected: {
      trigger: "slash",
      query: "re",
      items: [
        // review and refresh both start with "re" → prefix boost, sorted by label alpha
        { id: "command:review", kind: "command", label: "review", detail: "review changes [commit|branch|pr]" },
        { id: "slash-refresh", kind: "action", label: "refresh", detail: "Ask the host to reload the current session snapshot." },
        // undo, init, compact and debug matched via secondary fields, ranked after
        { id: "slash-undo", kind: "action", label: "undo", detail: "Revert the previous user turn immediately." },
        { id: "command:init", kind: "command", label: "init", detail: "create/update AGENTS.md" },
        { id: "slash-new", kind: "action", label: "new", detail: "Start a new session in this workspace." },
        { id: "slash-compact", kind: "action", label: "compact", detail: "Summarize this session immediately using the current model." },
        { id: "command:debug", kind: "command", label: "debug", detail: "debug current issue :mcp" },
        { id: "slash-model", kind: "action", label: "model", detail: "Open the model picker for the current agent." },
      ],
    },
  },
  {
    name: "slash server command accept replaces draft with slash name and space",
    draft: "/debug",
    cursor: 6,
    commands,
    acceptIndex: 0,
    expected: {
      trigger: "slash",
      query: "debug",
      items: [
        { id: "command:debug", kind: "command", label: "debug", detail: "debug current issue :mcp" },
      ],
      accepted: {
        draft: "/debug ",
      },
    },
  },
  {
    name: "slash skill commands are excluded from autocomplete",
    draft: "/summarize",
    cursor: 10,
    commands,
    expected: {
      trigger: "slash",
      query: "summarize",
      items: [
        { id: "slash-compact", kind: "action", label: "compact", detail: "Summarize this session immediately using the current model." },
      ],
      // summarize has source=skill so it must never appear as a command item; /compact still matches via its summarize keyword
    },
  },
]
