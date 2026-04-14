import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { runComposerIntegration } from "./composer-integration"

const serverCommands = [
  { name: "review", description: "review changes [commit|branch|pr]", source: "command" as const, hints: [] },
  { name: "init", description: "create/update AGENTS.md", source: "command" as const, hints: [] },
  { name: "debug", description: "debug current issue", source: "mcp" as const, hints: [] },
  { name: "summarize", description: "summarize session", source: "skill" as const, hints: [] },
]

describe("composer integration visibility", () => {
  test("@src shows only host-limited visible results", () => {
    const workspace = [
      "src/core/sdk.ts",
      "src/extension.ts",
      "src/core/tabs.ts",
      "src/bridge/host.ts",
      "src/bridge/types.ts",
      "src/core/commands.ts",
      "src/core/events.ts",
      "src/core/server.ts",
      "src/core/session.ts",
      "src/core/workspace.ts",
      "src/panel/html.ts",
      "src/panel/serializer.ts",
      "src/sidebar/focused.ts",
      "src/sidebar/html.ts",
      "src/sidebar/item.ts",
      "src/sidebar/provider.ts",
      "src/sidebar/view-provider.ts",
      "src/sidebar/view-types.ts",
      "src/panel/provider/actions.ts",
      "src/panel/provider/controller.ts",
      "src/panel/provider/file-search.test.ts",
      "src/panel/provider/file-search.ts",
      "src/panel/provider/files.ts",
      "src/panel/provider/index.ts",
      "src/panel/provider/mutations.ts",
      "src/panel/provider/navigation.ts",
      "src/panel/provider/reducer.ts",
      "src/panel/provider/snapshot.ts",
      "src/panel/provider/utils.ts",
      "src/panel/webview/app/App.tsx",
      "src/panel/webview/app/composer-editor.ts",
    ]

    const result = runComposerIntegration({
      name: "@src visibility",
      draft: "@src",
      cursor: 4,
      host: { workspace },
    })

    assert.equal(result.trigger, "mention")
    assert.equal(result.hostResults.length, 24, "host returns exactly FILE_SEARCH_LIMIT=24 results")
    assert.ok(result.hostResults.some((item) => item.kind === "directory"), "directories now compete with files before FILE_SEARCH_LIMIT is applied")
    assert.ok(result.hostResults.some((item) => item.kind === "file"), "files still remain visible in the mixed ranked list")
    assert.equal(result.hostResults[0]?.path, "src/", "root src directory ranks first for @src")
    assert.ok(result.items.some((item) => item.kind === "directory"), "directories are visible to the user")
  })

  test("@src can show directories when recents and files do not exhaust host limit", () => {
    const result = runComposerIntegration({
      name: "@src directories visible",
      draft: "@src",
      cursor: 4,
      host: {
        workspace: [
          "src/panel/webview/app/App.tsx",
          "src/panel/webview/hooks/useComposerAutocomplete.ts",
          "src/core/sdk.ts",
        ],
      },
    })

    assert.deepEqual(result.items.slice(0, 4), [
      { id: "search:directory:src/::", kind: "directory", label: "@src/", detail: "src/" },
      { id: "search:directory:src/core/::", kind: "directory", label: "@src/core/", detail: "src/core/" },
      { id: "search:directory:src/panel/::", kind: "directory", label: "@src/panel/", detail: "src/panel/" },
      { id: "search:file:src/core/sdk.ts::", kind: "file", label: "@src/core/sdk.ts", detail: "src/core/sdk.ts" },
    ])
  })

  test("@src/panel returns panel files and sub-directories, directories not hidden by file limit", () => {
    const result = runComposerIntegration({
      name: "@src/panel visibility",
      draft: "@src/panel",
      cursor: 10,
      host: {
        workspace: [
          "src/panel/html.ts",
          "src/panel/serializer.ts",
          "src/panel/provider/actions.ts",
          "src/panel/provider/files.ts",
          "src/panel/webview/app/App.tsx",
          "src/panel/webview/hooks/useComposerAutocomplete.ts",
        ],
      },
    })

    assert.equal(result.trigger, "mention")
    assert.ok(result.items.length > 0, "some items visible")
    assert.ok(result.items.some((item) => item.kind === "directory"), "directories visible because files don't exhaust limit")
    assert.ok(result.items.some((item) => item.kind === "file"), "files also visible")
    const dirLabels = result.items.filter((item) => item.kind === "directory").map((item) => item.detail)
    assert.ok(dirLabels.some((d) => d.startsWith("src/panel/")), "src/panel/ subdirectories present")
  })

  test("search results can interleave files and directories by shared path ranking", () => {
    const result = runComposerIntegration({
      name: "mixed file directory ranking",
      draft: "@web",
      cursor: 4,
      host: {
        workspace: [
          "src/web.ts",
          "src/panel/webview/app.tsx",
        ],
      },
    })

    assert.deepEqual(result.items.slice(0, 3), [
      { id: "search:file:src/web.ts::", kind: "file", label: "@src/web.ts", detail: "src/web.ts" },
      { id: "search:directory:src/panel/webview/::", kind: "directory", label: "@src/panel/webview/", detail: "src/panel/webview/" },
      { id: "search:file:src/panel/webview/app.tsx::", kind: "file", label: "@src/panel/webview/app.tsx", detail: "src/panel/webview/app.tsx" },
    ])
  })

  test("empty @ returns agents, resources, selection, and recents in kind-group order", () => {
    const result = runComposerIntegration({
      name: "empty @ order",
      draft: "@",
      cursor: 1,
      agents: [
        { name: "helper", mode: "subagent" },
        { name: "build", mode: "all" },
      ],
      resources: {
        "ref:docs": { name: "docs", uri: "mcp://docs/ref", client: "ref" },
      },
      host: {
        selected: { path: "src/app.ts", kind: "file", source: "selection", selection: { startLine: 5 } },
        recent: ["README.md", "src/bridge/types.ts"],
        workspace: ["src/core/sdk.ts"],
      },
    })

    assert.equal(result.trigger, "mention")
    const kinds = result.items.map((item) => item.kind)
    const agentIdx = kinds.indexOf("agent")
    const resourceIdx = kinds.indexOf("resource")
    const selectionIdx = kinds.indexOf("selection")
    const recentIdx = kinds.indexOf("recent")
    assert.ok(agentIdx < selectionIdx, "agents before selection")
    assert.ok(selectionIdx < recentIdx, "selection before recents")
    assert.ok(recentIdx < resourceIdx, "recents before resources")
  })

  test("@file#12-20 range query result is visible and selection metadata preserved", () => {
    const result = runComposerIntegration({
      name: "@file#12-20 visibility",
      draft: "@src/panel/webview/app/App.tsx#12-20",
      cursor: 36,
      host: {
        workspace: [
          "src/panel/webview/app/App.tsx",
          "src/panel/webview/hooks/useComposerAutocomplete.ts",
        ],
      },
    })

    assert.equal(result.trigger, "mention")
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].label, "@src/panel/webview/app/App.tsx#12-20")
    assert.equal(result.items[0].detail, "src/panel/webview/app/App.tsx#12-20")
    assert.equal(result.items[0].kind, "file")
  })

  test("/ returns slash actions and no file results", () => {
    const result = runComposerIntegration({
      name: "slash visibility",
      draft: "/",
      cursor: 1,
      host: {
        workspace: ["src/core/sdk.ts"],
      },
    })

    assert.equal(result.trigger, "slash")
    assert.equal(result.hostResults.length, 0, "host search not triggered for slash")
    assert.ok(result.items.every((item) => item.kind === "action"), "only actions returned for /")
    assert.deepEqual(result.items.map((item) => item.label), ["compact", "model", "new", "refresh", "skills", "undo"], "built-in slash actions sort alphabetically")
  })

  test("recent files appear before workspace search results", () => {
    const result = runComposerIntegration({
      name: "recent before search",
      draft: "@App",
      cursor: 4,
      host: {
        recent: ["src/panel/webview/app/App.tsx"],
        workspace: ["src/panel/webview/app/App.tsx", "src/panel/webview/app/state.ts"],
      },
    })

    assert.equal(result.trigger, "mention")
    const sources = result.hostResults.map((item) => item.source)
    const recentIdx = sources.indexOf("recent")
    const searchIdx = sources.indexOf("search")
    assert.ok(recentIdx < searchIdx, "recent comes before search in host results")
    assert.equal(result.hostResults.filter((item) => item.path === "src/panel/webview/app/App.tsx").length, 1, "deduped: App.tsx appears only once even though it is in both recent and workspace")
  })

  test("recent directory path gets kind directory not file", () => {
    const result = runComposerIntegration({
      name: "recent directory kind",
      draft: "@panel/we",
      cursor: 9,
      host: {
        recent: ["src/panel/webview/"],
        workspace: [],
      },
    })

    assert.equal(result.trigger, "mention")
    assert.equal(result.hostResults.length, 1)
    assert.equal(result.hostResults[0].path, "src/panel/webview/")
    assert.equal(result.hostResults[0].kind, "directory", "trailing slash path in recent should be kind directory")
    assert.equal(result.hostResults[0].source, "recent")
    assert.equal(result.items[0].kind, "recent")
    assert.equal(result.items[0].id, "recent:directory:src/panel/webview/::")
  })

  test("/ with server commands sorts all items alphabetically by label", () => {
    const result = runComposerIntegration({
      name: "slash command ordering",
      draft: "/",
      cursor: 1,
      commands: serverCommands,
      host: { workspace: [] },
    })

    assert.equal(result.trigger, "slash")
    const labels = result.items.map((item) => item.label)
    const sorted = [...labels].sort((a, b) => a.localeCompare(b))
    assert.deepEqual(labels, sorted, "items are in alphabetical label order (upstream behavior)")
    assert.equal(labels[0], "compact")
    assert.ok(labels.includes("undo"))
  })

  test("/redo appears only when session has revert state", () => {
    const noRedo = runComposerIntegration({
      name: "slash redo hidden",
      draft: "/",
      cursor: 1,
      commands: serverCommands,
      host: { workspace: [] },
    })
    assert.ok(!noRedo.items.some((item) => item.label === "redo"))

    const withRedo = runComposerIntegration({
      name: "slash redo shown",
      draft: "/",
      cursor: 1,
      session: { revert: { messageID: "msg-1" } },
      commands: serverCommands,
      host: { workspace: [] },
    })
    assert.ok(withRedo.items.some((item) => item.label === "redo"))
  })

  test("/un query ranks undo first", () => {
    const result = runComposerIntegration({
      name: "slash undo query",
      draft: "/un",
      cursor: 3,
      commands: serverCommands,
      host: { workspace: [] },
    })

    assert.equal(result.trigger, "slash")
    assert.equal(result.items[0]?.label, "undo")
  })

  test("/ with server commands excludes skill source", () => {
    const result = runComposerIntegration({
      name: "slash skill excluded",
      draft: "/",
      cursor: 1,
      commands: serverCommands,
      host: { workspace: [] },
    })

    const labels = result.items.map((item) => item.label)
    assert.ok(!labels.includes("summarize"), "skill command must not appear in slash popup")
    assert.ok(labels.includes("review"), "non-skill command is present")
    assert.ok(labels.includes("init"), "non-skill command is present")
    assert.ok(labels.includes("debug"), "mcp command is present")
  })

  test("/skills stays in slash autocomplete as a local skills action", () => {
    const result = runComposerIntegration({
      name: "skills action",
      draft: "/skills",
      cursor: 7,
      commands: serverCommands,
      host: { workspace: [] },
    })

    assert.equal(result.trigger, "slash")
    assert.deepEqual(result.items.map((item) => item.label), ["skills"])
    assert.ok(result.items.every((item) => item.kind === "action"), "slash skills entry stays a local action")
    assert.ok(result.hostResults.length === 0, "host search not triggered for skills")
  })

  test("/skills query does not enter skill results directly", () => {
    const result = runComposerIntegration({
      name: "skills query still slash",
      draft: "/skills sum",
      cursor: 11,
      commands: [
        ...serverCommands,
        { name: "using-superpowers", description: "load the superpowers workflow", source: "skill" as const, hints: [] },
      ],
      host: { workspace: [] },
    })

    assert.equal(result.trigger, null)
  })

  test("/ with server commands shows mcp label in detail", () => {
    const result = runComposerIntegration({
      name: "slash mcp label",
      draft: "/",
      cursor: 1,
      commands: serverCommands,
      host: { workspace: [] },
    })

    const debugItem = result.items.find((item) => item.label === "debug")
    assert.ok(debugItem, "mcp command is present")
    assert.ok(debugItem.detail.includes(":mcp"), "mcp command detail includes :mcp label")

    const reviewItem = result.items.find((item) => item.label === "review")
    assert.ok(reviewItem, "non-mcp command is present")
    assert.ok(!reviewItem.detail.includes(":mcp"), "non-mcp command detail does not include :mcp")
  })

  test("/ without server commands only shows built-in action items", () => {
    const result = runComposerIntegration({
      name: "slash no server commands",
      draft: "/",
      cursor: 1,
      commands: [],
      host: { workspace: ["src/core/sdk.ts"] },
    })

    assert.equal(result.trigger, "slash")
    assert.ok(result.items.every((item) => item.kind === "action"), "only actions when no server commands")
    assert.ok(result.hostResults.length === 0, "host search not triggered for slash")
  })

  test("/prefix query ranks label-prefix matches before fuzzy-only matches", () => {
    const result = runComposerIntegration({
      name: "slash prefix boost",
      draft: "/sta",
      cursor: 4,
      commands: [
        { name: "start", description: "start the server", source: "command" as const, hints: [] },
        { name: "status", description: "show current status", source: "command" as const, hints: [] },
        { name: "review", description: "review outstanding items", source: "command" as const, hints: [] },
      ],
      host: { workspace: [] },
    })

    assert.equal(result.trigger, "slash")
    const labels = result.items.map((item) => item.label)
    assert.ok(labels.indexOf("start") < labels.indexOf("review"), "label-prefix match 'start' ranks before fuzzy-only 'review'")
    assert.ok(labels.indexOf("status") < labels.indexOf("review"), "label-prefix match 'status' ranks before fuzzy-only 'review'")
  })
})
