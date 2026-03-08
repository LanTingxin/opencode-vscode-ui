# opencode-vscode-ui

This repo is the standalone planning and implementation workspace for the opencode VS Code UI project. It is separated from the upstream opencode monorepo, and keeps a local `opencode/` symlink only as a development reference and integration target. Treat the symlinked upstream repo as local-only material and do not commit it from this repository.

- `PLAN.md`: standalone delivery plan for the VS Code UI project
- `AGENTS.md`: local agent instructions for this repository
- `opencode/`: local symlink to the upstream opencode repo, for reference only
- `.memory/`: local memory entries for work completed in this repo

## MOST IMPORTANT RULES

- DO NOT modify AGENTS.md unless the user permits it by explicitly asking you to do so.
- When you adding new feature or fixing a bug, please consider about how to minimize the impact on the existing code, which means modify codes as less as possible.
- When you want to ask user for making decisions, if there is a `question` tool or `ask_user` tool, prefer to use it instead of asking the user directly. If there is no suitable tool, ask the user directly.
- Before making any changes, write a TODO list to remind yourself to implement the features later, if there is a `todo` tool, prefer to use it instead of writing the TODO list manually.
- Before you start writing code, you need to inform the user of the solution you intend to adopt. Only after discussing and confirming with the user should you begin the work. And also remember that DO NOT ASK ANY QUESTIONS IN SUBAGENTS.

## Run / Build / Lint / Test

- There is no standalone runnable extension scaffold at this repo root yet; the current source of truth for implementation direction is `PLAN.md`.
- If you need upstream code for reference, inspect the local `opencode/` symlink, but do not commit changes from that tree into this repo by accident.
- Do not run tests from this repo root unless a dedicated package is added here later.
- When implementation starts, run build, lint, and test commands inside the future package directory created in this repo, or inside the linked upstream workspace only when explicitly working on upstream code.
- Keep `opencode/` ignored by git in this repository.

## Code Style

- Markdown and docs: keep wording concise, implementation-oriented, and explicit about repository boundaries.
- TypeScript: prefer small modules, typed message contracts, and clear separation between extension host code and webview code.
- VS Code extension code: keep process management, SDK access, and VS Code API orchestration in host-side modules, not in webview UI modules.
- Webview UI: reuse upstream ideas selectively, but avoid copying the full upstream app shell when a thinner single-session UI is enough.
- Config and repo hygiene: do not rely on the local `opencode/` symlink as a committed artifact.

## Git Commit Message Style

The git commit message style should be composed of two parts: title and body. The title should be `<type>: <subject>` (such as `feat: add new feature` or `fix: fix bug`). The body should be the detailed description of the changes in list format.

It's important that DO NOT include any symbol like $ or ` in the title or body. This would cause the bash shell to interpret the title or body as a command or a code block.
