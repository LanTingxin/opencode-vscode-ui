# OpenCode UI M1 Design

## Goal

Deliver the first migration-focused milestone for OpenCode UI so heavy Claude Code and Codex users can start an agent session from the editor, land in a prefilled session with useful context, and keep a lightweight always-visible OpenCode control point inside VS Code.

## Scope

M1 includes four capabilities:

1. Editor launch entry
2. Automatic context injection
3. Status bar entry
4. Runtime capability foundation

M1 does not include inline editor chat, session search UI, task inbox, or diff acceptance workflows.

## Product Decisions

### 1. Editor launch entry

OpenCode should gain native VS Code entry points instead of requiring the user to open the sidebar first.

Included entry points:

- Editor selection context menu: ask about the selection
- Editor context menu without selection: ask about the current file
- Explorer context menu: ask about one or more selected files
- Command palette commands for the same actions

Behavior:

- These entry points create a new session in the matching workspace
- The new session opens beside the current editor, matching the existing quick session behavior
- The composer is prefilled but not auto-submitted
- The user can still edit the prompt before sending

This keeps the first release predictable and avoids hidden state about whether content should go to an existing session.

### 2. Automatic context injection

Session creation from editor-driven entry points should seed the composer with structured file references instead of raw pasted text.

Rules:

- If there is a non-empty editor selection, include the selected file with 1-based line numbers
- If there is no selection, include the current file
- Explorer launches include every selected file as a file mention
- Paths should be workspace-relative whenever possible
- If a file cannot be resolved to a workspace runtime, the command falls back to the existing empty-session flow or shows a clear message

The seeded draft should be implemented using the existing `restoreComposer` message path so the webview keeps ownership of the actual composer state.

### 3. Status bar entry

OpenCode should expose a single status bar item that reflects the most relevant local state without becoming noisy.

Display priorities:

1. Active OpenCode session in the focused panel
2. Active editor workspace runtime if there is no active OpenCode panel
3. First available workspace runtime

States:

- Ready and idle
- Busy
- Starting
- Error or setup required

Click behavior:

- Open the active session if one exists
- Otherwise create a quick session in the active editor workspace
- Otherwise reveal the OpenCode session view

M1 status bar scope stays intentionally light. It does not need permission counts or question counts yet.

### 4. Runtime capability foundation

OpenCode UI runs against whichever `opencode serve` binary the user has installed, so feature rollout cannot assume one server version.

M1 should add a capability layer that:

- Stores per-workspace feature support
- Can probe version-sensitive server features safely
- Caches probe results
- Exposes a simple read API to commands and future UI work
- Treats unsupported features as a reason to hide or downgrade UI, not as a fatal error

Initial capability targets:

- Session search
- Session children
- Session revert or unrevert
- Experimental MCP resource listing

M1 does not need to surface a dedicated capabilities UI. The point is to establish the foundation and use it for safe rollout later.

## Architecture

M1 should stay inside the current extension architecture:

- `src/core/` owns command registration, editor context capture, capability probing, and status bar behavior
- `src/panel/provider/` owns seeded composer delivery into session panels
- `src/bridge/` only changes if the existing `restoreComposer` contract is not sufficient

The preferred flow is:

1. Capture a workspace-scoped launch context from editor or explorer
2. Create a new session for that workspace
3. Open the session panel beside the editor
4. Deliver seeded composer parts once the panel webview is ready

This avoids bypassing the webview state model and reuses the existing typed prompt part system.

## File-Level Design

### Core

- Add a capability manager under `src/core/` to probe and cache per-runtime support
- Add a launch context helper under `src/core/` to convert editor or explorer state into `ComposerPromptPart[]`
- Add a status bar controller under `src/core/` to derive label, tooltip, and command target from active runtime or session state
- Extend command registration to wire the new editor, explorer, and status bar commands

### Panel

- Extend session panel management so a newly opened panel can accept an initial composer seed
- Queue the seed until the webview is ready, then emit the existing `restoreComposer` host message once
- Avoid any snapshot churn or state refresh just for seeding the composer

## Success Criteria

M1 is successful when:

- A user can right-click selected code and start a new OpenCode session with the file reference already in the composer
- A user can ask about the current file from the editor or explorer without touching the sidebar first
- The status bar always gives a useful OpenCode entry point in a workspace with the extension active
- Capability probes do not break startup and can safely mark features unsupported
- Existing session creation, panel restore, and composer flows keep working

## Non-Goals

- Full inline editor chat
- Sending context into the currently active session
- Session search UI
- Tags, favorites, or pinned context storage
- Diff accept or reject workflows
- Any required changes to upstream OpenCode protocols

## Risks And Mitigations

### Risk: Seeded composer races panel readiness

Mitigation:

- Queue composer seed state in the panel host and deliver it only after the webview sends `ready`

### Risk: Capability probes misclassify server errors

Mitigation:

- Centralize probe error classification and treat ambiguous errors as unknown instead of unsupported

### Risk: Editor-driven commands pick the wrong workspace in multi-root mode

Mitigation:

- Require every launch context to resolve to one concrete workspace folder before session creation

### Risk: Status bar becomes noisy

Mitigation:

- Keep M1 status text short and derive from only one active runtime or session at a time

## Approved Implementation Slice

The approved first implementation slice is:

- Editor launch entry
- Automatic context injection
- Status bar entry
- Capability foundation

This slice should be planned and implemented before any M2 work such as session search, tags, or task inbox.
