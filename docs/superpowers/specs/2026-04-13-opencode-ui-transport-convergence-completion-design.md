# OpenCode UI Transport Convergence Completion Design

## Goal

Finish the remaining panel host and webview transport convergence work so normal session activity stays incremental, full `snapshot` refreshes are rare and explicit, and the recently shipped sidebar search and organization slices receive only documentation and verification follow-up instead of broader feature expansion.

## Scope

This slice includes:

1. Transport contract codification for `snapshot`, `sessionEvent`, `deferredUpdate`, and `submitting`
2. Controller and webview regression coverage for fallback windows and snapshot reconciliation
3. Smaller refresh windows during subtree metadata refresh
4. Additional safe incremental handling for session tree topology updates
5. Verification and documentation cleanup for the already-shipped session search and session organization work

This slice does not include:

- Inline editor chat
- Sending context into an already-open session
- Global session search
- Global task inbox aggregation
- Diff accept or reject workflows
- New server-backed metadata features

## Product Decisions

### 1. Transport contract becomes explicit and test-owned

The panel host should treat transport routing as a documented compatibility contract instead of emergent behavior.

Behavior:

- Transcript events stay on `sessionEvent` whenever the current panel state can derive the next transcript state safely
- Deferred operational fields continue to use `deferredUpdate`
- Submit lifecycle changes continue to use `submitting`
- Full `snapshot` refresh stays limited to initial hydration, manual refresh, runtime replacement or disposal, child-panel navigation-sensitive topology changes, and genuinely under-hydrated reparent-in cases

This keeps later regressions visible in tests instead of relying on trace logs to infer intent.

### 2. Refresh windows should not interrupt active transcript streaming

Subtree refreshes should no longer downgrade common transcript updates back to full `snapshot` payloads.

Behavior:

- Transcript event handling remains incremental while subtree metadata refresh is in progress
- Readiness should be tracked by domain when one domain is safe to update before another
- Late full snapshots must reconcile with newer transcript state rather than overwrite it

This preserves user-visible streaming smoothness during subagent creation and other topology changes.

### 3. Topology fallback should shrink, not disappear

The goal is to narrow refresh-only cases, not force unsafe incremental updates for every topology mutation.

Behavior:

- Root panels should keep handling rename, metadata edits, archive-style updates, and already-known subtree moves incrementally
- Child panels may still refresh when navigation correctness depends on a rebuilt snapshot
- Reparent-in from outside the hydrated subtree may still trigger a full refresh when descendant data is missing locally

This respects the current architecture and the repository preference for minimal-risk changes.

### 4. Search and organization work only need closeout

Workspace search, local tags, and the focused task panel are already shipped slices and should not be reworked in this pass.

Behavior:

- Only add status or documentation notes where they are still missing
- Keep the existing search and organization implementation intact unless verification exposes a direct regression
- Avoid expanding into global search, global task inbox, or richer tag metadata

## Architecture

This slice stays inside the current panel and sidebar boundaries:

- `src/panel/provider/controller.ts` owns transport routing, refresh gating, and fallback reason strings
- `src/panel/provider/controller.test.ts` owns controller-level routing expectations
- `src/panel/webview/app/state.ts` and `src/panel/webview/hooks/useHostMessages.test.ts` own snapshot reconciliation and identity-preservation behavior
- `README.md` and implementation-plan docs receive any follow-up notes for already shipped search and organization work

The preferred flow is:

1. Lock the allowed transport matrix in tests
2. Narrow controller refresh gating only where tests show avoidable fallback
3. Confirm webview snapshot application preserves transcript references across metadata-only refreshes
4. Run full repo validation and apply the smallest documentation cleanup needed

## Success Criteria

This slice is successful when:

- Transport routing rules are explicit in tests and consistent with the convergence plan
- Normal assistant streaming does not fall back to full `snapshot` during common subtree refresh scenarios
- Remaining full refresh cases all map to one documented category
- Metadata-only snapshots preserve unchanged transcript references in the webview
- Search and organization docs accurately reflect shipped behavior without introducing new feature scope
