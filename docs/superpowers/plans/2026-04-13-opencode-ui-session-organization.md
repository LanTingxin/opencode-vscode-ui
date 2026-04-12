# OpenCode UI Session Organization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the focused-session Todo companion view into a stronger task panel and add local session tags with sidebar display and workspace-scoped tag filtering.

**Architecture:** Keep the two features additive and local to the current extension architecture. The task panel should continue to use `FocusedSessionStore` as its only data source, with richer derivation happening in sidebar view helpers and the todo webview. Session tags should live in a new extension-local metadata store keyed by `workspaceId + sessionId`; the Sessions tree should merge that metadata at render time without changing `SessionStore`. Search and tag filtering should remain sidebar view state layered on top of the normal session list.

**Tech Stack:** TypeScript, VS Code extension APIs, React webview UI, Bun test runner, Node test assertions

---

## File Map

### New files

- `src/core/session-tags.ts`
  - Local session-tag store, persistence helpers, and typed metadata access
- `src/test/session-tags.test.ts`
  - Session-tag persistence and workspace isolation tests
- `src/test/sidebar-task-panel.test.ts`
  - Task-panel grouping, counting, and filter derivation tests

### Modified files

- `package.json`
  - Register tag-management and tag-filter commands plus Sessions tree menu entries
- `src/extension.ts`
  - Construct the session-tag store and pass it into the tree and command wiring
- `src/core/commands.ts`
  - Add session tag management and workspace tag-filter commands
- `src/sidebar/provider.ts`
  - Merge session tags into rendered session items and apply workspace tag filters alongside text search
- `src/sidebar/item.ts`
  - Render compact session tag pills and add any tag-filter clear items needed in the tree
- `src/sidebar/view-provider.ts`
  - Include any extra focused-session payload fields needed for task navigation and summary display
- `src/sidebar/view-types.ts`
  - Extend the sidebar webview state and message contracts for task filtering and session navigation
- `src/sidebar/webview/index.tsx`
  - Build the task panel UI, summary, filters, grouped sections, and session navigation actions
- `src/sidebar/webview/styles.css`
  - Add task panel summary, filter, grouped-list, and session-tag display styles
- `src/sidebar/focused.ts`
  - Surface source session metadata needed by the upgraded task panel only if missing from the current state shape
- `src/test/sidebar-provider.test.ts`
  - Extend provider tests for tag rendering, tag filters, and search-plus-tag intersections
- `README.md`
  - Document the upgraded task panel and local session tags

## Chunk 1: Task Panel Upgrade

### Task 1: Add failing derivation tests for task counts, filters, and grouped ordering

**Files:**
- Create: `src/test/sidebar-task-panel.test.ts`
- Modify: `src/sidebar/webview/index.tsx`

- [ ] **Step 1: Write the failing task-panel derivation tests**

```ts
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { buildTaskPanelView } from "../sidebar/webview/index"

describe("task panel view", () => {
  test("groups open tasks before completed tasks", () => {
    const view = buildTaskPanelView({
      todos: [
        { content: "Done item", status: "completed", priority: "medium" },
        { content: "Active item", status: "in_progress", priority: "high" },
        { content: "Queued item", status: "pending", priority: "low" },
      ],
    })

    assert.deepEqual(view.sections.map((section) => section.id), ["in_progress", "pending", "completed"])
  })

  test("counts open and completed tasks separately", () => {
    const view = buildTaskPanelView({
      todos: [
        { content: "Done item", status: "completed", priority: "medium" },
        { content: "Queued item", status: "pending", priority: "low" },
      ],
    })

    assert.equal(view.summary.total, 2)
    assert.equal(view.summary.open, 1)
    assert.equal(view.summary.completed, 1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/sidebar-task-panel.test.ts`
Expected: FAIL because there is no extracted task-panel derivation helper yet

- [ ] **Step 3: Extract minimal task-panel view helpers**

```ts
export function buildTaskPanelView(input: { todos: Todo[]; filter?: TaskFilter }) {
  const filtered = applyTaskFilter(input.todos, input.filter ?? "all")
  const sections = groupTasksByStatus(filtered)

  return {
    summary: {
      total: input.todos.length,
      open: input.todos.filter((item) => item.status !== "completed").length,
      completed: input.todos.filter((item) => item.status === "completed").length,
      inProgress: input.todos.filter((item) => item.status === "in_progress").length,
    },
    sections,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/test/sidebar-task-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/test/sidebar-task-panel.test.ts src/sidebar/webview/index.tsx
git commit -m "feat: add task panel derivation helpers"
```

### Task 2: Add task-panel filters and grouped sections to the todo webview

**Files:**
- Modify: `src/sidebar/webview/index.tsx`
- Modify: `src/sidebar/webview/styles.css`
- Modify: `src/sidebar/view-types.ts`

- [ ] **Step 1: Extend the tests with filter behavior**

```ts
test("open filter hides completed tasks", () => {
  const view = buildTaskPanelView({
    filter: "open",
    todos: [
      { content: "Done item", status: "completed", priority: "medium" },
      { content: "Queued item", status: "pending", priority: "low" },
    ],
  })

  assert.equal(view.sections.length, 1)
  assert.equal(view.sections[0]?.items[0]?.content, "Queued item")
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/sidebar-task-panel.test.ts`
Expected: FAIL because filter-aware derivation is incomplete

- [ ] **Step 3: Implement the minimal task-panel UI**

```tsx
function TodoList({ state }: { state: SidebarViewState }) {
  const [filter, setFilter] = React.useState<TaskFilter>("all")
  const view = buildTaskPanelView({ todos: state.todos, filter })

  return (
    <section className="sv-group">
      <TaskSummary summary={view.summary} filter={filter} onFilter={setFilter} />
      {view.sections.length === 0 ? <Empty title="No matching tasks" text="Try a different filter" /> : null}
      {view.sections.map((section) => <TaskSection key={section.id} section={section} />)}
    </section>
  )
}
```

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `bun test src/test/sidebar-task-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sidebar/webview/index.tsx src/sidebar/webview/styles.css src/sidebar/view-types.ts src/test/sidebar-task-panel.test.ts
git commit -m "feat: upgrade focused task panel"
```

### Task 3: Add task-to-session navigation support

**Files:**
- Modify: `src/sidebar/view-provider.ts`
- Modify: `src/sidebar/view-types.ts`
- Modify: `src/sidebar/webview/index.tsx`
- Modify: `src/sidebar/focused.ts`

- [ ] **Step 1: Add a failing test for task navigation payloads**

```ts
test("includes focused session context for task navigation", () => {
  const message = buildTaskOpenMessage({
    sessionId: "root",
    workspaceId: "ws-1",
    dir: "/workspace",
  })

  assert.deepEqual(message, {
    type: "openSession",
    workspaceId: "ws-1",
    sessionId: "root",
    dir: "/workspace",
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/sidebar-task-panel.test.ts`
Expected: FAIL because the sidebar view does not yet support task-to-session navigation messages

- [ ] **Step 3: Implement the minimal message flow**

```ts
// view-types.ts
type SidebarWebviewMessage =
  | { type: "ready" }
  | { type: "openFile"; filePath: string }
  | { type: "openSession"; workspaceId: string; dir: string; sessionId: string }

// view-provider.ts
if (message.type === "openSession") {
  void vscode.commands.executeCommand("opencode-ui.openSessionById", {
    workspaceId: message.workspaceId,
    dir: message.dir,
  }, message.sessionId)
}
```

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `bun test src/test/sidebar-task-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sidebar/view-provider.ts src/sidebar/view-types.ts src/sidebar/webview/index.tsx src/sidebar/focused.ts src/test/sidebar-task-panel.test.ts
git commit -m "feat: add task panel session navigation"
```

## Chunk 2: Session Tag Store And Sidebar Rendering

### Task 4: Add failing tests for local session-tag persistence

**Files:**
- Create: `src/core/session-tags.ts`
- Create: `src/test/session-tags.test.ts`

- [ ] **Step 1: Write the failing session-tag store tests**

```ts
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { SessionTagStore } from "../core/session-tags"

describe("session tag store", () => {
  test("stores tags by workspace and session id", async () => {
    const store = new SessionTagStore(memoryState())
    await store.setTags("ws-1", "s1", ["bug", "urgent"])

    assert.deepEqual(store.tags("ws-1", "s1"), ["bug", "urgent"])
    assert.deepEqual(store.tags("ws-2", "s1"), [])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/session-tags.test.ts`
Expected: FAIL because the session-tag store does not exist yet

- [ ] **Step 3: Implement the minimal local metadata store**

```ts
export class SessionTagStore {
  constructor(private state: vscode.Memento) {}

  tags(workspaceId: string, sessionId: string) {
    const snapshot = this.state.get<Record<string, { tags: string[] }>>("session-tags", {})
    return snapshot[key(workspaceId, sessionId)]?.tags ?? []
  }

  async setTags(workspaceId: string, sessionId: string, tags: string[]) {
    const snapshot = this.state.get<Record<string, { tags: string[] }>>("session-tags", {})
    snapshot[key(workspaceId, sessionId)] = { tags }
    await this.state.update("session-tags", snapshot)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/test/session-tags.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/session-tags.ts src/test/session-tags.test.ts
git commit -m "feat: add local session tag store"
```

### Task 5: Render session tags in the Sessions tree

**Files:**
- Modify: `src/sidebar/item.ts`
- Modify: `src/sidebar/provider.ts`
- Modify: `src/test/sidebar-provider.test.ts`

- [ ] **Step 1: Extend sidebar provider tests with tag rendering**

```ts
test("renders tag summary on session items", () => {
  const items = buildWorkspaceChildren({
    runtime: runtime(),
    sessions: [session("s1", "Fix login")],
    statuses: new Map(),
    tags: {
      "s1": ["bug", "urgent", "backend"],
    },
  })

  assert.equal(items[0]?.description?.includes("bug"), true)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/sidebar-provider.test.ts`
Expected: FAIL because session items do not yet surface local tags

- [ ] **Step 3: Add minimal tag rendering support**

```ts
export class SessionItem extends vscode.TreeItem {
  constructor(runtime, session, status, tags: string[] = []) {
    super(session.title || session.id.slice(0, 8), vscode.TreeItemCollapsibleState.None)
    this.description = buildSessionDescription(session.id, tags)
    this.tooltip = buildSessionTooltip(runtime.dir, session, tags)
  }
}
```

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `bun test src/test/sidebar-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sidebar/item.ts src/sidebar/provider.ts src/test/sidebar-provider.test.ts
git commit -m "feat: show session tags in the sidebar"
```

### Task 6: Add workspace tag filters and tag-aware session list intersection

**Files:**
- Modify: `src/sidebar/provider.ts`
- Modify: `src/sidebar/item.ts`
- Modify: `src/test/sidebar-provider.test.ts`

- [ ] **Step 1: Extend the provider tests with tag filtering**

```ts
test("intersects workspace tag filters with text search results", () => {
  const items = buildWorkspaceChildren({
    runtime: runtime(),
    sessions: [session("s1", "Fix login"), session("s2", "Fix billing")],
    statuses: new Map(),
    search: { query: "fix", status: "ready", results: [session("s1", "Fix login"), session("s2", "Fix billing")] },
    tagFilter: "bug",
    tags: {
      "s1": ["bug"],
      "s2": ["billing"],
    },
  })

  assert.equal(items.filter((item) => item.contextValue === "session").length, 1)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/sidebar-provider.test.ts`
Expected: FAIL because the provider does not yet apply tag filters over rendered workspace sessions

- [ ] **Step 3: Implement minimal tag-filter state in the provider**

```ts
type WorkspaceTagFilterState = {
  activeTag: string
}

filterByTag(workspaceId: string, tag: string) {
  this.tagFilters.set(workspaceId, { activeTag: tag })
  this.refresh()
}

clearTagFilter(workspaceId: string) {
  this.tagFilters.delete(workspaceId)
  this.refresh()
}
```

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `bun test src/test/sidebar-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sidebar/provider.ts src/sidebar/item.ts src/test/sidebar-provider.test.ts
git commit -m "feat: add workspace tag filters"
```

## Chunk 3: Tag Commands, Wiring, And Docs

### Task 7: Add commands for managing session tags and workspace tag filters

**Files:**
- Modify: `src/core/commands.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`
- Modify: `src/test/session-tags.test.ts`

- [ ] **Step 1: Add failing tests for normalized tag input**

```ts
test("normalizes comma-separated tag input into unique trimmed tags", () => {
  assert.deepEqual(parseSessionTagsInput("bug, urgent, bug , backend"), ["bug", "urgent", "backend"])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/session-tags.test.ts`
Expected: FAIL because there is no tag-input parsing helper or command wiring yet

- [ ] **Step 3: Implement the minimal command flow**

```ts
vscode.commands.registerCommand("opencode-ui.manageSessionTags", async (item?: SessionItem) => {
  if (!item) {
    return
  }

  const current = tagStore.tags(item.runtime.workspaceId, item.session.id)
  const input = await vscode.window.showInputBox({
    prompt: `Manage tags for ${item.session.title || item.session.id.slice(0, 8)}`,
    value: current.join(", "),
    ignoreFocusOut: true,
  })

  if (input === undefined) {
    return
  }

  await tagStore.setTags(item.runtime.workspaceId, item.session.id, parseSessionTagsInput(input))
  tree.refresh()
})
```

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `bun test src/test/session-tags.test.ts src/test/sidebar-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/commands.ts src/extension.ts package.json src/test/session-tags.test.ts
git commit -m "feat: add session tag commands"
```

### Task 8: Document the new organization features and verify end to end

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-13-opencode-ui-session-organization-design.md`

- [ ] **Step 1: Update user-facing docs**

Add concise README notes for:

- Upgraded task panel filters and grouped display
- Local session tags in the Sessions sidebar
- Workspace-scoped tag filtering

- [ ] **Step 2: Run verification**

Run: `bun test src/test/sidebar-task-panel.test.ts src/test/session-tags.test.ts src/test/sidebar-provider.test.ts`
Expected: PASS

Run: `bun run test`
Expected: PASS

Run: `bun run check-types`
Expected: PASS

Run: `bun run lint`
Expected: PASS

Run: `bun run compile`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/specs/2026-04-13-opencode-ui-session-organization-design.md
git commit -m "docs: document session organization"
```

## Notes For Implementation

- Keep the task panel focused-session scoped; do not expand into a global inbox during implementation
- Prefer small pure helpers for task grouping and tag formatting so the UI work stays easy to test
- Avoid pushing tag data into `SessionStore`; the store should remain server-authoritative for the default session list
- Keep workspace search and workspace tag filters as independent view states that compose at render time
- Persist only the data needed for this slice; do not introduce speculative local metadata fields

Plan complete and saved to `docs/superpowers/plans/2026-04-13-opencode-ui-session-organization.md`. Ready to execute?
