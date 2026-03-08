# OpenCode UI

This repo is a standalone VS Code extension for browsing and operating OpenCode sessions per workspace folder. It starts `opencode serve` for each workspace, shows grouped sessions in the Activity Bar sidebar, and opens session tabs with a local webview UI. The local `opencode/` directory is only a symlink to the upstream repo for reference; do not import from it or commit it.

- `src/`: extension source code
  - `src/core/`: workspace runtime, SDK, commands, event streaming, session state, tab orchestration
  - `src/sidebar/`: TreeDataProvider and tree items for workspace and session lists
  - `src/panel/`: webview panel provider, serializer, and HTML shell
  - `src/bridge/`: typed host/webview message contracts
- `images/`: extension icons
- `PLAN.md`: implementation plan and milestone tracking
- `AGENTS.md`: instructions for agentic coding agents in this repository
- `.memory/`: local memory log, git ignored
- `opencode/`: local upstream symlink for reference only, git ignored

## MOST IMPORTANT RULES

- DO NOT modify AGENTS.md unless the user permits it by explicitly asking you to do so.
- When you adding new feature or fixing a bug, please consider about how to minimize the impact on the existing code, which means modify codes as less as possible.
- When you want to ask user for making decisions, if there is a `question` tool or `ask_user` tool, prefer to use it instead of asking the user directly. If there is no suitable tool, ask the user directly.
- Before making any changes, write a TODO list to remind yourself to implement the features later, if there is a `todo` tool, prefer to use it instead of writing the TODO list manually.
- Before you start writing code, you need to inform the user of the solution you intend to adopt. Only after discussing and confirming with the user should you begin the work. And also remember that DO NOT ASK ANY QUESTIONS IN SUBAGENTS.

## Run / Build / Lint / Test

- Package manager: `bun`.
- Install dependencies: `bun install`.
- Type-check: `bun run check-types`.
- Lint: `bun run lint`.
- Development build: `bun run compile`.
- Production bundle for publishing: `bun run package`.
- Watch esbuild bundle: `bun run watch:esbuild`.
- Watch TypeScript only: `bun run watch:tsc`.
- Current test command: `bun run test`.
- Current single-test support: none exists yet because the repo does not contain a real test runner or test files; `bun run test` only prints `No tests yet`.
- When validating a code change, prefer `bun run check-types && bun run lint && bun run compile`.
- If you add tests later, update this file with the exact single-test command instead of guessing.
- No Cursor rules were found in `.cursor/rules/` or `.cursorrules`.
- No Copilot rules were found in `.github/copilot-instructions.md`.
- Do not run git commands against the local `opencode/` symlink as part of this repo’s workflow.

## Code Style

- Language: TypeScript with `strict` mode enabled in `tsconfig.json`; preserve strict typing and avoid weakening types with `any`.
- Module format: ESM-style imports, Node16 module resolution, double quotes, semicolons omitted, and 2-space indentation.
- Imports:
  - Keep imports grouped simply with external modules first, then local relative imports.
  - Use `import * as vscode from "vscode"` for VS Code APIs.
  - Use `import type` for type-only imports where appropriate.
  - Prefer short relative paths that match the existing folder structure.
- Formatting:
  - Match the existing minimal style in `src/`: small functions, early returns, little inline commentary.
  - Keep lines readable; prefer extracting helpers over deeply nested logic.
  - Follow existing naming and file layout instead of introducing new patterns casually.
- Types:
  - Define explicit data contracts for host/webview communication in `src/bridge/types.ts`.
  - Keep SDK-facing shapes centralized in `src/core/sdk.ts`.
  - Prefer discriminated unions for event and message types.
  - Avoid optional state that can be derived cheaply; compute via helper functions when possible.
- Naming:
  - Classes and types use PascalCase.
  - Functions, methods, variables, and fields use camelCase.
  - Reuse domain names already present in the repo: `mgr`, `rt`, `dir`, `sessionId`, `workspaceName`, `panel`, `snapshot`.
  - Keep command ids and view ids in the existing `opencode-ui.*` namespace.
- Error handling:
  - Prefer early guards for missing workspace, runtime, SDK, or panel state.
  - Convert unknown errors into readable strings before surfacing them.
  - User-facing failures should usually go through `vscode.window.showErrorMessage` or `showInformationMessage`.
  - Operational details should also be written to the `OpenCode UI` output channel.
  - Keep fallback refreshes and reconnection paths explicit for runtime and event-stream code.
- VS Code extension structure:
  - Keep VS Code orchestration, server lifecycle, SDK access, and event streaming in `src/core/`.
  - Keep sidebar rendering concerns in `src/sidebar/`.
  - Keep webview panel lifecycle in `src/panel/`.
  - Keep host/webview protocol changes synchronized across `src/bridge/types.ts`, panel host code, and the webview HTML.
- Webview UI:
  - The current UI is a thin local implementation in `src/panel/html.ts`; keep it independent from the upstream `opencode/` codebase.
  - You may study upstream UI patterns in the symlinked repo, but do not import from it, depend on it at runtime, or copy large subsystems wholesale.
  - Favor incremental enhancements to timeline, composer, blocked states, and event-driven updates over broad rewrites.
- Session and workspace behavior:
  - Always preserve the `dir` dimension; this repo is designed around per-workspace runtimes.
  - Keep one session panel per `dir + sessionId`.
  - When calling session APIs that must be workspace-scoped, pass `directory: rt.dir` explicitly.
- Lint-driven conventions:
  - Unused args should be prefixed with `_` if they must exist.
  - Do not leave dead locals or stale imports behind.
- Repo hygiene:
  - Never commit `opencode/` or `.memory/`.
  - Treat `PLAN.md` as the source of truth for milestone status and architectural constraints.
  - If you change workflow assumptions or repository commands, update `AGENTS.md` accordingly.

## Git Commit Message Style

The git commit message style should be composed of two parts: title and body. The title should be `<type>: <subject>` (such as `feat: add new feature` or `fix: fix bug`). The body should be the detailed description of the changes in list format.

It's important that DO NOT include any symbol like $ or ` in the title or body. This would cause the bash shell to interpret the title or body as a command or a code block.
