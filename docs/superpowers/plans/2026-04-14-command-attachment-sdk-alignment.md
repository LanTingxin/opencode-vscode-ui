# Command Attachment SDK Alignment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align slash command attachments and the local SDK wrapper with current upstream OpenCode behavior.

**Architecture:** Upgrade the official SDK, replace the hand-maintained local client subset with an augmented official client type, and forward slash-command image attachments through `session.command(..., parts)` so server-side command expansion remains intact.

**Tech Stack:** TypeScript, Bun, VS Code extension host APIs, OpenCode SDK v2.

---

## Chunk 1: Specs And SDK Surface

### Task 1: Upgrade the SDK dependency and confirm the target surface

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Reference: `src/core/sdk.ts`

- [ ] **Step 1: Upgrade `@opencode-ai/sdk` to the current stable release**

Run: `bun add @opencode-ai/sdk@1.4.3`

- [ ] **Step 2: Inspect the generated official client types used by this repo**

Run: `rg -n "SessionCommandData|public command<|public promptAsync<" node_modules/@opencode-ai/sdk/dist/v2/gen -g '*.d.ts'`

- [ ] **Step 3: Record the local wrapper mismatch before changing implementation**

Run: `sed -n '387,760p' src/core/sdk.ts`
Expected: hand-maintained `Client` surface that omits official methods and command `parts`

### Task 2: Add failing tests for the official slash-command attachment behavior

**Files:**
- Modify: `src/panel/webview/app/composer-submit.test.ts`
- Modify: `src/panel/provider/actions.test.ts`
- Test: `src/test/sdk-adapter.test.ts`

- [ ] **Step 1: Update slash-command payload tests to expect `runSlashCommand` with `parts`**

- [ ] **Step 2: Add a provider action test that expects `session.command` to receive attachment parts**

- [ ] **Step 3: Add or extend sdk adapter tests to verify passthrough of official namespaces**

- [ ] **Step 4: Run targeted tests to watch them fail**

Run: `bun test src/panel/webview/app/composer-submit.test.ts src/panel/provider/actions.test.ts src/test/sdk-adapter.test.ts`
Expected: failures showing missing command attachment support

## Chunk 2: SDK Wrapper Alignment

### Task 3: Replace the local hand-maintained `Client` subset with an augmented official client type

**Files:**
- Modify: `src/core/sdk.ts`
- Test: `src/test/sdk-adapter.test.ts`

- [ ] **Step 1: Define `Client` as the official client plus local compatibility shims**

- [ ] **Step 2: Keep `find.files(dirs:boolean)` adaptation in `createClientAdapter`**

- [ ] **Step 3: Keep `event.subscribe(...): { stream }` adaptation in `createClientAdapter`**

- [ ] **Step 4: Preserve exported semantic aliases like `SessionInfo`, `SessionMessage`, and `PromptPartInput`**

- [ ] **Step 5: Run sdk adapter tests**

Run: `bun test src/test/sdk-adapter.test.ts`

## Chunk 3: Slash Command Attachment Flow

### Task 4: Carry attachment parts through the webview, host, and provider command path

**Files:**
- Modify: `src/bridge/types.ts`
- Modify: `src/panel/webview/app/composer-submit.ts`
- Modify: `src/panel/webview/app/App.tsx`
- Modify: `src/panel/provider/controller.ts`
- Modify: `src/sidebar/session-view-provider.ts`
- Modify: `src/panel/provider/actions.ts`
- Test: `src/panel/webview/app/composer-submit.test.ts`
- Test: `src/panel/provider/actions.test.ts`

- [ ] **Step 1: Extend `runSlashCommand` webview messages to carry file parts**

- [ ] **Step 2: Make `buildComposerHostMessage()` always keep slash commands on the command path and include image-derived file parts**

- [ ] **Step 3: Remove the temporary `skill + image => submit` fallback**

- [ ] **Step 4: Update controllers to pass command parts into provider actions**

- [ ] **Step 5: Update `runSlashCommand()` to forward `parts` into `rt.sdk.session.command(...)`**

- [ ] **Step 6: Run targeted tests**

Run: `bun test src/panel/webview/app/composer-submit.test.ts src/panel/provider/actions.test.ts`

## Chunk 4: Verification

### Task 5: Run verification for the aligned flow

**Files:**
- Verify only

- [ ] **Step 1: Run type-check**

Run: `bun run check-types`

- [ ] **Step 2: Run lint**

Run: `bun run lint`

- [ ] **Step 3: Run the local extension test suite**

Run: `bun run test`

- [ ] **Step 4: Review diffs for accidental churn**

Run: `git diff -- src/core/sdk.ts src/bridge/types.ts src/panel src/sidebar docs/superpowers`
