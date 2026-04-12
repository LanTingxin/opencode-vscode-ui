# OpenCode UI M1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add M1 migration-focused UX foundations so users can launch OpenCode from the editor with prefilled context, see an always-available status bar entry, and build future work on a safe runtime capability layer.

**Architecture:** Keep the implementation inside the current extension boundaries. `src/core/` will own capability probing, launch context capture, command registration, and the status bar controller. `src/panel/provider/` will own seeded composer delivery by queueing `restoreComposer` payloads until a session webview is ready. The implementation should prefer additive helpers over broad refactors and should degrade cleanly when runtime support is unknown.

**Tech Stack:** TypeScript, VS Code extension APIs, React webview bridge, Bun test runner, Node test assertions

---

## File Map

### New files

- `src/core/capabilities.ts`
  - Per-runtime capability types, safe probe helpers, and a small manager class
- `src/core/launch-context.ts`
  - Editor and explorer context capture helpers that return workspace-scoped composer seed parts
- `src/core/status-bar.ts`
  - Status bar controller that derives one active OpenCode status entry from runtime and panel state
- `src/test/capabilities.test.ts`
  - Capability probe classification and manager caching tests
- `src/test/launch-context.test.ts`
  - Editor selection, current file, and explorer multi-file context tests
- `src/test/status-bar.test.ts`
  - Status bar label, tooltip, and command routing tests

### Modified files

- `package.json`
  - Register new commands and editor or explorer menu contributions
- `src/extension.ts`
  - Construct and dispose the new capability and status bar controllers
- `src/core/commands.ts`
  - Register editor-launch commands, explorer-launch commands, and a status bar action command
- `src/core/server.ts`
  - Add optional capability storage to `WorkspaceRuntime` only if the chosen implementation benefits from colocating capability snapshots on the runtime
- `src/panel/provider/index.ts`
  - Add an open-with-seed helper and session panel lookup or reveal support
- `src/panel/provider/controller.ts`
  - Queue and deliver initial `restoreComposer` parts without breaking the current ready or push flow
- `src/panel/provider/controller.test.ts`
  - Add host-side tests for queued composer seed delivery

### Optional docs follow-up

- `README.md`
  - Mention editor launch entry and status bar entry after the implementation lands

## Chunk 1: Capability Foundation

### Task 1: Define capability types and safe probe behavior

**Files:**
- Create: `src/core/capabilities.ts`
- Test: `src/test/capabilities.test.ts`

- [ ] **Step 1: Write the failing capability tests**

```ts
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { classifyCapabilityError, createEmptyCapabilities } from "../core/capabilities"

describe("capabilities", () => {
  test("starts with unknown feature support", () => {
    const snapshot = createEmptyCapabilities()
    assert.equal(snapshot.sessionSearch, "unknown")
    assert.equal(snapshot.sessionChildren, "unknown")
  })

  test("treats not implemented style errors as unsupported", () => {
    assert.equal(classifyCapabilityError(new Error("404 not found")), "unsupported")
  })

  test("treats transient failures as unknown", () => {
    assert.equal(classifyCapabilityError(new Error("socket hang up")), "unknown")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/capabilities.test.ts`
Expected: FAIL because `src/core/capabilities.ts` does not exist yet

- [ ] **Step 3: Write the minimal capability module**

```ts
export type CapabilityState = "unknown" | "supported" | "unsupported"

export type RuntimeCapabilities = {
  sessionSearch: CapabilityState
  sessionChildren: CapabilityState
  sessionRevert: CapabilityState
  experimentalResources: CapabilityState
}

export function createEmptyCapabilities(): RuntimeCapabilities {
  return {
    sessionSearch: "unknown",
    sessionChildren: "unknown",
    sessionRevert: "unknown",
    experimentalResources: "unknown",
  }
}

export function classifyCapabilityError(err: unknown): CapabilityState {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  if (message.includes("404") || message.includes("501") || message.includes("not implemented")) {
    return "unsupported"
  }
  return "unknown"
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/test/capabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/capabilities.ts src/test/capabilities.test.ts
git commit -m "feat: add capability foundation"
```

### Task 2: Add a capability manager that caches per-workspace probes

**Files:**
- Modify: `src/core/capabilities.ts`
- Test: `src/test/capabilities.test.ts`

- [ ] **Step 1: Extend the test with manager caching coverage**

```ts
test("reuses cached capability snapshots until refresh", async () => {
  let calls = 0
  const manager = new CapabilityStore({
    probe: async () => {
      calls += 1
      return { ...createEmptyCapabilities(), sessionSearch: "supported" }
    },
  })

  const first = await manager.getOrProbe("ws-1")
  const second = await manager.getOrProbe("ws-1")

  assert.equal(first.sessionSearch, "supported")
  assert.equal(second.sessionSearch, "supported")
  assert.equal(calls, 1)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/capabilities.test.ts`
Expected: FAIL because `CapabilityStore` does not exist yet

- [ ] **Step 3: Implement the manager with probe injection and invalidation**

```ts
export class CapabilityStore {
  private cache = new Map<string, RuntimeCapabilities>()
  private inflight = new Map<string, Promise<RuntimeCapabilities>>()

  constructor(private deps: { probe: (workspaceId: string) => Promise<RuntimeCapabilities> }) {}

  snapshot(workspaceId: string) {
    return this.cache.get(workspaceId) ?? createEmptyCapabilities()
  }

  async getOrProbe(workspaceId: string) {
    const cached = this.cache.get(workspaceId)
    if (cached) {
      return cached
    }

    const pending = this.inflight.get(workspaceId)
    if (pending) {
      return await pending
    }

    const next = this.deps.probe(workspaceId).then((result) => {
      this.cache.set(workspaceId, result)
      this.inflight.delete(workspaceId)
      return result
    }, (err) => {
      this.inflight.delete(workspaceId)
      throw err
    })

    this.inflight.set(workspaceId, next)
    return await next
  }

  clear(workspaceId: string) {
    this.cache.delete(workspaceId)
    this.inflight.delete(workspaceId)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/test/capabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/capabilities.ts src/test/capabilities.test.ts
git commit -m "feat: add cached capability manager"
```

## Chunk 2: Editor Launch Context And Seeded Sessions

### Task 3: Build workspace-scoped launch context helpers

**Files:**
- Create: `src/core/launch-context.ts`
- Test: `src/test/launch-context.test.ts`

- [ ] **Step 1: Write failing launch context tests**

```ts
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { buildEditorSeed, buildExplorerSeed } from "../core/launch-context"

describe("launch context", () => {
  test("uses selection lines when the editor selection is not empty", () => {
    const seed = buildEditorSeed({
      workspaceDir: "/workspace",
      filePath: "/workspace/src/app.ts",
      selection: { startLine: 4, endLine: 9, empty: false },
    })

    assert.deepEqual(seed?.parts, [{
      type: "file",
      path: "src/app.ts",
      kind: "file",
      selection: { startLine: 4, endLine: 9 },
      source: { value: "@src/app.ts#4-9", start: 0, end: 14 },
    }])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/launch-context.test.ts`
Expected: FAIL because `src/core/launch-context.ts` does not exist yet

- [ ] **Step 3: Implement minimal launch context helpers**

```ts
export type LaunchSeed = {
  workspaceId: string
  dir: string
  parts: ComposerPromptPart[]
}

export function buildEditorSeed(input: {
  workspaceId: string
  workspaceDir: string
  filePath: string
  selection: { startLine: number; endLine?: number; empty: boolean }
}): LaunchSeed | undefined {
  const path = relativePath(input.workspaceDir, input.filePath)
  const selection = input.selection.empty ? undefined : {
    startLine: input.selection.startLine,
    endLine: input.selection.endLine,
  }

  return {
    workspaceId: input.workspaceId,
    dir: input.workspaceDir,
    parts: [{
      type: "file",
      path,
      kind: "file",
      selection,
      source: {
        value: selection ? `@${path}#${selection.startLine}${selection.endLine ? `-${selection.endLine}` : ""}` : `@${path}`,
        start: 0,
        end: 0,
      },
    }],
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/test/launch-context.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/launch-context.ts src/test/launch-context.test.ts
git commit -m "feat: add launch context helpers"
```

### Task 4: Wire new commands and package contributions

**Files:**
- Modify: `package.json`
- Modify: `src/core/commands.ts`
- Test: `src/test/launch-context.test.ts`

- [ ] **Step 1: Extend tests with command-level helper coverage**

```ts
test("returns undefined when the selected file is outside the workspace", () => {
  const seed = buildEditorSeed({
    workspaceId: "file:///workspace",
    workspaceDir: "/workspace",
    filePath: "/other/app.ts",
    selection: { startLine: 1, empty: true },
  })

  assert.equal(seed, undefined)
})
```

- [ ] **Step 2: Run the tests to verify the new assertion fails**

Run: `bun test src/test/launch-context.test.ts`
Expected: FAIL until out-of-workspace handling is implemented

- [ ] **Step 3: Implement commands for selection, current file, explorer files, and status bar action**

```ts
vscode.commands.registerCommand("opencode-ui.askSelection", async () => {
  const seed = seedFromActiveEditor(mgr, "selection")
  await openSeededSession(seed)
})

vscode.commands.registerCommand("opencode-ui.askCurrentFile", async () => {
  const seed = seedFromActiveEditor(mgr, "file")
  await openSeededSession(seed)
})

vscode.commands.registerCommand("opencode-ui.askExplorerFiles", async (_item, items?: vscode.Uri[]) => {
  const seed = seedFromExplorerSelection(mgr, items)
  await openSeededSession(seed)
})
```

Register these in `package.json` with:

- editor context menu entries
- editor selection context menu entries
- explorer context menu entry
- command palette visibility

- [ ] **Step 4: Re-run focused tests**

Run: `bun test src/test/launch-context.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json src/core/commands.ts src/core/launch-context.ts src/test/launch-context.test.ts
git commit -m "feat: add editor launch commands"
```

### Task 5: Queue and deliver seeded composer drafts through the panel host

**Files:**
- Modify: `src/panel/provider/index.ts`
- Modify: `src/panel/provider/controller.ts`
- Test: `src/panel/provider/controller.test.ts`

- [ ] **Step 1: Add a failing controller test for queued composer restore**

```ts
test("posts restoreComposer after the webview becomes ready", async () => {
  const current = snapshot()
  const { controller } = createHarness(current)
  controller.ready = false
  const posted: unknown[] = []
  controller.panel = {
    title: "OpenCode",
    webview: {
      postMessage: async (message: unknown) => {
        posted.push(message)
        return true
      },
    },
  }

  await controller.seedComposer([{ type: "text", text: "@src/app.ts" }])
  controller.ready = true
  await controller.flushSeedComposer()

  assert.deepEqual(posted.at(-1), {
    type: "restoreComposer",
    parts: [{ type: "text", text: "@src/app.ts" }],
  })
})
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `bun test src/panel/provider/controller.test.ts`
Expected: FAIL because seed queue helpers do not exist yet

- [ ] **Step 3: Implement panel seeding without touching the reducer path**

```ts
class SessionPanelController {
  private pendingComposerParts: ComposerPromptPart[] | undefined

  async seedComposer(parts: ComposerPromptPart[]) {
    this.pendingComposerParts = parts
    await this.flushSeedComposer()
  }

  async flushSeedComposer() {
    if (!this.ready || !this.pendingComposerParts?.length) {
      return
    }

    const parts = this.pendingComposerParts
    this.pendingComposerParts = undefined
    await postToWebview(this.panel.webview, {
      type: "restoreComposer",
      parts,
    })
  }
}
```

Call `flushSeedComposer()` after the webview `ready` message and after the initial push completes.

Expose a matching helper from `SessionPanelManager` so command handlers can open a panel and then seed it.

- [ ] **Step 4: Re-run the targeted test**

Run: `bun test src/panel/provider/controller.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/panel/provider/index.ts src/panel/provider/controller.ts src/panel/provider/controller.test.ts
git commit -m "feat: seed composer when opening sessions"
```

## Chunk 3: Status Bar Integration

### Task 6: Add a status bar controller with deterministic state derivation

**Files:**
- Create: `src/core/status-bar.ts`
- Test: `src/test/status-bar.test.ts`

- [ ] **Step 1: Write failing status bar derivation tests**

```ts
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { deriveStatusBarState } from "../core/status-bar"

describe("status bar", () => {
  test("shows busy active session state first", () => {
    const state = deriveStatusBarState({
      activeSessionTitle: "Review auth flow",
      activeSessionBusy: true,
      runtimeState: "ready",
    })

    assert.equal(state.text.includes("Review auth flow"), true)
    assert.equal(state.busy, true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/test/status-bar.test.ts`
Expected: FAIL because `src/core/status-bar.ts` does not exist yet

- [ ] **Step 3: Implement a minimal status bar derivation helper and controller**

```ts
export function deriveStatusBarState(input: {
  activeSessionTitle?: string
  activeSessionBusy?: boolean
  runtimeState?: "starting" | "ready" | "error" | "stopped"
}) {
  if (input.activeSessionTitle) {
    return {
      text: `${input.activeSessionBusy ? "$(loading~spin)" : "$(comment-discussion)"} OpenCode ${input.activeSessionTitle}`,
      command: "opencode-ui.statusBarAction",
      busy: !!input.activeSessionBusy,
    }
  }

  if (input.runtimeState === "starting") {
    return { text: "$(sync) OpenCode starting", command: "opencode-ui.statusBarAction", busy: false }
  }

  return { text: "$(comment-discussion) OpenCode", command: "opencode-ui.statusBarAction", busy: false }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/test/status-bar.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/status-bar.ts src/test/status-bar.test.ts
git commit -m "feat: add opencode status bar"
```

### Task 7: Wire the status bar and capability store into extension activation

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/core/commands.ts`
- Modify: `src/core/status-bar.ts`
- Modify: `src/core/capabilities.ts`
- Test: `src/test/status-bar.test.ts`

- [ ] **Step 1: Extend the status bar test with command routing and fallback coverage**

```ts
test("falls back to quick session when there is no active panel", () => {
  const state = deriveStatusBarState({
    runtimeState: "ready",
  })

  assert.equal(state.command, "opencode-ui.statusBarAction")
})
```

- [ ] **Step 2: Run the test to verify the new assertion fails if needed**

Run: `bun test src/test/status-bar.test.ts`
Expected: FAIL if the status bar state does not expose a stable command target yet

- [ ] **Step 3: Instantiate and dispose the new controllers in `activate()`**

```ts
const capabilities = new CapabilityStore({ probe: ... })
const statusBar = new OpenCodeStatusBar(mgr, panels, sessions, out)

commands(ctx, mgr, sessions, out, tabs, panels, capabilities)

ctx.subscriptions.push(capabilities, statusBar)
```

Also add the `opencode-ui.statusBarAction` command so clicking the status bar:

- opens the active session if available
- otherwise creates a quick session in the active editor workspace
- otherwise reveals the OpenCode session view

- [ ] **Step 4: Run the focused tests**

Run: `bun test src/test/capabilities.test.ts`
Expected: PASS

Run: `bun test src/test/launch-context.test.ts`
Expected: PASS

Run: `bun test src/test/status-bar.test.ts`
Expected: PASS

Run: `bun test src/panel/provider/controller.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts src/core/commands.ts src/core/status-bar.ts src/core/capabilities.ts src/test/status-bar.test.ts
git commit -m "feat: wire m1 launch and status entry"
```

## Chunk 4: Verification And Documentation

### Task 8: Run the project validation suite and document the new entry points

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README usage sections**

Add concise notes for:

- editor context launch
- explorer context launch
- status bar entry

- [ ] **Step 2: Run the project validation suite**

Run: `bun run check-types`
Expected: PASS

Run: `bun run lint`
Expected: PASS

Run: `bun run test`
Expected: PASS

Run: `bun run compile`
Expected: PASS

- [ ] **Step 3: Smoke test in VS Code**

Manual checks:

- Right-click a selection and launch OpenCode
- Use current-file launch with no selection
- Launch from explorer with multiple files
- Confirm the composer is prefilled but unsent
- Confirm the status bar entry opens the right target
- Confirm existing new session commands still work

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document m1 launch workflow"
```

## Notes For Execution

- Keep the implementation additive and avoid moving existing command or panel responsibilities unless necessary
- Reuse the existing `restoreComposer` host message instead of inventing a new prefill protocol
- Do not change AGENTS guidance files
- Prefer new helper files in `src/core/` over making `src/core/commands.ts` grow further
- Treat capability probes as non-fatal telemetry; unsupported should hide future UI, not block startup

## Manual Review Note

The superpowers plan-reviewer subagent step is not included in this document because this session is not currently using delegated subagents. Review the plan manually before execution.

Plan complete and saved to `docs/superpowers/plans/2026-04-12-opencode-ui-m1.md`. Ready to execute?
