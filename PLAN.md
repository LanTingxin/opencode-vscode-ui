# OpenCode UI Plan

## Remote SSH Support Roadmap

### Goal

Make the extension work correctly in VS Code Remote SSH without regressing the current local-workspace behavior.

The target outcome is:

- the extension runs on the remote workspace extension host
- `opencode serve` starts on the remote machine for each workspace folder
- session tabs, sidebar actions, and file-opening behavior keep targeting the correct remote workspace
- webviews continue to function without needing direct browser access to the remote localhost server
- restored panels and cached session state remain stable across multiple SSH hosts and workspaces

### Current Architecture Summary

The extension already has a workable shape for Remote SSH, but several core assumptions are still local-path based.

- workspace runtimes are keyed by `dir` strings derived from `workspaceFolder.uri.fsPath` in `src/core/workspace.ts`
- session and panel identity also use `dir` strings in `src/bridge/types.ts`, `src/panel/provider/utils.ts`, and `src/panel/webview/app/state.ts`
- file opening and file existence checks rebuild URIs with `vscode.Uri.file(...)` in `src/panel/provider/files.ts` and `src/sidebar/view-provider.ts`
- runtime startup spawns `opencode serve` bound to `127.0.0.1` in `src/core/server.ts`, which is acceptable only when the extension host runs on the remote workspace side
- webview static assets already use `webview.asWebviewUri(...)` and `localResourceRoots`, which is the correct Remote SSH-compatible pattern

### Design Direction

Keep the existing architecture of one runtime per workspace folder and one panel per workspace-plus-session pair.

Do not redesign the extension around browser-to-server networking.

Instead:

- explicitly place the extension on the workspace extension host
- promote workspace identity from raw local path strings to remote-safe workspace references
- keep host-to-runtime traffic inside the extension host
- keep webviews talking only to the host bridge unless a later feature proves an external URI is required
- migrate risky path reconstruction sites incrementally, starting with file open and panel restore

### Non-Goals

This roadmap is only for Remote SSH support. It does not aim to:

- add vscode.dev or github.dev web support
- add Codespaces-specific UX beyond what falls out naturally from URI-safe APIs
- redesign the upstream runtime protocol
- replace the current localhost runtime model with a remote HTTP exposure flow

---

## Phase R0 - Lock Extension Placement And Remote Assumptions

Status: completed

### Objective

Ensure the extension is installed and executed in the correct place under Remote SSH, and make failures easy to diagnose.

### Scope

- declare `extensionKind` in `package.json` with workspace-first placement
- confirm the current extension entrypoint and activation model do not require UI-host execution
- add or improve output-channel diagnostics around runtime startup so it is obvious whether `opencode` is missing on the remote host or the remote process failed to start
- document the expected Remote SSH execution model directly in the plan and implementation notes

### Files Most Likely To Change

- `package.json`
- `src/core/server.ts`
- `src/core/workspace.ts`

### Acceptance Criteria

- in a Remote SSH window, `Developer: Show Running Extensions` shows the extension on the workspace side
- runtime startup logs clearly identify the workspace and failure mode when `opencode` is unavailable remotely
- current local development behavior still works unchanged

### Validation

- `bun run check-types`
- `bun run lint`
- manual: connect over Remote SSH, open a workspace, and verify the extension host placement plus runtime startup logging

---

## Phase R1 - Introduce A Remote-Safe Workspace Identity Model

Status: completed

### Objective

Stop treating workspace identity as only `fsPath`, so the extension can distinguish the same path on different remotes and avoid losing URI authority.

### Scope

- define a canonical workspace reference shape for host-side logic and panel/session references
- preserve enough URI information to reconstruct the original workspace folder in local and remote environments
- update state keys, lookup helpers, and panel identity helpers to use the new canonical workspace reference instead of a bare `dir` string where required
- keep SDK calls compatible with the current server contract by continuing to pass a directory path string only at the API boundary that actually needs it

### Files Most Likely To Change

- `src/bridge/types.ts`
- `src/core/workspace.ts`
- `src/core/commands.ts`
- `src/core/tabs.ts`
- `src/panel/provider/utils.ts`
- `src/sidebar/focused.ts`
- related panel/provider call sites that compare refs or build keys

### Acceptance Criteria

- the extension can uniquely identify a session panel by workspace plus session even when two remotes expose the same absolute path
- host-side comparisons no longer depend on `Uri.file(...)` semantics
- existing local-workspace flows still produce the same visible behavior

### Validation

- `bun run check-types`
- `bun run lint`
- manual: open two workspace folders that would otherwise share the same path string across environments and confirm panel/session identity remains stable

---

## Phase R2 - Migrate File Resolution And File Opening To URI-Based APIs

Status: completed

### Objective

Make all user-facing file navigation and existence checks resolve against the actual workspace folder URI instead of rebuilding local file URIs.

### Scope

- replace `vscode.Uri.file(...)` reconstruction in panel file open logic with workspace-aware URI resolution
- replace sidebar file-open path joining with workspace-aware URI resolution
- use `vscode.workspace.fs.stat` and URI joins consistently for prompt-file existence checks and directory/file detection
- preserve support for absolute file references and canonical `file://` values only where they can be resolved safely without dropping remote authority

### Files Most Likely To Change

- `src/panel/provider/files.ts`
- `src/sidebar/view-provider.ts`
- any helper introduced to map workspace refs to `vscode.WorkspaceFolder`

### Acceptance Criteria

- clicking a file reference from a panel opens the correct remote document under Remote SSH
- clicking a file from the sidebar opens the correct remote document under Remote SSH
- file existence and directory detection used by the composer still work in both local and remote workspaces

### Validation

- `bun run check-types`
- `bun run lint`
- manual: from a Remote SSH session, open files from panel links, sidebar diff/todo items, and composer file references

---

## Phase R3 - Make Panel Restore And Persisted Webview State Authority-Aware

Status: completed

### Objective

Prevent restored panels and webview state from drifting across remotes or reviving against the wrong workspace.

### Scope

- update persisted panel state so it carries the new workspace reference instead of only `dir + sessionId`
- update panel restore validation and revive helpers to reject stale or incomplete workspace identity
- update webview persisted state matching so session-local composer state is restored only when the full workspace reference and session id still match
- verify panel keys and active-session comparisons stay stable after the identity migration

### Files Most Likely To Change

- `src/panel/provider/utils.ts`
- `src/panel/provider/index.ts`
- `src/panel/webview/app/state.ts`
- `src/sidebar/focused.ts`
- any host/webview bootstrap payloads that still assume a bare `dir`

### Acceptance Criteria

- reloading a Remote SSH window restores only the panels belonging to the same remote workspace
- session-local panel state is not accidentally reused for the same path on another host
- invalid legacy state degrades gracefully instead of crashing panel restore

### Validation

- `bun run check-types`
- `bun run lint`
- manual: open panels, reload the Remote SSH window, reconnect to a different SSH target with similar folder paths, and verify restore behavior remains correct

---

## Phase R4 - Audit Runtime, Event, And Command Boundaries For Remote Correctness

Status: completed

### Objective

Finish the host-side cleanup so runtime APIs, command entrypoints, and event routing all use the new workspace identity consistently.

### Scope

- review command handlers that currently default to `workspaceFolders[0].uri.fsPath`
- review event routing and focused-session state to ensure ref matching remains correct after the workspace identity migration
- review runtime maps, restart flows, and session opening helpers for any remaining `fsPath`-only assumptions
- keep API-boundary conversion to directory strings centralized instead of spreading it across commands and providers

### Files Most Likely To Change

- `src/core/commands.ts`
- `src/core/session.ts`
- `src/core/events.ts`
- `src/core/workspace.ts`
- `src/sidebar/focused.ts`
- `src/panel/provider/controller.ts`
- `src/panel/provider/snapshot.ts`

### Acceptance Criteria

- all command flows still work from sidebar actions, command palette entrypoints, and panel-triggered actions in local and remote windows
- focused-session sidebar data keeps following the active panel under Remote SSH
- workspace restart and refresh flows continue targeting the correct remote runtime

### Validation

- `bun run check-types`
- `bun run lint`
- `bun run compile`
- manual: exercise new session, open session, refresh, restart server, delete session, and focused-session sidebar flows in a Remote SSH window

---

## Phase R5 - Regression Hardening And Remote Verification Matrix

Status: completed

### Objective

Close the roadmap with repeatable verification steps and lightweight regression coverage where the current repo supports it.

### Scope

- add targeted tests for new identity helpers and restore logic where there are already testable pure helpers
- add a documented manual verification checklist for Remote SSH and for local regression checks
- verify there is no accidental dependency on browser-to-remote `localhost` access from webviews
- capture any remaining limitations explicitly if they are deferred beyond this roadmap

### Files Most Likely To Change

- `PLAN.md`
- pure helper tests near whichever modules gain reusable identity helpers
- small documentation touch-ups if a command or expectation changes

### Acceptance Criteria

- identity helper coverage exists for the most failure-prone normalization and equality logic
- the project has a concrete Remote SSH manual test matrix instead of ad hoc spot-checking
- any deferred behavior is named explicitly and does not block the base Remote SSH support claim

### Validation

- `bun run check-types`
- `bun run lint`
- `bun run compile`
- run any newly added focused tests if they do not require the unresolved `vscode` runtime package chain

---

## Suggested Execution Order

1. Phase R0
2. Phase R1
3. Phase R2
4. Phase R3
5. Phase R4
6. Phase R5

## Cross-Phase Guardrails

- keep one runtime per workspace folder
- keep one session panel per workspace-plus-session pair
- avoid changing the runtime server protocol unless Remote SSH support proves it is necessary
- prefer `vscode.Uri`, `vscode.workspace.fs`, and workspace-folder lookups over Node path reconstruction for workspace files
- keep remote-aware conversion to plain directory strings at the narrowest possible boundary, ideally only where the SDK or child process launch actually requires it
- preserve the existing host-bridged webview architecture; do not route webview traffic directly to the runtime unless a future feature requires `vscode.env.asExternalUri(...)`

## Manual Verification Matrix

### Local Window Baseline

- open a local folder and confirm the runtime starts normally
- create, open, refresh, and delete a session
- open a file from panel references and sidebar entries
- reload the VS Code window and confirm session panels restore

### Remote SSH Core Flow

- connect to a remote machine with `opencode` installed and open a folder
- verify the extension runs on the workspace extension host
- verify one runtime starts per workspace folder on the remote machine
- create, open, refresh, restart, and delete sessions
- open files from panel references, sidebar diff items, and composer file references
- reload the window and verify panel restore still targets the same remote workspace

### Multi-Workspace And Identity Safety

- open multiple workspace folders in one Remote SSH window and confirm each gets its own runtime
- switch active panels across folders and verify focused-session sidebar state follows correctly
- reconnect to another remote that contains a similar absolute folder path and verify old panel state is not misapplied

### Failure And Recovery Cases

- start a Remote SSH window where `opencode` is missing from remote PATH and verify the error is actionable
- stop or restart the remote runtime and verify the extension reports the transition cleanly
- disconnect and reconnect the SSH session and verify stale panel state degrades gracefully

## Exit Criteria

The roadmap is complete when:

- the extension can honestly claim basic Remote SSH support for runtime startup, session management, file navigation, and panel restore
- local behavior remains intact
- known deferred items, if any, are documented explicitly rather than hidden behind path-based assumptions
