# OpenCode Enhanced UI

This repo is the enhanced standalone VS Code extension for browsing and operating OpenCode sessions per workspace folder. It starts `opencode serve` for each workspace, shows grouped sessions in the Activity Bar sidebar, opens session tabs with a local webview UI, and adds enhanced workflows such as search, tags, subagents, theme presets, and status bar entry points. The local `opencode/` directory is only a symlink to the upstream repo for reference; do not import from it, depend on it at runtime, or commit it.

- `src/`: extension source code
  - `src/core/`: workspace runtime, SDK access, capabilities, commands, launch context, event streaming, session state, tags, status bar, and tab orchestration
  - `src/sidebar/`: TreeDataProvider, tree items, focused session tracking, subagent activity, tree sync, and sidebar webviews for todo, diff, subagents, and session companion views
  - `src/panel/`: session panel provider, serializer, shared reducers/helpers, host-side controller logic, and the panel webview app and HTML shell
  - `src/bridge/`: typed host/webview message contracts and panel constants
- `src/test/`: cross-module, integration-style, parity, and extension-level regression tests
- `images/`: extension icons and activity bar assets
- `dist/`: compiled extension and webview bundle output
- `README.md`: user-facing product overview, commands, settings, and workflows
- `package.json`: extension manifest, commands, views, menus, activation events, settings, and build scripts
- `AGENTS.md`: instructions for agentic coding agents in this repository
- `.memory/`: local memory log, git ignored
- `opencode/`: local upstream symlink for reference only, git ignored

## General Working Principles

These guidelines are intended to reduce common LLM coding mistakes. Apply them together with the repository-specific rules below. When a rule below is more specific, follow the more specific rule.

**Tradeoff**: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them instead of picking silently.
- If a simpler approach exists, say so.
- If something is unclear, stop, name what is confusing, and ask.

### 2. Simplicity First

**Write the minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility or configurability that was not requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, simplify.

Ask yourself: would a senior engineer say this is overcomplicated? If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Do not improve adjacent code, comments, or formatting unless required by the task.
- Do not refactor things that are not broken.
- Match the existing style, even if you would do it differently.
- If you notice unrelated dead code, mention it instead of deleting it.

When your changes create orphans:
- Remove imports, variables, or functions that your changes made unused.
- Do not remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria and verify them.**

Transform tasks into verifiable goals:
- Add validation -> write tests for invalid inputs, then make them pass.
- Fix a bug -> write a test that reproduces it, then make it pass.
- Refactor code -> ensure tests pass before and after.

For multi-step tasks, state a brief plan:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let you loop independently. Weak criteria like "make it work" require constant clarification.

## MOST IMPORTANT RULES

- DO NOT modify AGENTS.md unless the user permits it by explicitly asking you to do so.
- When you adding new feature or fixing a bug, please consider about how to minimize the impact on the existing code, which means modify codes as less as possible.
- When you want to ask user for making decisions, if there is a `question` tool or `ask_user` tool, prefer to use it instead of asking the user directly. If there is no suitable tool, ask the user directly.
- Before making any changes, write a TODO list to remind yourself to implement the features later, if there is a `todo` tool, prefer to use it instead of writing the TODO list manually.
- Before you start writing code, you need to inform the user of the solution you intend to adopt. Only after discussing and confirming with the user should you begin the work. And also remember that DO NOT ASK ANY QUESTIONS IN SUBAGENTS.
- Test-driven development is required for every feature, bug fix, and behavior change. Write the test first, verify it fails for the expected reason, then implement the minimal code needed to make it pass.
- Refactors must be protected by tests before changing production code. If the current behavior is not covered, add or update characterization tests first, then refactor while keeping the test suite green.
- Exceptions are limited to throwaway prototypes, generated code, or configuration-only changes, and should be called out explicitly to the user before proceeding.

## Run / Build / Lint / Test

- Package manager: `bun` (`packageManager: bun@1.3.10`).
- Install dependencies: `bun install`.
- Main development validation: `bun run check-types && bun run lint && bun run compile`.
- Type-check only: `bun run check-types`.
- Lint only: `bun run lint`.
- Development build: `bun run compile`.
- Production package build: `bun run package`.
- Prepublish hook: `bun run vscode:prepublish`.
- Watch esbuild bundle: `bun run watch:esbuild`.
- Watch TypeScript only: `bun run watch:tsc`.
- Current test command: `bun run test`.
- Default test scope: `bun run test` runs `bun test ./src/panel ./src/test` so only this extension's local tests run, not the upstream `opencode/` symlink tree.
- Current single-test support: `bun test path/to/file.test.ts`.
- Test placement convention:
  - Keep module-local unit tests next to the code they cover, such as `src/panel/**/foo.test.ts`.
  - Put cross-module, integration-style, and parity tests under `src/test/`.
  - Do not add new tests under the local `opencode/` symlink.
- Commands, views, menus, activation events, and settings are declared in `package.json`. When changing any of them, update the implementation, manifest entries, and impacted tests together.
- Build pipeline details from `package.json`:
  - `compile`: runs type-check, lint, then `node esbuild.js`
  - `package`: runs type-check, lint, then `node esbuild.js --production`
- Prefer validating code changes before handing work back, especially for edits under `src/core/`, `src/panel/`, `src/sidebar/`, or `src/bridge/`.
- No Cursor rules were found in `.cursor/rules/` or `.cursorrules` as of this file update.
- No Copilot rules were found in `.github/copilot-instructions.md` as of this file update.
- Do not run repo workflow commands against the local `opencode/` symlink.

## Code Style

- Language and toolchain:
  - The repo is TypeScript-first with React TSX for webviews and CSS for styling.
  - `tsconfig.json` uses `strict: true`, `module: Node16`, `moduleResolution: Node16`, `target: ES2022`, and `jsx: react-jsx`.
  - Preserve strict typing; do not weaken types with `any`, broad casts, or untyped message payloads.
- Imports:
  - Keep imports simple: external modules first, then local relative imports.
  - Use `import * as vscode from "vscode"` for VS Code APIs.
  - Use `import type` for type-only imports when possible.
  - Prefer short relative paths that match the existing folder structure; do not introduce alias systems casually.
- Formatting:
  - Match the existing style: double quotes, semicolons omitted, and 2-space indentation.
  - Prefer small functions, early returns, and lightweight helpers over deep nesting.
  - Keep lines readable; extract helpers instead of piling on conditional branches.
  - Add comments only when a block is not obvious from surrounding code.
- Naming:
  - Classes, React components, and exported types use PascalCase.
  - Functions, methods, variables, fields, and hooks use camelCase.
  - Keep command ids, view ids, and panel ids in the existing `opencode-ui.*` namespace.
  - Reuse domain names already established in the repo such as `mgr`, `rt`, `dir`, `sessionId`, `workspaceName`, `panel`, and `snapshot`.
- Types and contracts:
  - Keep host/webview protocol changes synchronized across `src/bridge/types.ts`, panel host code, and webview consumers.
  - Define explicit message shapes and prefer discriminated unions for host/webview traffic and runtime events.
  - Keep SDK-facing shapes centralized in `src/core/sdk.ts` when extending OpenCode API data.
  - Avoid optional state that can be derived cheaply; compute derived values in helpers/selectors where practical.
- Error handling:
  - Prefer early guards for missing workspace folders, runtime state, SDK availability, panel state, or session data.
  - Convert unknown errors into readable strings before showing them to users.
  - User-facing failures should usually go through `vscode.window.showErrorMessage` or `vscode.window.showInformationMessage`.
  - Operational details and recovery notes should also be written to the `OpenCode UI` output channel when helpful.
  - Keep reconnection, refresh, and fallback paths explicit in runtime and event-stream code.
- VS Code extension structure:
  - Keep extension activation, server lifecycle, SDK access, event streaming, and session orchestration in `src/core/`.
  - Keep sidebar rendering and tree concerns in `src/sidebar/`.
  - Keep session panel host lifecycle, reducer/controller logic, and serializer behavior in `src/panel/`.
  - Keep bridge contracts in `src/bridge/`; do not scatter duplicated message types across the repo.
- Webview and UI rules:
  - Keep the local webview implementation independent from the upstream `opencode/` codebase.
  - You may study the symlinked upstream repo for ideas, but do not import from it or copy large subsystems wholesale.
  - Favor incremental UI changes that preserve current behavior, visual semantics, and host/webview protocol meaning.
  - Keep CSS split by concern and place new selectors in the closest existing stylesheet instead of creating overlapping rule sets.
- Session and workspace behavior:
  - Always preserve the `dir` dimension; this extension is designed around per-workspace runtimes.
  - Keep one session panel per `dir + sessionId`.
  - When calling workspace-scoped session APIs, pass `directory: rt.dir` explicitly.
  - Avoid changes that blur responsibilities between runtime management, session state, sidebar state, and panel state.
- React and state patterns:
  - Follow existing functional component and hook patterns in `src/panel/webview/` and `src/sidebar/webview/`.
  - Keep local state minimal and derive display state from snapshots where possible.
  - Prefer passing typed callbacks and small props objects over loose bags of optional values.
- Lint-driven conventions and hygiene:
  - Unused parameters that must exist should be prefixed with `_` to satisfy ESLint.
  - Do not leave dead locals, stale imports, or commented-out code behind.
  - Avoid unrelated file churn during focused refactors or bug fixes.
  - Never commit `opencode/` or `.memory/`.
  - Treat `package.json`, `README.md`, and the current `src/` structure as the source of truth for commands, views, settings, and architecture. If a future `PLAN.md` is added, use it for milestone status and architectural constraints.
  - If you change user-visible commands, settings, views, labels, or workflows, update `README.md` and `AGENTS.md` when those descriptions become stale.
  - If you change workflow assumptions or repo commands, update this file accordingly.

## Git Commit Message Style

The git commit message style should be composed of two parts: title and body. The title should be `<type>: <subject>` (such as `feat: add new feature` or `fix: fix bug`). The body should be the detailed description of the changes in list format.

It's important that DO NOT include any symbol like $ or ` in the title or body. This would cause the bash shell to interpret the title or body as a command or a code block.
