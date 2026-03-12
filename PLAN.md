# OpenCode UI Plan

## Switch Model TUI Parity Roadmap

### Goal

Bring session model switching in the VS Code extension close to the upstream TUI behavior, especially around state ownership, picker structure, submission semantics, and session rehydration.

### Upstream Implementation Summary

The upstream TUI does not treat switch model as a standalone server-side session toggle. It is primarily local prompt state that affects later actions.

- entry action is registered in `opencode/packages/opencode/src/cli/cmd/tui/app.tsx`
- model picker UI lives in `opencode/packages/opencode/src/cli/cmd/tui/component/dialog-model.tsx`
- local persisted model state lives in `opencode/packages/opencode/src/cli/cmd/tui/context/local.tsx`
- prompt submission reads the active model and variant in `opencode/packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`
- session re-entry restores model state from the latest user message in `opencode/packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`

### Upstream Behavior To Mirror

#### State Model

The TUI keeps these concerns separate:

- per-agent manual model override
- recent model MRU list capped at 10
- favorite model list
- per-model variant selection

Effective model precedence in the TUI:

1. per-agent manual override
2. agent-configured model
3. fallback model

Fallback resolution in the TUI prefers:

1. CLI `--model`
2. config `model`
3. first valid recent model
4. first provider default model
5. first model from the first provider

#### Picker Behavior

- opening the picker preselects the current effective model
- sections are ordered as `Favorites`, `Recent`, then provider groups
- models already shown in favorites or recents are removed from later provider sections
- deprecated or disabled models are not offered for selection
- selecting a model updates local selection state and recent models
- variants are managed independently from the base model choice
- when no providers are connected, submit is blocked and the provider-connect flow is surfaced

#### Submission Behavior

- normal prompt submit sends `providerID`, `modelID`, and current `variant`
- slash-command submission also carries model and variant
- shell execution carries model but not variant
- summarize uses the currently selected model
- the new choice only affects future actions; old messages do not change retroactively

#### Rehydration Behavior

- reopening a session restores model and variant from the latest user message metadata
- if the user changes model locally but has not submitted yet, the local unsent selection remains the visible current choice

### Existing Extension Integration Points

The current extension already has most of the transport and display hooks needed for this feature.

- provider and configured-model snapshot assembly: `src/panel/provider/snapshot.ts`
- bridge snapshot types with model-related fields: `src/bridge/types.ts`
- composer identity and current effective model helpers: `src/panel/webview/app/App.tsx`, `src/panel/webview/lib/session-meta.ts`
- submit and composer-action routing: `src/panel/provider/controller.ts`, `src/panel/provider/actions.ts`
- SDK calls that already accept per-request model input: `src/core/sdk.ts`

### Design Direction

To stay aligned with the TUI, the extension should implement switch model as session-local panel state that is rehydrated from message history.

Do not introduce a new host-side long-lived session model setting unless later parity work proves it is necessary.

That means:

- choose a model locally in the panel
- use that selection for subsequent submit, command, compact, and summarize flows
- restore the visible current model from latest session history when reopening or refreshing
- keep override, recents, favorites, and variants as distinct state buckets

---

## Phase H - Introduce Session-Local Model State

Status: planned

### Objective

Add the same core model-state primitives the TUI relies on.

### Scope

- add session-local model override state in the webview
- make override state agent-aware rather than one flat current-model value
- add state buckets for recent models, favorite models, and per-model variants
- update effective model resolution to follow TUI precedence as closely as local extension data allows

### Files Most Likely To Change

- `src/panel/webview/app/state.ts`
- `src/panel/webview/lib/session-meta.ts`
- `src/panel/webview/lib/session-meta.test.ts`

### Acceptance Criteria

- composer model resolution prefers manual override over agent default and fallback
- the state layer can represent recents, favorites, and variants independently
- existing submit behavior does not change when no override exists

---

## Phase I - Build A TUI-Shaped Model Picker

Status: planned

### Objective

Add a panel-local model picker that follows the TUI information architecture closely.

### Scope

- open the picker from the composer model chip
- add a `/model` command entry in the composer flow
- preselect the current effective model when the picker opens
- render sections in TUI order: favorites, recents, then provider groups
- deduplicate models across sections
- hide disabled or deprecated models when current provider metadata can identify them

### Files Most Likely To Change

- `src/panel/webview/app/App.tsx`
- `src/panel/webview/app/composer-menu.ts`
- `src/panel/webview/status.css`
- `src/panel/webview/app/model-picker.tsx`

### Acceptance Criteria

- users can open and close the picker entirely inside the panel webview
- the current model is visibly preselected on open
- selecting a model updates local composer state immediately
- section ordering and deduplication stay stable across refreshes

---

## Phase J - Route The Current Model Through All Relevant Actions

Status: planned

### Objective

Make every relevant composer-driven action use the active model selection.

### Scope

- keep normal prompt submit wired to the active selected model
- ensure model-aware composer actions use the same current value
- make compact and summarize follow the active selection
- carry variant where upstream behavior expects it
- avoid adding a separate set-session-model RPC unless later parity work truly needs it

### Files Most Likely To Change

- `src/bridge/types.ts`
- `src/panel/provider/controller.ts`
- `src/panel/provider/actions.ts`
- `src/core/sdk.ts`

### Acceptance Criteria

- submit uses the currently selected provider and model every time
- compact and summarize use the same model source of truth
- variant is included where the current SDK path supports it

---

## Phase K - Rehydrate From Session History

Status: planned

### Objective

Restore the active session model from what the user last actually sent, matching TUI behavior.

### Scope

- inspect the latest user-message metadata for `providerID`, `modelID`, and `variant`
- restore visible composer model state when the panel reopens or session data refreshes
- preserve unsent local selection until a real message supersedes it
- keep restoration logic centralized instead of scattering it through render paths

### Files Most Likely To Change

- `src/panel/webview/lib/session-meta.ts`
- `src/panel/webview/app/App.tsx`
- `src/panel/webview/app/state.ts`

### Acceptance Criteria

- reopening an existing session restores the last actually used model
- unsent local changes remain visible until a newer sent message replaces them
- composer identity and submission logic remain synchronized after refreshes

---

## Phase L - Close Remaining TUI Parity Gaps

Status: planned

### Objective

Finish the remaining model-specific parity work after the base flow is stable.

### Scope

- add variant selection or cycling UI backed by per-model variant state
- persist and cap recent models at 10 like the TUI
- add favorites toggling and favorites-first picker rendering
- evaluate whether the panel should surface provider-connect flow directly from the picker when no providers are available

### Files Most Likely To Change

- `src/panel/webview/app/model-picker.tsx`
- `src/panel/webview/app/App.tsx`
- `src/panel/webview/app/state.ts`
- `src/core/commands.ts`

### Acceptance Criteria

- recent models behave as a stable deduped MRU list capped at 10
- favorites and variants no longer require state-model redesign later
- the no-provider path degrades clearly and guides the user toward connecting a provider

---

## Validation

For each phase, validate with:

- `bun run check-types`
- `bun run lint`
- `bun run compile`

### Suggested Manual Verification Matrix

- open the picker with at least two providers and confirm current-model preselection
- switch models and verify the composer identity updates before submit
- submit two consecutive messages with two different models and verify history reflects the change
- reopen a session and confirm the model restores from the latest user message
- run compact with a non-default model selected and verify it follows the active selection
- verify fallback behavior when there are no manual overrides
- verify degraded behavior when no providers or no valid models are available

### Recommended Execution Order

1. Phase H
2. Phase I
3. Phase J
4. Phase K
5. Phase L
