# Command Attachment SDK Alignment Design

## Summary

This change aligns the VS Code extension with upstream OpenCode behavior for slash commands that include image attachments, especially skill-backed commands such as `/frontend-patterns`.

Upstream OpenCode now sends slash commands through `session.command(...)` and includes uploaded images in `parts`. The server expands the command or skill template first, then appends the uploaded file parts to the resulting prompt parts. The extension currently diverges by dropping attachments on the slash-command path and by exposing a locally narrowed SDK wrapper that omits newer official SDK interfaces.

## Problem

The extension currently has two related gaps:

1. `runSlashCommand` does not carry attachments, so the first send only submits the skill or command text and the image remains queued.
2. `src/core/sdk.ts` hand-defines a partial client surface that has drifted behind the official SDK. In particular, it omits `session.command(..., parts)` even though the installed OpenCode server supports it.

This causes user-visible behavior that differs from upstream OpenCode:

- Upstream: slash command content expands and the image is attached in the same first user message.
- Extension today: either the image is dropped on the command path or a fallback submit sends raw `/skill` text instead of expanded command output.

## Upstream Reference

The upstream implementation in `sst/opencode` currently:

- submits slash commands with `client.session.command({ ..., parts: images.map(...) })`
- defines `SessionPrompt.CommandInput.parts`
- expands template parts server-side and combines them with `input.parts`

The local OpenCode CLI on this machine is `1.4.3`, so the runtime server capability already exists.

## Goals

- Match upstream slash-command behavior for attachments.
- Upgrade `@opencode-ai/sdk` to the current stable version.
- Remove local wrapper drift by exposing the full official client surface, while preserving the extension's existing `find.files(dirs:boolean)` and `event.subscribe({ stream })` compatibility shims.
- Keep the code changes focused and avoid unrelated UI churn.

## Non-Goals

- Redesign the composer UI.
- Change non-command message behavior.
- Refactor unrelated panel, sidebar, or runtime architecture.

## Design

### 1. SDK Alignment

Upgrade `@opencode-ai/sdk` to the current stable release and change the local `Client` type in `src/core/sdk.ts` to be an augmented form of `OfficialOpencodeClient` instead of a hand-maintained subset.

The local wrapper will keep only two compatibility adaptations:

- `find.files` accepts `dirs?: boolean` and converts it to the official string form.
- `event.subscribe` returns `{ stream }` so existing event hub code does not change.

All other official namespaces and methods should remain available through the adapted client automatically.

### 2. Slash Command Attachment Flow

Restore slash commands to the `runSlashCommand` path for all commands, including skill-sourced commands.

When images are attached:

- webview builds slash command host messages with `parts` containing file attachments
- host/controller forwards `parts` through `runSlashCommand`
- provider action calls `rt.sdk.session.command({ ..., parts })`

This matches upstream behavior and lets the server expand command or skill templates before appending image attachments.

### 3. Temporary Fallback Removal

Remove the local fallback that rerouted `skill + image` to `submit`. That fallback fixed attachment delivery but lost server-side command expansion semantics.

### 4. Tests

Add or update tests to cover:

- webview host message generation for slash command plus image attachment
- provider forwarding of `parts` through `session.command`
- sdk adapter compatibility and passthrough behavior

## Risks

- SDK upgrade can expose type drift in places that were previously hidden by the narrowed local wrapper.
- Some official client namespaces may now become visible to the codebase; this is intended, but test fixtures that stub partial clients may need small updates.

## Verification

- targeted webview and provider tests for slash command attachment flow
- sdk adapter tests
- `bun run check-types`
- `bun run lint`
- targeted or broader `bun run test` once affected suites are stable
