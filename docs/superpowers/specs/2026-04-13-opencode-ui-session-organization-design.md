# OpenCode UI Session Organization Design

## Goal

Deliver the next post-M1 organization slice for OpenCode UI by upgrading the focused-session Todo view into a stronger task panel and adding local session tags that help users organize sessions inside the VS Code sidebar.

## Scope

This slice includes:

1. Task panel improvements for the currently focused session
2. Local session tags stored by the VS Code extension
3. Session tag display inside the Sessions tree
4. Workspace-scoped session filtering by tag

This slice does not include:

- A cross-session global task inbox
- Tags on todo items
- Syncing tags back to OpenCode server data
- Cross-workspace tag browsing
- Colored labels, favorites, notes, or arbitrary custom metadata

## Product Decisions

### 1. Task panel stays focused-session scoped

The existing Todo companion view should remain tied to the currently focused session instead of becoming a global inbox.

Behavior:

- The panel continues to follow the focused session tab
- The panel shows stronger derived structure instead of a flat todo list
- Users can see task counts, filter visible tasks, and jump back to the source session

This preserves the current mental model while making the panel more useful during active work.

### 2. Task panel emphasizes triage over editing

The task panel should help users review and navigate tasks, not become a second task editor.

Behavior:

- Show summary counts for all, open, and completed work
- Default to grouped display by task status
- Support lightweight filters:
  - `All`
  - `Open`
  - `Completed`
- Show source session context for each item
- Clicking a task opens the related session

This keeps the panel practical without inventing new task mutation workflows the server does not support.

### 3. Session tags are local extension metadata

Session tags should be stored only in the VS Code extension and not synchronized to OpenCode server state.

Behavior:

- Tags are keyed by `workspaceId + sessionId`
- Tags are visible only in this extension instance and profile state
- Tags survive reloads through extension-side persistence
- Missing or deleted sessions simply lose their visible tag attachment when no matching session exists

This gives users lightweight organization immediately without waiting on upstream protocol support.

### 4. Tag workflows stay workspace-scoped

Session tag filtering should match the existing session search mental model by staying within the current workspace node.

Behavior:

- A workspace can enter tag-filter mode independently of other workspaces
- Session search and tag filtering may both be active for one workspace
- When both are active, the session list should apply both filters together
- Clearing a tag filter restores the workspace to its prior search-only or default state

This keeps filtering predictable and avoids introducing a second global browsing system.

## Architecture

This slice should stay within the existing extension boundaries:

- `src/sidebar/focused.ts` remains the source for focused-session task data
- `src/sidebar/view-provider.ts` and `src/sidebar/webview/` own the upgraded task panel presentation
- `src/core/` owns local session-tag persistence and command registration
- `src/sidebar/provider.ts` and `src/sidebar/item.ts` own tag-aware tree rendering and workspace-scoped tag filters

The preferred flow is:

1. Focused session changes or receives todo updates
2. Existing focused-session data flow feeds the task panel
3. Task panel derives grouped sections, filter results, and source-session navigation from current state
4. Session tag commands update local extension metadata
5. Sidebar provider merges tag metadata with the normal session list at render time
6. Workspace tag filters and workspace text search apply together when both are active

## File-Level Design

### Task Panel

- Keep using the existing focused-session snapshot instead of adding a new runtime fetch path
- Extend sidebar webview state only if source session label or workspace label is missing from the current payload
- Add view-local derived helpers for:
  - counts by status
  - filtered task lists
  - grouped task sections
- Add a click path from a task row back to the session open command

### Session Tags

- Add a small local metadata store under `src/core/`
- Persist only:
  - `tags: string[]`
- Scope storage by workspace and session id
- Keep store access explicit and typed

### Sessions Tree

- Extend session tree items to render compact tag pills or a `+N` overflow marker
- Add workspace actions:
  - `Filter By Tag`
  - `Clear Tag Filter`
- Add session action:
  - `Manage Tags`
- Keep search and tag filters as sidebar view state, not `SessionStore` data

## Success Criteria

This slice is successful when:

- The Todo companion view feels like a practical task panel for the currently focused session
- Users can quickly filter tasks and jump back to their source session
- Users can assign tags to sessions locally and see them in the Sessions tree
- Users can filter a workspace session list by tag without affecting other workspaces
- Existing focused-session syncing, session search, and session open flows continue to work

## Non-Goals

- Multi-session inbox aggregation
- Editing task completion state from the extension
- Tagging todo rows
- Server-backed tag persistence
- Tag colors or custom sorting rules

## Risks And Mitigations

### Risk: Task panel becomes noisy

Mitigation:

- Keep filters lightweight, default to sensible grouping, and avoid adding bulk actions in the first slice

### Risk: Session tags drift from real session lifecycle

Mitigation:

- Scope metadata by workspace and session id, and render tags only when a matching session exists in the current list

### Risk: Sidebar state becomes overly complex

Mitigation:

- Model tag filters alongside existing workspace search state instead of pushing them into `SessionStore`

### Risk: Search and tag filtering conflict

Mitigation:

- Apply them as independent view filters over the same workspace session list, with explicit clear actions for each mode

## Testing Strategy

- Add metadata-store tests for:
  - read and write behavior
  - update and clear behavior
  - workspace isolation
- Add sidebar provider tests for:
  - tag rendering
  - tag filtering
  - tag filter plus text search intersection
- Add task panel tests for:
  - count derivation
  - filter behavior
  - grouped ordering
  - session navigation message flow

## Approved Implementation Slice

The approved implementation slice is:

- Focused-session task panel upgrade
- Local session tag persistence
- Session tag display in the Sessions tree
- Workspace-scoped tag filtering

This slice should land before switching back to the broader `PLAN.md` transport and rendering convergence work.
