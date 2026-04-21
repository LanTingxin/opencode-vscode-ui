# OpenCode UI Codex Tool Activity Summary Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Codex theme assistant tool activity render as a compact, expandable summary that feels closer to real Codex while reusing the existing detailed tool views.

**Architecture:** Keep the current timeline block derivation model intact and add a Codex-only assistant activity summary layer on top of existing assistant tool parts. Reuse current tool panels and `CollapsibleShellBlock` for expanded content, while teaching the timeline to compute compact activity counts and default-collapsed rows for read/search/command style tools.

**Tech Stack:** TypeScript, Bun, React TSX webviews, CSS, VS Code extension webview tests.

---

## File Map

### Existing files expected to change

- Modify: `src/panel/webview/app/timeline.tsx`
- Modify: `src/panel/webview/app/timeline.test.ts`
- Modify: `src/panel/webview/app/timeline-render.test.tsx`
- Modify: `src/panel/webview/app/webview-bindings.tsx`
- Modify: `src/panel/webview/app/tool-rows.tsx`
- Modify: `src/panel/webview/lib/tool-meta.ts`
- Modify: `src/panel/webview/timeline.css`
- Modify: `src/panel/webview/tool.css`
- Modify: `src/test/panel-theme.test.ts`

### Existing files to read carefully before editing

- Read: `src/panel/webview/renderers/CollapsibleShellBlock.tsx`
- Read: `src/panel/webview/tools/ToolTextPanel.tsx`
- Read: `src/panel/webview/tools/ToolFilesPanel.tsx`

### Notes

- Do not change non-Codex theme rendering semantics unless tests prove the shared path is already affected.
- Preserve current assistant metadata ordering: user prompt -> assistant text/tool parts -> assistant meta.
- Keep the implementation additive and avoid introducing a new host/webview protocol shape.

## Chunk 1: Red Tests For Codex Activity Summaries

### Task 1: Cover summary derivation and Codex-only rendering

**Files:**
- Modify: `src/panel/webview/app/timeline.test.ts`
- Modify: `src/panel/webview/app/timeline-render.test.tsx`
- Modify: `src/test/panel-theme.test.ts`

- [ ] **Step 1: Add a failing derivation test for assistant tool summaries**

In `src/panel/webview/app/timeline.test.ts`, add a focused test that builds one assistant message with `read`, `glob`, `grep`, and `bash` parts and expects a compact summary block or summary metadata representing:

- explored file count
- search count
- command count

Do not assert final copy text yet; assert the normalized summary data shape that the UI will consume.

- [ ] **Step 2: Add a failing render test for default-collapsed Codex activity**

In `src/panel/webview/app/timeline-render.test.tsx`, render `Timeline` with `panelTheme="codex"` and a message containing assistant text plus tool parts. Assert:

- the compact summary row renders
- the detailed command body is hidden by default
- a toggle affordance is present

- [ ] **Step 3: Add a failing non-Codex render guard**

In the same render test file, assert that `panelTheme="default"` or `panelTheme="claude"` still renders the existing assistant tool rows rather than the new compact Codex summary treatment.

- [ ] **Step 4: Add failing theme-hook assertions**

In `src/test/panel-theme.test.ts`, assert new Codex hooks exist in `timeline.css` and `tool.css` for the activity summary row, collapsed command presentation, and toggle alignment.

- [ ] **Step 5: Run the targeted tests to verify red**

Run: `bun test src/panel/webview/app/timeline.test.ts src/panel/webview/app/timeline-render.test.tsx src/test/panel-theme.test.ts`

Expected: FAIL because summary data, Codex render path, and theme hooks do not exist yet.

## Chunk 2: Minimal Implementation

### Task 2: Derive summary groups without changing host data flow

**Files:**
- Modify: `src/panel/webview/app/timeline.tsx`
- Modify: `src/panel/webview/lib/tool-meta.ts`

- [ ] **Step 1: Add helper classification for compact Codex activity**

In `src/panel/webview/lib/tool-meta.ts`, add a minimal helper set for:

- classifying read and list style exploration tools
- classifying grep and glob style search tools
- classifying shell command tools

Keep this helper local to existing tool metadata concerns and avoid a large new abstraction.

- [ ] **Step 2: Extend timeline derivation with summary metadata**

In `src/panel/webview/app/timeline.tsx`, add a Codex-only helper that scans consecutive assistant tool parts and produces:

- count summary text
- the underlying parts that belong to the summary group
- stable keys so existing memoization remains effective

Do not alter the outer message grouping model.

- [ ] **Step 3: Preserve existing assistant part rendering for non-Codex themes**

Keep the current render path untouched for `default` and `claude`. The new summary logic should only activate when `panelTheme === "codex"`.

- [ ] **Step 4: Run the targeted tests**

Run: `bun test src/panel/webview/app/timeline.test.ts src/panel/webview/app/timeline-render.test.tsx`

Expected: summary-shape tests pass or move to the next missing UI assertion.

### Task 3: Reuse existing detailed views behind a compact Codex row

**Files:**
- Modify: `src/panel/webview/app/timeline.tsx`
- Modify: `src/panel/webview/app/webview-bindings.tsx`
- Modify: `src/panel/webview/app/tool-rows.tsx`
- Modify: `src/panel/webview/timeline.css`
- Modify: `src/panel/webview/tool.css`
- Modify: `src/test/panel-theme.test.ts`

- [ ] **Step 1: Add the expandable summary row component path**

Render a compact Codex summary row that:

- appears between assistant text and assistant meta
- defaults to collapsed
- toggles open in place
- reuses current tool renderers for expanded content

- [ ] **Step 2: Reuse existing shell and tool detail components**

Avoid duplicating command and file rendering. When expanded, show the already-supported tool detail views or shell block content from the current renderer path.

- [ ] **Step 3: Add Codex-specific styling**

In `src/panel/webview/timeline.css` and `src/panel/webview/tool.css`, add minimal Codex-only rules for:

- compact single-line summary spacing
- right-aligned toggle affordance
- collapsed command block polish
- expanded detail indentation and border treatment

Keep existing Claude chain connectors and default theme rules unchanged.

- [ ] **Step 4: Re-run the targeted tests**

Run: `bun test src/panel/webview/app/timeline.test.ts src/panel/webview/app/timeline-render.test.tsx src/test/panel-theme.test.ts`

Expected: PASS.

## Chunk 3: Regression Validation

### Task 4: Verify the feature and shared panel paths stay healthy

**Files:**
- Modify only if a regression fix is required during verification.

- [ ] **Step 1: Run the focused webview tests**

Run: `bun test src/panel/webview/app/timeline.test.ts src/panel/webview/app/timeline-render.test.tsx src/test/panel-theme.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the standard repository test suite**

Run: `bun run test`

Expected: PASS.

- [ ] **Step 3: Run compile validation**

Run: `bun run compile`

Expected: PASS.

- [ ] **Step 4: Review the diff for file churn**

Run: `git diff -- src/panel/webview/app/timeline.tsx src/panel/webview/app/timeline.test.ts src/panel/webview/app/timeline-render.test.tsx src/panel/webview/app/webview-bindings.tsx src/panel/webview/app/tool-rows.tsx src/panel/webview/lib/tool-meta.ts src/panel/webview/timeline.css src/panel/webview/tool.css src/test/panel-theme.test.ts docs/superpowers/plans/2026-04-21-opencode-ui-codex-tool-activity-summary.md`

Expected: only intended files changed.
