# OpenCode UI Panel Theme System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add panel light-theme support plus selectable `default`, `codex`, and `claude` panel presets without changing the existing panel layout model.

**Architecture:** Extend the existing display-settings pipeline so `panelTheme` flows from VS Code configuration into panel snapshots and the webview root. Rebuild `src/panel/webview/theme.css` around semantic tokens, then update existing panel CSS files to consume those tokens while preserving current structural responsibilities.

**Tech Stack:** TypeScript, Bun, VS Code extension APIs, React TSX webviews, CSS.

---

## File Map

### Existing files expected to change

- Modify: `package.json`
- Modify: `src/core/settings.ts`
- Modify: `src/bridge/types.ts`
- Modify: `src/panel/provider/snapshot.ts`
- Modify: `src/panel/webview/app/state.ts`
- Modify: `src/panel/webview/app/App.tsx`
- Modify: `src/panel/webview/theme.css`
- Modify: `src/panel/webview/base.css`
- Modify: `src/panel/webview/layout.css`
- Modify: `src/panel/webview/timeline.css`
- Modify: `src/panel/webview/dock.css`
- Modify: `src/panel/webview/status.css`
- Modify: `src/panel/webview/tool.css`
- Modify: `src/panel/webview/diff.css`
- Modify: `src/panel/webview/markdown.css`

### Existing tests expected to change

- Modify: `src/panel/shared/session-reducer.test.ts`
- Modify: `src/panel/webview/app/state.test.ts`

### New tests likely needed

- Create: `src/test/panel-theme.test.ts`

### Notes

- Preserve unrelated local modifications already present in:
  - `src/panel/webview/app/App.tsx`
  - `src/panel/webview/status.css`
- Do not change sidebar preset behavior in this slice.

## Chunk 1: Settings And Snapshot Plumbing

### Task 1: Add failing tests for the new display setting

**Files:**
- Modify: `src/panel/shared/session-reducer.test.ts`
- Modify: `src/panel/webview/app/state.test.ts`
- Create: `src/test/panel-theme.test.ts`

- [ ] **Step 1: Extend reducer snapshot fixtures with `panelTheme`**

Update `src/panel/shared/session-reducer.test.ts` fixture builders so `DisplaySettings` includes:

```ts
panelTheme: "default"
```

This keeps existing tests compiling once the type is expanded.

- [ ] **Step 2: Add a state test for the default panel theme**

In `src/panel/webview/app/state.test.ts`, add a test that `createInitialState(...)` falls back to:

```ts
display: {
  showInternals: false,
  showThinking: true,
  diffMode: "unified",
  compactSkillInvocations: true,
  panelTheme: "default",
}
```

- [ ] **Step 3: Add a state test for snapshot normalization**

Cover:

- snapshot with `panelTheme: "codex"` preserves `codex`
- snapshot without `panelTheme` falls back to `default`

- [ ] **Step 4: Add a settings-level failing test file**

Create `src/test/panel-theme.test.ts` covering:

- `getDisplaySettings()` returns `panelTheme`
- invalid config values normalize to `default`
- `affectsDisplaySettings()` returns true for `opencode-ui.panelTheme`

- [ ] **Step 5: Run the targeted tests to verify they fail**

Run: `bun test src/panel/shared/session-reducer.test.ts src/panel/webview/app/state.test.ts src/test/panel-theme.test.ts`

Expected: FAIL for missing `panelTheme` typing, missing normalization, or missing settings support.

### Task 2: Implement the `panelTheme` setting and snapshot flow

**Files:**
- Modify: `package.json`
- Modify: `src/core/settings.ts`
- Modify: `src/bridge/types.ts`
- Modify: `src/panel/provider/snapshot.ts`
- Modify: `src/panel/webview/app/state.ts`

- [ ] **Step 1: Add the VS Code setting contribution**

In `package.json`, contribute:

- `opencode-ui.panelTheme`
- enum values: `default`, `codex`, `claude`
- default: `default`
- description: preset selector only, light or dark still follows VS Code

- [ ] **Step 2: Expand the display settings type**

In `src/core/settings.ts`:

- add `export type PanelTheme = "default" | "codex" | "claude"`
- extend `DisplaySettings` with `panelTheme: PanelTheme`
- add a small normalizer that returns `default` for unknown values

- [ ] **Step 3: Read and watch the new setting**

Update:

- `getDisplaySettings()`
- `affectsDisplaySettings()`

to include `panelTheme`.

- [ ] **Step 4: Thread the new field through panel state**

In `src/panel/webview/app/state.ts`:

- add `panelTheme: "default"` to the initial fallback
- preserve the value in snapshot normalization
- default old snapshots to `default`

- [ ] **Step 5: Keep bridge types compiling cleanly**

Update any affected `DisplaySettings` references in:

- `src/bridge/types.ts`
- `src/panel/provider/snapshot.ts`

Do not introduce a new host message shape; continue using `display`.

- [ ] **Step 6: Re-run the targeted tests**

Run: `bun test src/panel/shared/session-reducer.test.ts src/panel/webview/app/state.test.ts src/test/panel-theme.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the plumbing slice**

```bash
git add package.json src/core/settings.ts src/bridge/types.ts src/panel/provider/snapshot.ts src/panel/webview/app/state.ts src/panel/shared/session-reducer.test.ts src/panel/webview/app/state.test.ts src/test/panel-theme.test.ts
git commit -m "feat: add panel theme setting plumbing"
```

## Chunk 2: Webview Root And Theme Token System

### Task 3: Add a failing root-attribute test and wire the webview root

**Files:**
- Create: `src/test/panel-theme.test.ts`
- Modify: `src/panel/webview/app/App.tsx`

- [ ] **Step 1: Add a failing render-level assertion**

In `src/test/panel-theme.test.ts`, render or inspect the panel shell path and assert that the root shell includes:

```html
data-oc-theme="codex"
```

for a snapshot using `panelTheme: "codex"`.

If a full `App` render is too expensive, extract and test a tiny helper that returns the normalized theme attribute value.

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `bun test src/test/panel-theme.test.ts`

Expected: FAIL because the panel root does not yet expose the theme preset.

- [ ] **Step 3: Add the theme attribute to the panel shell**

In `src/panel/webview/app/App.tsx`:

- attach `data-oc-theme={state.snapshot.display.panelTheme ?? "default"}` to `.oc-shell`
- keep the change localized to the outer shell
- do not disturb unrelated local edits already present in this file

- [ ] **Step 4: Re-run the targeted test**

Run: `bun test src/test/panel-theme.test.ts`

Expected: PASS.

### Task 4: Rebuild `theme.css` around semantic tokens

**Files:**
- Modify: `src/panel/webview/theme.css`

- [ ] **Step 1: Audit the current token surface**

List the existing variables in `src/panel/webview/theme.css` and group them into:

- surface and text
- border and interaction
- transcript and message treatment
- composer treatment
- markdown and diff support
- shape tokens

- [ ] **Step 2: Write the new base token layer**

In `src/panel/webview/theme.css`, define semantic variables for:

- `--oc-canvas`
- `--oc-surface-*`
- `--oc-text-*`
- `--oc-border-*`
- `--oc-hover-*`
- `--oc-composer-*`
- `--oc-radius-*`
- `--oc-space-*`

Keep compatibility aliases where that reduces churn in downstream CSS.

- [ ] **Step 3: Add dark and light branches for `default`**

Replace the current `color-scheme: dark` assumption with:

- dark tokens for current default look
- explicit light tokens for the same preset

Use VS Code webview theme signals rather than a second extension setting.

- [ ] **Step 4: Add `codex` and `claude` preset overrides**

Define both dark and light token variants for:

- `[data-oc-theme="codex"]`
- `[data-oc-theme="claude"]`

Differences should stay within:

- color hierarchy
- border strength
- radius
- spacing feel
- composer treatment

- [ ] **Step 5: Keep `theme.css` token-only**

Do not move component structure rules here. If a selector change is unavoidable, keep it narrowly tied to token exposure only.

- [ ] **Step 6: Sanity-check the stylesheet build**

Run: `bun run check-types`

Expected: PASS, since CSS changes should not affect TypeScript compilation.

- [ ] **Step 7: Commit the root and token slice**

```bash
git add src/panel/webview/app/App.tsx src/panel/webview/theme.css src/test/panel-theme.test.ts
git commit -m "feat: add panel theme tokens and root preset"
```

## Chunk 3: Component CSS Migration And Verification

### Task 5: Replace critical hardcoded panel visuals with theme tokens

**Files:**
- Modify: `src/panel/webview/base.css`
- Modify: `src/panel/webview/layout.css`
- Modify: `src/panel/webview/timeline.css`
- Modify: `src/panel/webview/dock.css`
- Modify: `src/panel/webview/status.css`
- Modify: `src/panel/webview/tool.css`
- Modify: `src/panel/webview/diff.css`
- Modify: `src/panel/webview/markdown.css`

- [ ] **Step 1: Find hardcoded panel visuals**

Run:

```bash
rg -n "#|rgb\\(|color-scheme: dark|background: #|color: #" src/panel/webview
```

Use the result to target only panel-critical hardcoded values.

- [ ] **Step 2: Migrate root and layout surfaces**

Update `base.css` and `layout.css` to use semantic tokens for:

- page background
- footer background
- shared block surfaces
- border and hover behavior

- [ ] **Step 3: Migrate transcript, dock, and status surfaces**

Update:

- `timeline.css`
- `dock.css`
- `status.css`

to use tokens for:

- user turns
- assistant parts
- warning and question cards
- status accents and hover states

- [ ] **Step 4: Migrate markdown, tool, and diff contrast**

Update:

- `markdown.css`
- `tool.css`
- `diff.css`

to ensure light-mode readability for:

- headings
- inline code
- code blocks
- diff added and removed colors
- tool panels and pills

- [ ] **Step 5: Keep layout structure unchanged**

Before moving on, verify no selector change introduces:

- composer relocation
- transcript column changes
- major turn alignment changes

- [ ] **Step 6: Run the focused automated checks**

Run: `bun test src/test/panel-theme.test.ts src/panel/webview/app/state.test.ts src/panel/shared/session-reducer.test.ts src/test/panel-density.test.ts`

Expected: PASS.

### Task 6: Run repo validation and complete the slice

**Files:**
- Modify: `docs/superpowers/plans/2026-04-15-opencode-ui-panel-theme.md`

- [ ] **Step 1: Run full validation**

Run: `bun run check-types && bun run lint && bun run compile`

Expected: PASS.

- [ ] **Step 2: Do manual theme verification**

Check these combinations in VS Code:

- dark + `default`
- dark + `codex`
- dark + `claude`
- light + `default`
- light + `codex`
- light + `claude`

Inspect:

- empty state
- transcript
- user messages
- tool blocks
- docks
- composer
- markdown
- diff

- [ ] **Step 3: Update the plan checkboxes as work completes**

Mark completed steps in this plan file so handoff remains accurate.

- [ ] **Step 4: Commit the CSS migration slice**

```bash
git add src/panel/webview/base.css src/panel/webview/layout.css src/panel/webview/timeline.css src/panel/webview/dock.css src/panel/webview/status.css src/panel/webview/tool.css src/panel/webview/diff.css src/panel/webview/markdown.css docs/superpowers/plans/2026-04-15-opencode-ui-panel-theme.md
git commit -m "feat: add panel light mode and presets"
```

- [ ] **Step 5: Prepare handoff notes**

Record:

- any areas where preset differences still feel too subtle
- any remaining hardcoded values intentionally deferred
- any manual verification gaps if a specific VS Code theme was unavailable
