# OpenCode UI Transport Convergence Completion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining panel transport convergence work and close out lightweight docs follow-up for shipped sidebar search and organization features.

**Architecture:** Keep the implementation centered on the existing panel controller and webview state reconciliation code. Prefer additive tests and narrow controller changes over broad refactors, and treat shipped search and organization behavior as documentation-only unless verification proves otherwise.

**Tech Stack:** TypeScript, VS Code extension APIs, React webview state hooks, Bun test runner, Node test assertions

---

## File Map

### Modified files

- `src/panel/provider/controller.ts`
  - Narrow refresh gating, codify fallback reasons, and keep transcript events incremental through subtree refresh windows where safe
- `src/panel/provider/controller.test.ts`
  - Lock the controller transport matrix and fallback-window behavior
- `src/panel/webview/app/state.ts`
  - Preserve transcript references when full snapshots contain unchanged transcript content
- `src/panel/webview/hooks/useHostMessages.test.ts`
  - Cover metadata-only snapshot reconciliation and late snapshot behavior
- `README.md`
  - Apply minimal wording updates only if verification shows shipped features are under-documented
- `docs/superpowers/plans/2026-04-12-opencode-ui-session-search.md`
  - Add a completion note if it is still missing
- `docs/superpowers/plans/2026-04-13-opencode-ui-session-organization.md`
  - Add a completion or in-progress note that matches the shipped state after verification

## Chunk 1: Lock The Transport Contract In Tests

### Task 1: Add failing controller tests for remaining transport matrix gaps

**Files:**
- Modify: `src/panel/provider/controller.test.ts`

- [ ] **Step 1: Write failing tests for the missing routing cases**

Add targeted coverage for:

- `session.diff` staying incremental
- `question.*` staying incremental and marking deferred state dirty
- message events remaining incremental while a refresh promise is present but transcript state is still safe to update
- explicit fallback reasons for child-panel navigation-sensitive topology refreshes and under-hydrated reparent-in refreshes

- [ ] **Step 2: Run the targeted test file to verify red**

Run: `bun test src/panel/provider/controller.test.ts`
Expected: FAIL because the new routing expectations are not fully implemented yet

- [ ] **Step 3: Implement the minimal controller changes to satisfy the new tests**

Keep the change surface inside `controller.ts` and prefer helper extraction over new state systems unless a helper is insufficient.

- [ ] **Step 4: Re-run the targeted controller tests**

Run: `bun test src/panel/provider/controller.test.ts`
Expected: PASS

## Chunk 2: Remove Avoidable Refresh-Window Snapshot Fallback

### Task 2: Add failing tests for refresh-window transcript behavior

**Files:**
- Modify: `src/panel/provider/controller.test.ts`

- [ ] **Step 1: Add failing refresh-window coverage**

Add tests showing:

- `message.updated`
- `message.part.updated`
- `message.part.removed`
- `message.part.delta`

stay incremental while subtree metadata refresh is in progress, as long as the current transcript state is available locally.

- [ ] **Step 2: Run the targeted test file to verify red**

Run: `bun test src/panel/provider/controller.test.ts`
Expected: FAIL because current refresh gating still allows avoidable snapshot fallback in some windows

- [ ] **Step 3: Implement the narrow refresh-readiness change**

Update `controller.ts` so transcript readiness is tracked independently from subtree metadata or deferred state readiness, while preserving the existing forced-refresh paths that remain valid.

- [ ] **Step 4: Re-run the targeted controller tests**

Run: `bun test src/panel/provider/controller.test.ts`
Expected: PASS

## Chunk 3: Strengthen Snapshot Reconciliation In The Webview

### Task 3: Add failing webview tests for metadata-only snapshots and late snapshots

**Files:**
- Modify: `src/panel/webview/hooks/useHostMessages.test.ts`
- Modify: `src/panel/webview/app/state.ts`

- [ ] **Step 1: Add failing reconciliation tests**

Cover:

- metadata-only snapshot updates preserving unchanged `messages` references
- metadata-only snapshot updates preserving unchanged `childMessages` list references
- a late full snapshot preserving newer transcript content when the transcript payload is logically unchanged

- [ ] **Step 2: Run the targeted test file to verify red**

Run: `bun test src/panel/webview/hooks/useHostMessages.test.ts`
Expected: FAIL because current reconciliation does not cover every allowed identity-preservation case

- [ ] **Step 3: Implement the minimal reconciliation helpers**

Adjust `normalizeSnapshotPayload` and its helpers only as far as needed to preserve identity for unchanged transcript structures without mutating incoming payload objects.

- [ ] **Step 4: Re-run the targeted webview tests**

Run: `bun test src/panel/webview/hooks/useHostMessages.test.ts`
Expected: PASS

## Chunk 4: Close Out Documentation And Full Verification

### Task 4: Verify shipped search and organization work, then update docs minimally

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-04-12-opencode-ui-session-search.md`
- Modify: `docs/superpowers/plans/2026-04-13-opencode-ui-session-organization.md`

- [ ] **Step 1: Confirm whether README or plan status notes are still missing**

Only edit docs that are actually stale after implementation and verification.

- [ ] **Step 2: Apply the smallest documentation updates**

Prefer short completion notes or wording tweaks over broader rewrites.

- [ ] **Step 3: Run focused and repo-wide verification**

Run: `bun test src/panel/provider/controller.test.ts src/panel/webview/hooks/useHostMessages.test.ts`
Expected: PASS

Run: `bun run test`
Expected: PASS

Run: `bun run check-types`
Expected: PASS

Run: `bun run lint`
Expected: PASS

Run: `bun run compile`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/panel/provider/controller.ts src/panel/provider/controller.test.ts src/panel/webview/app/state.ts src/panel/webview/hooks/useHostMessages.test.ts README.md docs/superpowers/plans/2026-04-12-opencode-ui-session-search.md docs/superpowers/plans/2026-04-13-opencode-ui-session-organization.md
git commit -m "fix: complete transport convergence follow-up"
```

Plan complete and saved to `docs/superpowers/plans/2026-04-13-opencode-ui-transport-convergence-completion.md`. Ready to execute?
