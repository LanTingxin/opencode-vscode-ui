# OpenCode UI Subagents Sidebar Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a focused-session `Subagents` companion sidebar that follows the selected session, shows all descendant child sessions grouped into `In Progress` and `Done`, and opens a subagent session when clicked.

**Architecture:** Keep the feature additive to the existing focused-session companion-view pipeline. Extend `FocusedSessionStore` to load and maintain descendant child-session state plus session-status snapshots, then expose that narrower payload through the existing sidebar webview provider stack. Leave the main root-session tree unchanged and reuse existing open-session commands for navigation.

**Tech Stack:** TypeScript, VS Code extension APIs, React webview UI, Bun test runner, OpenCode SDK v2

---

## File Map

### Existing files expected to change

- `package.json`
  - Register the `Subagents` companion view contribution
- `src/extension.ts`
  - Construct and register a third focused-session sidebar webview provider
- `src/sidebar/focused.ts`
  - Extend focused-session loading and event handling to include descendant subagents and their runtime statuses
- `src/sidebar/focused.test.ts`
  - Add focused-session subtree loading and event-sync tests
- `src/sidebar/view-types.ts`
  - Extend sidebar view modes and payload types for subagent rows
- `src/sidebar/view-provider.ts`
  - Emit subagent payloads through the existing sidebar host-message flow
- `src/sidebar/webview/index.tsx`
  - Add subagent grouping helpers and the `SubagentsList` UI
- `src/sidebar/webview/index.test.tsx`
  - Add render and interaction coverage for the subagents view
- `src/sidebar/webview/styles.css`
  - Add compact row and grouped-section styles for subagents

### Files intentionally left unchanged

- `src/core/session-list.ts`
  - Keep root-session-only session-tree tracking
- `src/sidebar/provider.ts`
  - Keep the main sessions tree flat at the root-session level
- `src/sidebar/item.ts`
  - Do not introduce tree-level subagent rows in this slice

## Chunk 1: Focused Session Subagent Data

### Task 1: Add failing tests for focused-session subagent loading

**Files:**
- Modify: `src/sidebar/focused.test.ts`
- Modify: `src/sidebar/focused.ts`

- [ ] **Step 1: Add a failing test for loading all descendant child sessions for a root session**

```ts
test("loadFocusedSessionState returns all descendant subagents for a root session", async () => {
  const state = await loadFocusedSessionState({
    ref: { workspaceId: "ws-1", dir: "/workspace", sessionId: "root" },
    runtime: {
      dir: "/workspace",
      sdk: {
        session: {
          get: async () => ({ data: session("root") }),
          todo: async () => ({ data: [] }),
          diff: async () => ({ data: [] }),
          children: async ({ sessionID }: { sessionID: string }) => ({
            data: sessionID === "root"
              ? [session("child-a", "root"), session("child-b", "root")]
              : sessionID === "child-a"
                ? [session("grandchild-a", "child-a")]
                : [],
          }),
          status: async () => ({ data: { "child-a": { type: "busy" }, "child-b": { type: "idle" }, "grandchild-a": { type: "retry", attempt: 1, message: "retry", next: 42 } } }),
        },
        vcs: { get: async () => ({ data: {} }) },
      },
    } as any,
  })

  assert.deepEqual(state.subagents.map((item) => item.session.id), ["child-a", "child-b", "grandchild-a"])
})
```

- [ ] **Step 2: Add a failing test for loading descendants when the focused session is itself a child**

```ts
test("loadFocusedSessionState scopes subagents to the focused child subtree", async () => {
  // expect only descendants of child-a, not siblings under the original root
})
```

- [ ] **Step 3: Run the targeted tests to verify they fail**

Run: `bun test src/sidebar/focused.test.ts`
Expected: FAIL because focused-session state does not yet include `subagents` or subtree loading

- [ ] **Step 4: Implement minimal host-side subtree loading in `loadFocusedSessionState`**

```ts
type FocusedSubagentItem = {
  session: SessionInfo
  status: SessionStatus
}

async function loadSubagents(sdk: Client, dir: string, sessionID: string) {
  const sessions = await loadDescendants(sdk, dir, sessionID)
  const statusMap = (await sdk.session.status({ directory: dir })).data ?? {}
  return sessions.map((session) => ({
    session,
    status: statusMap[session.id] ?? { type: "idle" as const },
  }))
}
```

- [ ] **Step 5: Re-run the targeted tests to verify they pass**

Run: `bun test src/sidebar/focused.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/sidebar/focused.ts src/sidebar/focused.test.ts
git commit -m "feat: load focused session subagents"
```

### Task 2: Add failing tests for focused-session event updates

**Files:**
- Modify: `src/sidebar/focused.test.ts`
- Modify: `src/sidebar/focused.ts`

- [ ] **Step 1: Add a failing test for `session.status` moving a subagent between groups**

```ts
test("updates subagent status from event stream", async () => {
  // seed child-a as busy, emit session.status idle, expect snapshot().subagents to update
})
```

- [ ] **Step 2: Add a failing test for `session.created` and `session.deleted` inside the focused subtree**

```ts
test("adds and removes child sessions from the focused subtree incrementally", async () => {
  // emit session.created for a descendant, then session.deleted, and assert list changes without ref swap
})
```

- [ ] **Step 3: Add a failing test for archived or reparented child sessions leaving the view**

```ts
test("removes archived or moved child sessions from focused subagents", async () => {
  // emit session.updated with archived time or different parentID
})
```

- [ ] **Step 4: Run the targeted tests to verify they fail**

Run: `bun test src/sidebar/focused.test.ts`
Expected: FAIL because live subagent event reconciliation is not implemented

- [ ] **Step 5: Implement minimal incremental event handling**

```ts
if (event.type === "session.status") {
  this.set({
    ...this.state,
    subagents: this.state.subagents.map((item) =>
      item.session.id === props.sessionID ? { ...item, status: props.status } : item
    ),
  })
}
```

Also implement:

- subtree membership checks for `session.created` and `session.updated`
- removal on `session.deleted`
- fallback reload when parentage cannot be derived safely from current focused state

- [ ] **Step 6: Re-run the targeted tests to verify they pass**

Run: `bun test src/sidebar/focused.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/sidebar/focused.ts src/sidebar/focused.test.ts
git commit -m "feat: sync focused subagents from session events"
```

## Chunk 2: Sidebar View Mode, Rendering, And Registration

### Task 3: Add failing sidebar webview tests for grouped subagent rendering

**Files:**
- Modify: `src/sidebar/webview/index.test.tsx`
- Modify: `src/sidebar/webview/index.tsx`
- Modify: `src/sidebar/view-types.ts`

- [ ] **Step 1: Add a failing render test for grouped `In Progress` and `Done` sections**

```tsx
test("renders subagents grouped into in progress and done", () => {
  const state: SidebarViewState = {
    status: "ready",
    mode: "subagents",
    todos: [],
    diff: [],
    subagents: [
      { session: session("child-a", undefined, "Builder"), status: { type: "busy" } },
      { session: session("child-b", undefined, "Planner"), status: { type: "idle" } },
    ],
  }

  const html = renderToStaticMarkup(<SubagentsList state={state} />)
  assert.equal(html.includes("In Progress"), true)
  assert.equal(html.includes("Done"), true)
})
```

- [ ] **Step 2: Add a failing helper test for ordering and status labeling**

```ts
test("buildSubagentPanelView sorts by updated time descending within each group", () => {
  // expect newest busy first, newest idle first
})
```

- [ ] **Step 3: Run the targeted tests to verify they fail**

Run: `bun test src/sidebar/webview/index.test.tsx`
Expected: FAIL because there is no `subagents` mode or grouped subagent helper yet

- [ ] **Step 4: Implement minimal view-state and grouping helpers**

```ts
export type SidebarViewMode = "todo" | "diff" | "subagents"

export function buildSubagentPanelView(input: { subagents: FocusedSubagentItem[] }) {
  const sorted = [...input.subagents].sort((a, b) => b.session.time.updated - a.session.time.updated)
  return {
    inProgress: sorted.filter((item) => item.status.type === "busy" || item.status.type === "retry"),
    done: sorted.filter((item) => item.status.type === "idle"),
  }
}
```

- [ ] **Step 5: Re-run the targeted tests to verify they pass**

Run: `bun test src/sidebar/webview/index.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/sidebar/view-types.ts src/sidebar/webview/index.tsx src/sidebar/webview/index.test.tsx
git commit -m "feat: add subagents sidebar view helpers"
```

### Task 4: Add click-to-open coverage and implement the `SubagentsList` UI

**Files:**
- Modify: `src/sidebar/webview/index.tsx`
- Modify: `src/sidebar/webview/index.test.tsx`
- Modify: `src/sidebar/webview/styles.css`

- [ ] **Step 1: Add a failing test for subagent rows using the existing open-session message shape**

```ts
test("buildSubagentOpenMessage reuses openSession payload", () => {
  assert.deepEqual(buildSubagentOpenMessage({
    workspaceId: "ws-1",
    dir: "/workspace",
    sessionId: "child-a",
  }), {
    type: "openSession",
    workspaceId: "ws-1",
    dir: "/workspace",
    sessionId: "child-a",
  })
})
```

- [ ] **Step 2: Add a failing render test for empty subagents state**

```tsx
test("renders no subagents empty state", () => {
  const state: SidebarViewState = { status: "ready", mode: "subagents", todos: [], diff: [], subagents: [] }
  const html = renderToStaticMarkup(<AppForTest initialState={state} />)
  assert.equal(html.includes("No subagents yet"), true)
})
```

- [ ] **Step 3: Run the targeted tests to verify they fail**

Run: `bun test src/sidebar/webview/index.test.tsx`
Expected: FAIL because subagent rows and empty-state rendering are missing

- [ ] **Step 4: Implement `SubagentsList` and styles**

Implement:

- `SubagentsList({ state })`
- compact row markup with title, secondary status text, and short id
- click handler that posts `{ type: "openSession", ... }`
- CSS classes for grouped sections and compact subagent rows

- [ ] **Step 5: Re-run the targeted tests to verify they pass**

Run: `bun test src/sidebar/webview/index.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/sidebar/webview/index.tsx src/sidebar/webview/index.test.tsx src/sidebar/webview/styles.css
git commit -m "feat: render focused subagents sidebar"
```

### Task 5: Register the new sidebar view and wire provider payloads end to end

**Files:**
- Modify: `package.json`
- Modify: `src/extension.ts`
- Modify: `src/sidebar/view-provider.ts`
- Modify: `src/sidebar/view-types.ts`
- Modify: `src/sidebar/focused.ts`

- [ ] **Step 1: Add a failing integration test for provider payload shape if practical**

Prefer adding or extending an existing lightweight provider test to assert:

- `mode: "subagents"` is accepted
- the emitted payload includes `subagents`
- existing `todo` and `diff` payloads still compile and behave

If there is no lightweight seam for `SidebarViewProvider`, skip this test and rely on `check-types` plus the webview and focused-session tests.

- [ ] **Step 2: Register the new `Subagents` view contribution in `package.json`**

Add:

- `opencode-ui.subagents` under the main `opencode-ui` views container
- matching activation event if needed by current package layout

- [ ] **Step 3: Register a third `SidebarViewProvider` in `src/extension.ts`**

```ts
const subagentsView = new SidebarViewProvider(ctx.extensionUri, "subagents", focused)
const subagentsReg = vscode.window.registerWebviewViewProvider("opencode-ui.subagents", subagentsView)
```

Also add `subagentsView` and `subagentsReg` to subscriptions.

- [ ] **Step 4: Extend `SidebarViewProvider.post()` to include the subagent payload**

Preserve the current todo and diff behavior unchanged.

- [ ] **Step 5: Run focused and webview tests plus typecheck**

Run: `bun test src/sidebar/focused.test.ts src/sidebar/webview/index.test.tsx`
Expected: PASS

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json src/extension.ts src/sidebar/view-provider.ts src/sidebar/view-types.ts src/sidebar/focused.ts src/sidebar/focused.test.ts src/sidebar/webview/index.tsx src/sidebar/webview/index.test.tsx src/sidebar/webview/styles.css
git commit -m "feat: add focused subagents companion view"
```

## Chunk 3: Final Verification

### Task 6: Run repo validation and sanity-check no unrelated session-tree behavior changed

**Files:**
- Modify: none unless verification finds issues

- [ ] **Step 1: Run focused sidebar tests**

Run: `bun test src/sidebar/focused.test.ts src/sidebar/webview/index.test.tsx`
Expected: PASS

- [ ] **Step 2: Run the default repo test command**

Run: `bun run test`
Expected: PASS for existing panel and integration tests

- [ ] **Step 3: Run the extension build validation**

Run: `bun run compile`
Expected: PASS

- [ ] **Step 4: Manually sanity-check the intended UX in VS Code**

Verify:

- selecting a root session updates `Subagents`
- selecting a child session narrows to that child subtree only
- active subagents appear under `In Progress`
- idle subagents appear under `Done`
- clicking a row opens the child session
- the main `Sessions` tree remains root-session-only

- [ ] **Step 5: Commit any final fixes**

```bash
git add <only the files changed by verification fixes>
git commit -m "fix: polish subagents sidebar behavior"
```
