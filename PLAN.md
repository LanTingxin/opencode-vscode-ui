# Snapshot And Delta Convergence Plan

## Goal

Eliminate unnecessary full `snapshot` updates in the panel host/webview pipeline so normal session activity, including subagent creation and streaming assistant output, stays on incremental rendering paths. Keep full `snapshot` refreshes only for cases where the panel genuinely needs authoritative re-hydration.

## Current State

- Message-level incremental updates are already in place for `message.updated`, `message.removed`, `message.part.updated`, `message.part.removed`, and `message.part.delta`.
- Additional incremental paths now cover `session.status`, `session.diff`, `todo.updated`, `permission.*`, `question.*`, deferred panel fields, and submitting state.
- Root session panels now maintain subtree session state incrementally for `session.created`, `session.updated`, and `session.deleted` without forcing full refresh in common subagent flows.
- Full `snapshot` application in the webview now reconciles `messages` and `childMessages` to preserve references for unchanged messages and parts.
- Logging is now limited to slow operations over 100 ms so remaining fallback paths are easier to identify.

## Problems Still To Close

- The host still allows some `snapshot` fallbacks without a fully codified contract for when they are permitted.
- There is no single automated test matrix that asserts which host events must travel as `snapshot`, `sessionEvent`, `deferredUpdate`, or `submitting`.
- Refresh windows can still produce avoidable `snapshot` fallback if a scenario is not yet modeled as incremental state.
- Reparenting or topology-heavy session tree changes still require careful fallback refresh to avoid partial subtree hydration.

## Design Principles

- Prefer incremental host messages over full `snapshot` whenever the next state can be derived from the current panel state.
- Treat transcript data, subtree session metadata, and deferred operational state as separate update classes.
- Keep root session panels and child session panels on different refresh rules when their correctness needs differ.
- Preserve object identity in the webview whenever logical content has not changed.
- Add tests before broadening or tightening any routing rule so transport behavior stays explicit.

## Phase 1: Define The Transport Contract

### Objective

Make snapshot usage explicit and document which state changes belong to each host message type.

### Work

- Define the allowed routing table for:
  - `snapshot`
  - `sessionEvent`
  - `deferredUpdate`
  - `submitting`
- Separate the contract by panel type:
  - root session panel
  - child session panel
- Enumerate the event families and expected transport:
  - transcript events
  - session status and diff events
  - permission and question events
  - subtree session events
  - runtime and workspace invalidation events
- Document the only acceptable reasons for full refresh, including:
  - initial panel hydration
  - explicit manual refresh
  - runtime disposal or workspace runtime replacement
  - subtree reparenting into the current root panel where descendants are not hydrated yet
  - child panel navigation or topology changes that cannot be derived safely from local state

### Deliverables

- A transport decision matrix in code comments or tests.
- Clear reason strings for every remaining full `snapshot` path.

### Exit Criteria

- Every full `snapshot` reason maps to a documented category.
- There are no ambiguous `action:forced` style fallbacks left without explanation.

## Phase 2: Lock Routing With Automated Tests

### Objective

Turn the transport contract into regression tests so future changes cannot silently reintroduce broad snapshot fallback.

### Work

- Add controller-level routing tests for `SessionPanelController.handle()` covering:
  - message events stay incremental
  - `session.status` stays incremental
  - `session.diff` stays incremental
  - `permission.*` and `question.*` stay incremental
  - deferred loads use `deferredUpdate`
  - submit lifecycle uses `submitting`
  - root panel subtree updates do not force refresh for simple child create, update, or delete
  - child panels still refresh where navigation correctness requires it
  - reparent-in cases still force refresh intentionally
- Add fallback-window tests covering:
  - refresh in progress
  - incremental-ready transitions
  - message events arriving while subtree refresh is occurring
- Add snapshot-application tests covering:
  - unchanged messages keep identity
  - unchanged child message lists keep identity
  - session metadata-only snapshot does not rebuild transcript references

### Deliverables

- New controller and reducer test files that define allowed transport behavior.

### Exit Criteria

- Event-to-transport routing is asserted in tests, not inferred from logs.
- Snapshot fallback paths are intentionally listed and covered.

## Phase 3: Remove Avoidable Refresh Windows

### Objective

Prevent refresh windows from downgrading normal transcript streaming to full `snapshot` fallback.

### Work

- Split refresh concerns so session tree hydration does not block transcript event delivery.
- Keep `message.updated`, `message.part.updated`, `message.part.removed`, and `message.part.delta` incremental even while subtree metadata refresh is happening.
- Separate refresh readiness by domain where needed:
  - transcript readiness
  - subtree metadata readiness
  - deferred operational state readiness
- Ensure late-arriving full `snapshot` payloads reconcile against newer incremental transcript state instead of replacing it.

### Deliverables

- A narrower refresh-gating model in the controller.
- Tests proving subagent creation does not force transcript message events back to `snapshot`.

### Exit Criteria

- Creating or updating a subagent session does not produce `event:message.part.updated:snapshot` during normal assistant streaming.

## Phase 4: Incrementalize Remaining Session Tree Cases

### Objective

Shrink the set of subtree topology changes that still need full re-hydration.

### Work

- Expand root panel subtree maintenance for safe topology edits where descendants are already known locally.
- Distinguish between:
  - rename or metadata update
  - archive or leave-subtree update
  - move within already-known subtree
  - move from outside subtree into current root panel
- Keep full refresh only for cases that need data not already present in `childSessions` and `childMessages`.
- Consider lightweight host fetches for missing descendant metadata instead of full panel refresh when reparent-in scope is small.

### Deliverables

- Fewer `session.updated:snapshot` reasons in logs.
- A smaller documented list of topology changes that still require full refresh.

### Exit Criteria

- `session.updated:snapshot` appears only for genuinely under-hydrated subtree moves or explicit refresh actions.

## Phase 5: Performance Validation

### Objective

Confirm that transport changes actually improve user-visible rendering cost.

### Work

- Re-run the same profiling scenarios used during investigation:
  - workspace change open
  - normal assistant streaming
  - subagent creation during active streaming
  - permission and question flows
  - session diff updates
- Track these indicators in logs:
  - count of full `snapshot` reasons per scenario
  - count of `deferredUpdate` and `sessionEvent` deliveries per scenario
  - slow render count over 100 ms
  - whether unchanged snapshot message replacement drops toward zero on metadata-only updates
- Verify the worst remaining slow paths are dominated by real content rendering rather than transport fallback.

### Exit Criteria

- Normal assistant streaming does not produce full `snapshot` fallback.
- Subagent creation no longer causes transcript streaming events to downgrade into snapshot updates.
- Remaining slow renders over 100 ms are rare and attributable to genuinely changed content.

## Remaining Allowed Snapshot Cases

Until later phases remove more of them, these are the only acceptable full `snapshot` categories:

- initial panel hydration
- explicit manual refresh
- workspace runtime replacement or disposal
- root panel reparent-in where descendants are not hydrated locally
- child panel navigation or topology changes that cannot be derived safely from local state
- last-resort recovery when local state is known to be stale or incomplete

## Implementation Order

1. Add controller routing tests that codify the current intended contract.
2. Refactor refresh gating so transcript events stay incremental during subtree refresh.
3. Reduce `session.updated:snapshot` frequency by handling more safe subtree updates incrementally.
4. Re-run profiling and keep only the snapshot fallbacks that are still justified.

## Success Criteria

- Snapshot routing rules are explicit, tested, and narrow.
- Root panel subagent activity stays incremental in the common case.
- Full snapshot fallback becomes exceptional, auditable, and rare.
- The webview keeps message and part identity stable across both delta and metadata-only snapshot updates.
