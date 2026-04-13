# OpenCode UI Session Search Implementation Plan

> Status: Completed after workspace-scoped session search shipped on 2026-04-12.

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add workspace-scoped session search to the Sessions tree so users can filter one workspace's sessions from the sidebar without affecting the default session cache or panel flows.

**Architecture:** Keep the feature inside the current extension boundaries. `src/core/commands.ts` will own the explicit search and clear-search commands plus capability-aware input handling. `src/sidebar/provider.ts` and `src/sidebar/item.ts` will own temporary workspace search state and tree rendering, while `SessionStore` remains the source of truth for the normal root session list. Search should call `sdk.session.list({ directory, roots: true, search })` on demand and never mutate the steady-state session cache.

**Tech Stack:** TypeScript, VS Code extension APIs, Bun test runner, Node test assertions

---

## File Map

### New files

- `src/test/sidebar-provider.test.ts`
  - Tree rendering and workspace-scoped search state coverage for the Sessions sidebar

### Modified files

- `package.json`
  - Register search and clear-search commands plus workspace tree menu contributions
- `src/core/capabilities.ts`
  - Add a small helper for updating cached capability snapshots after search attempts
- `src/core/commands.ts`
  - Register workspace search and clear-search commands, input-box flow, and capability fallback behavior
- `src/sidebar/provider.ts`
  - Add workspace-local search state, search execution, clear-search behavior, and search-mode tree rendering
- `src/sidebar/item.ts`
  - Add any dedicated tree items needed for clear-search and search status rendering
- `src/extension.ts`
  - Pass any new command dependencies only if the final implementation needs them
- `src/test/capabilities.test.ts`
  - Cover capability cache updates after successful and unsupported search attempts

### Optional docs follow-up

- `docs/superpowers/specs/2026-04-12-opencode-ui-m1-design.md`
  - Mark M1 as archived or completed if we settle on a minimal archive note instead of introducing archive folders
- `docs/superpowers/plans/2026-04-12-opencode-ui-m1.md`
  - Mark the implementation plan as completed or archived using the same convention

## Chunk 1: Sidebar Search State And Rendering

### Task 1: Add failing tree-render tests for workspace search mode

**Files:**
- Create: `src/test/sidebar-provider.test.ts`
- Modify: `src/sidebar/provider.ts`
- Modify: `src/sidebar/item.ts`

- [ ] **Step 1: Write the failing sidebar provider tests**

```ts
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { buildWorkspaceChildren } from "../sidebar/provider"

describe("sidebar search rendering", () => {
  test("shows normal session items when search mode is inactive", () => {
    const items = buildWorkspaceChildren({
      runtimeState: "ready",
      sessions: [{ id: "s1", title: "Fix login", time: { updated: 10 } }],
    })

    assert.equal(items[0]?.contextValue, "session")
  })

  test("shows clear search and matching sessions while search mode is active", () => {
    const items = buildWorkspaceChildren({
      runtimeState: "ready",
      sessions: [],
      search: {
        query: "login",
        status: "ready",
        results: [{ id: "s1", title: "Fix login", time: { updated: 10 } }],
      },
    })

    assert.equal(items[0]?.contextValue, "clear-search")
    assert.equal(items[1]?.contextValue, "session")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/sidebar-provider.test.ts`
Expected: FAIL because the provider does not yet expose testable search-mode rendering helpers

- [ ] **Step 3: Extract minimal rendering helpers and add new item types**

```ts
export type WorkspaceSearchState = {
  query: string
  status: "loading" | "ready" | "error"
  results: SessionInfo[]
  error?: string
}

export function buildWorkspaceChildren(input: BuildWorkspaceChildrenInput): vscode.TreeItem[] {
  if (input.search?.status === "loading") {
    return [new ClearSearchItem(input.workspace), new StatusItem("Searching sessions...")]
  }

  if (input.search?.status === "error") {
    return [new ClearSearchItem(input.workspace), new StatusItem(`Search error: ${input.search.error || "Unknown error"}`)]
  }

  if (input.search) {
    const sessions = input.search.results.map((session) => new SessionItem(input.runtime, session, input.statuses?.get(session.id)))
    return sessions.length
      ? [new ClearSearchItem(input.workspace), ...sessions]
      : [new ClearSearchItem(input.workspace), new StatusItem("No matching sessions")]
  }

  return input.sessions.length
    ? input.sessions.map((session) => new SessionItem(input.runtime, session, input.statuses?.get(session.id)))
    : [new StatusItem("No sessions")]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/test/sidebar-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/test/sidebar-provider.test.ts src/sidebar/provider.ts src/sidebar/item.ts
git commit -m "feat: add sidebar session search states"
```

### Task 2: Add provider methods for starting, storing, and clearing workspace search

**Files:**
- Modify: `src/sidebar/provider.ts`
- Modify: `src/test/sidebar-provider.test.ts`

- [ ] **Step 1: Extend tests with provider search state coverage**

```ts
test("clears only the targeted workspace search state", () => {
  const state = createSidebarSearchState()
  state.set("ws-1", { query: "login", status: "ready", results: [] })
  state.set("ws-2", { query: "billing", status: "ready", results: [] })

  clearWorkspaceSearch(state, "ws-1")

  assert.equal(state.has("ws-1"), false)
  assert.equal(state.has("ws-2"), true)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/sidebar-provider.test.ts`
Expected: FAIL because the provider does not yet expose clearable workspace search state

- [ ] **Step 3: Implement provider search-state helpers**

```ts
export function clearWorkspaceSearch(state: Map<string, WorkspaceSearchState>, workspaceId: string) {
  state.delete(workspaceId)
}

export class SidebarProvider {
  private readonly search = new Map<string, WorkspaceSearchState>()

  clearSearch(workspaceId: string) {
    clearWorkspaceSearch(this.search, workspaceId)
    this.refresh()
  }

  setSearchLoading(workspaceId: string, query: string) {
    this.search.set(workspaceId, { query, status: "loading", results: [] })
    this.refresh()
  }

  setSearchResult(workspaceId: string, query: string, results: SessionInfo[]) {
    this.search.set(workspaceId, { query, status: "ready", results })
    this.refresh()
  }

  setSearchError(workspaceId: string, query: string, error: string) {
    this.search.set(workspaceId, { query, status: "error", results: [], error })
    this.refresh()
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/test/sidebar-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sidebar/provider.ts src/test/sidebar-provider.test.ts
git commit -m "feat: manage workspace search state"
```

## Chunk 2: Command Flow And Capability Handling

### Task 3: Add failing capability tests for post-search cache updates

**Files:**
- Modify: `src/core/capabilities.ts`
- Modify: `src/test/capabilities.test.ts`

- [ ] **Step 1: Extend capability tests with update helpers**

```ts
test("marks session search supported after a successful search attempt", () => {
  const next = applySessionSearchCapabilityResult(createEmptyCapabilities(), "supported")
  assert.equal(next.sessionSearch, "supported")
})

test("marks session search unsupported after an unsupported search failure", () => {
  const next = applySessionSearchCapabilityResult(createEmptyCapabilities(), "unsupported")
  assert.equal(next.sessionSearch, "unsupported")
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/capabilities.test.ts`
Expected: FAIL because `applySessionSearchCapabilityResult` does not exist yet

- [ ] **Step 3: Implement a small capability update helper**

```ts
export function applySessionSearchCapabilityResult(
  snapshot: RuntimeCapabilities,
  result: CapabilityState,
): RuntimeCapabilities {
  return {
    ...snapshot,
    sessionSearch: result,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/test/capabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/capabilities.ts src/test/capabilities.test.ts
git commit -m "feat: support session search capability updates"
```

### Task 4: Add search and clear-search commands for workspace nodes

**Files:**
- Modify: `src/core/commands.ts`
- Modify: `src/sidebar/provider.ts`
- Modify: `src/test/sidebar-provider.test.ts`

- [ ] **Step 1: Extend tests with search command scenarios**

```ts
test("stores matching search results for one workspace", async () => {
  const provider = createSidebarProviderHarness({
    search: async () => [{ id: "s1", title: "Fix login", time: { updated: 10 } }],
  })

  await provider.runWorkspaceSearch("ws-1", "login")

  assert.equal(provider.searchState("ws-1")?.status, "ready")
  assert.equal(provider.searchState("ws-1")?.results.length, 1)
})

test("keeps the default tree when the query is empty", async () => {
  const provider = createSidebarProviderHarness()

  await provider.runWorkspaceSearch("ws-1", "")

  assert.equal(provider.searchState("ws-1"), undefined)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/sidebar-provider.test.ts`
Expected: FAIL because the provider does not yet expose an executable workspace search flow

- [ ] **Step 3: Implement command wiring and provider execution**

```ts
vscode.commands.registerCommand("opencode-ui.searchWorkspaceSessions", async (item?: WorkspaceItem) => {
  const rt = item?.runtime
  if (!rt) {
    return
  }

  const query = await vscode.window.showInputBox({
    prompt: `Search sessions in ${rt.name}`,
    placeHolder: "Enter session title or keyword",
    ignoreFocusOut: true,
  })

  if (!query?.trim()) {
    return
  }

  const support = capabilities.snapshot(rt.workspaceId).sessionSearch
  if (support === "unsupported") {
    await vscode.window.showInformationMessage(`Session search is not supported by the OpenCode server for ${rt.name}.`)
    return
  }

  await tree.searchWorkspace(rt.workspaceId, query.trim())
})

vscode.commands.registerCommand("opencode-ui.clearWorkspaceSessionSearch", async (item?: WorkspaceItem) => {
  const rt = item?.runtime
  if (!rt) {
    return
  }

  tree.clearSearch(rt.workspaceId)
})
```

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `bun test src/test/sidebar-provider.test.ts src/test/capabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/commands.ts src/sidebar/provider.ts src/test/sidebar-provider.test.ts src/test/capabilities.test.ts
git commit -m "feat: add workspace session search commands"
```

## Chunk 3: Menus, Unsupported Fallback, And Verification

### Task 5: Expose search actions in the Sessions tree and cover unsupported or error states

**Files:**
- Modify: `package.json`
- Modify: `src/sidebar/item.ts`
- Modify: `src/sidebar/provider.ts`
- Modify: `src/test/sidebar-provider.test.ts`

- [ ] **Step 1: Add failing tests for unsupported and error cases**

```ts
test("shows a search error status while keeping clear search available", () => {
  const items = buildWorkspaceChildren({
    runtimeState: "ready",
    sessions: [],
    search: {
      query: "login",
      status: "error",
      results: [],
      error: "request failed",
    },
  })

  assert.equal(items[0]?.contextValue, "clear-search")
  assert.equal(items[1]?.label, "Search error: request failed")
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/sidebar-provider.test.ts`
Expected: FAIL if the provider does not yet render the stable error-state tree

- [ ] **Step 3: Add menu contributions and finalize search-mode items**

```json
{
  "command": "opencode-ui.searchWorkspaceSessions",
  "title": "OpenCode: Search Sessions",
  "icon": "$(search)"
},
{
  "command": "opencode-ui.clearWorkspaceSessionSearch",
  "title": "OpenCode: Clear Session Search",
  "icon": "$(close)"
}
```

Add them to `view/item/context` and workspace inline actions so they appear only for `viewItem == workspace`, and keep `Clear Session Search` visible only when that workspace is in search mode.

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `bun test src/test/sidebar-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json src/sidebar/item.ts src/sidebar/provider.ts src/test/sidebar-provider.test.ts
git commit -m "feat: expose session search in the sidebar"
```

### Task 6: Validate the feature and apply the minimal M1 archive note

**Files:**
- Modify: `docs/superpowers/specs/2026-04-12-opencode-ui-m1-design.md`
- Modify: `docs/superpowers/plans/2026-04-12-opencode-ui-m1.md`
- Modify: `README.md`

- [ ] **Step 1: Add a minimal archive or completion note to the M1 docs**

Use a short status note near the top of the M1 spec and M1 plan, for example:

```md
> Status: Completed and archived after M1 implementation shipped on 2026-04-12.
```

Do this only if no better archive convention emerges during implementation.

- [ ] **Step 2: Update README command or feature text if the sidebar search ships with user-facing surface changes**

Mention the Sessions tree search entry only if it is discoverable enough to belong in the feature list or command list.

- [ ] **Step 3: Run verification**

Run: `bun test src/test/sidebar-provider.test.ts src/test/capabilities.test.ts`
Expected: PASS

Run: `bun run check-types`
Expected: PASS

Run: `bun run lint`
Expected: PASS

Run: `bun run compile`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-12-opencode-ui-m1-design.md docs/superpowers/plans/2026-04-12-opencode-ui-m1.md README.md
git commit -m "docs: archive m1 and document session search"
```

## Notes For Implementation

- Prefer extracting small pure helpers from `SidebarProvider` so search rendering can be unit-tested without a full VS Code harness
- Do not change `SessionStore.refresh()` or the runtime event stream unless tests prove it is necessary
- Keep search state keyed by `workspaceId`, not by runtime directory string derived elsewhere
- Reuse the existing `SessionItem` open-session command path for result items
- Keep unsupported capability handling user-friendly and non-fatal

Plan complete and saved to `docs/superpowers/plans/2026-04-12-opencode-ui-session-search.md`. Ready to execute?
