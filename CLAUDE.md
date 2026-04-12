# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenCode UI is a VS Code extension that brings OpenCode sessions into the editor. It manages one `opencode serve` runtime per workspace folder, displays sessions in a sidebar tree, opens each session in a dedicated webview panel, and provides companion views for todos and modified files. The extension works in both local and Remote SSH environments.

## Architecture

The codebase is organized into four main layers:

- **`src/core/`**: Extension lifecycle, workspace runtime management, SDK access, event streaming, session state, and command registration
  - `workspace.ts`: WorkspaceManager orchestrates one runtime per workspace folder
  - `server.ts`: Spawns and manages `opencode serve` processes
  - `sdk.ts`: OpenCode SDK client wrapper and type definitions
  - `events.ts`: EventHub streams session events from all workspace runtimes
  - `session.ts`: SessionStore maintains session metadata per workspace
  - `commands.ts`: VS Code command registration and handlers
  - `tabs.ts`: TabManager coordinates panel focus and editor tab state
  - `settings.ts`: Extension configuration and proxy handling

- **`src/sidebar/`**: TreeDataProvider, tree items, focused session tracking, and sidebar webviews
  - `provider.ts`: SidebarProvider implements TreeDataProvider for session tree
  - `item.ts`: Tree item definitions for workspace and session nodes
  - `focused.ts`: FocusedSessionStore tracks the active session for companion views
  - `view-provider.ts`: Generic webview provider for todo and diff views
  - `session-view-provider.ts`: Secondary sidebar session view provider

- **`src/panel/`**: Session panel host logic, controller, reducer, and webview UI
  - `provider/`: Host-side panel lifecycle and state management
    - `index.ts`: SessionPanelManager creates and tracks panels
    - `controller.ts`: SessionPanelController routes events to panels
    - `reducer.ts`: State reducer for incremental updates
    - `actions.ts`: Action creators for panel state changes
    - `snapshot.ts`: Full snapshot construction and reconciliation
    - `navigation.ts`: Session tree navigation (parent, child, prev, next)
    - `files.ts`: File opening and workspace integration
  - `webview/`: React-based session UI rendered in webview
    - `app/`: React components for session rendering
    - `hooks/`: Custom React hooks for webview state
    - `lib/`: Utilities for markdown, syntax highlighting, diff rendering
    - `renderers/`: Message part renderers (text, tool, thinking, etc.)
    - `tools/`: Tool-specific UI components
  - `shared/`: Code shared between host and webview
    - `session-reducer.ts`: Incremental session state reducer used by both host and webview
  - `serializer.ts`: Panel serializer for VS Code restart recovery

- **`src/bridge/`**: Typed host/webview message contracts
  - `types.ts`: Message protocol definitions, SessionSnapshot, HostMessage, WebviewMessage
  - `host.ts`: Host-side message posting utilities

## Key Concepts

### Workspace-Scoped Runtimes

The extension maintains one `opencode serve` process per workspace folder. Each runtime has a unique `dir` (workspace folder path) that serves as the primary dimension for all operations. Always pass `directory: rt.dir` when calling workspace-scoped SDK methods.

### Session Panel Identity

Each session panel is uniquely identified by `(dir, sessionId)`. The extension ensures only one panel exists per session. Panels are implemented as VS Code webview panels with a React UI that communicates with the host via postMessage.

### Incremental Updates

The panel system prefers incremental updates over full snapshots. Most session events (`message.updated`, `message.part.delta`, `session.status`, `session.diff`, `todo.updated`, `permission.*`, `question.*`) are delivered as targeted `sessionEvent` messages. Full `snapshot` refreshes are reserved for initial hydration, explicit refresh, runtime disposal, or complex session tree topology changes.

### Event Streaming

EventHub subscribes to all workspace runtimes and multiplexes events to interested consumers (SessionStore, SessionPanelManager, FocusedSessionStore). Events are typed and follow the OpenCode SDK event schema.

## Development Commands

**Package manager**: `bun` (version 1.3.10)

**Install dependencies**:
```bash
bun install
```

**Type-check, lint, and build**:
```bash
bun run check-types && bun run lint && bun run compile
```

**Individual validation steps**:
```bash
bun run check-types  # TypeScript type checking
bun run lint         # ESLint
bun run compile      # Development build with esbuild
```

**Production build**:
```bash
bun run package      # Type-check, lint, and production build
```

**Watch modes**:
```bash
bun run watch:esbuild  # Watch esbuild bundle
bun run watch:tsc      # Watch TypeScript type checking
```

**Testing**:
```bash
bun run test                          # Run all tests (src/panel and src/test)
bun test path/to/file.test.ts         # Run single test file
bun run parity:composer               # Composer parity tests
bun run parity:integration            # Integration parity tests
bun run parity:upstream               # Check upstream parity
bun run parity:upstream:golden        # Generate upstream golden snapshot
```

**Test placement**:
- Module-local unit tests: `src/panel/**/foo.test.ts` (next to the code they test)
- Cross-module and integration tests: `src/test/`
- Do not add tests under the `opencode/` symlink

## Code Style

**Language**: TypeScript with React TSX for webviews, strict mode enabled

**Imports**:
- External modules first, then local relative imports
- Use `import * as vscode from "vscode"` for VS Code APIs
- Use `import type` for type-only imports

**Formatting**:
- Double quotes, semicolons omitted, 2-space indentation
- Small functions, early returns, lightweight helpers
- Avoid deep nesting (extract helpers instead)

**Naming**:
- PascalCase: Classes, React components, exported types
- camelCase: Functions, methods, variables, fields, hooks
- Command/view IDs: `opencode-ui.*` namespace
- Domain names: `mgr`, `rt`, `dir`, `sessionId`, `workspaceName`, `panel`, `snapshot`

**Types**:
- Keep host/webview protocol synchronized across `src/bridge/types.ts`, panel host, and webview
- Use discriminated unions for messages and events
- Centralize SDK types in `src/core/sdk.ts`
- Avoid optional state that can be derived cheaply

**Error handling**:
- Early guards for missing workspace folders, runtime state, SDK availability, panel state, session data
- Convert unknown errors to readable strings before showing to users
- User-facing failures: `vscode.window.showErrorMessage` or `showInformationMessage`
- Operational details: write to "OpenCode UI" output channel

**VS Code extension structure**:
- `src/core/`: Extension activation, server lifecycle, SDK, events, session orchestration
- `src/sidebar/`: Sidebar rendering and tree concerns
- `src/panel/`: Session panel host lifecycle, reducer/controller, serializer
- `src/bridge/`: Bridge contracts (do not scatter message types)

**Webview and UI**:
- Keep local webview implementation independent from upstream `opencode/` codebase
- Study upstream for ideas but do not import from it or copy large subsystems
- Favor incremental UI changes that preserve behavior and protocol meaning

**Session and workspace behavior**:
- Always preserve the `dir` dimension (per-workspace runtimes)
- One session panel per `(dir, sessionId)`
- Pass `directory: rt.dir` explicitly when calling workspace-scoped APIs
- Avoid blurring responsibilities between runtime, session, sidebar, and panel state

**React patterns**:
- Functional components and hooks in `src/panel/webview/` and `src/sidebar/webview/`
- Minimal local state, derive display state from snapshots
- Pass typed callbacks and small props objects

**Lint hygiene**:
- Prefix unused required parameters with `_`
- No dead locals, stale imports, or commented-out code
- Avoid unrelated file churn
- Never commit `opencode/` or `.memory/`

## Important Constraints

- **DO NOT modify AGENTS.md** unless explicitly permitted by the user
- **Minimize code changes**: Consider how to minimize impact on existing code when adding features or fixing bugs
- **Discuss solutions first**: Before writing code, inform the user of your intended solution and confirm with them
- **Use tools for questions and todos**: Prefer `question` or `ask_user` tools over direct questions; prefer `todo` tool over manual TODO lists
- **No questions in subagents**: Do not ask questions when working in subagent context

## Git Commit Style

Format: `<type>: <subject>` with optional body in list format

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

**IMPORTANT**: Do not include symbols like `$` or backticks in commit title or body (causes bash shell interpretation issues)

## Local Symlink

The `opencode/` directory is a symlink to the upstream OpenCode repo for reference only. Do not import from it, depend on it at runtime, or commit it. Do not run workflow commands against it.
