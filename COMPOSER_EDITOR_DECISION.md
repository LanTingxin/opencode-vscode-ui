# Composer Editor Decision

## Context

The session composer now matches upstream prompt-part submission semantics and has completed the Phase D hardening pass for textarea mention editing.

That hardening reduced common failure cases, but it did not erase the core architectural mismatch with upstream OpenCode editors.

The extension still uses a plain textarea plus sidecar mention ranges, while upstream uses editor-owned structured mentions:

- the web app uses a contenteditable surface with atomic inline pills
- the TUI uses prompt parts tracked through extmark-like editor ranges

## Decision

Reverse the earlier textarea-only recommendation.

For strict parity goals, the extension should move toward an editor-owned structured mention model with atomic inline tokens.

The primary behavior target for the VS Code webview should be the upstream web app prompt editor, not the current textarea model.

This migration has now started in the extension with a structured inline composer that replaces the old textarea surface.

## Why The Earlier Decision Was Not Sufficient

- textarea plus sidecar ranges can approximate submit semantics, but it cannot faithfully match upstream caret, selection, copy, and deletion behavior around mentions
- mention ranges are still tracked heuristically after raw string edits instead of being owned by the editor surface itself
- richer mention affordances such as line-range-aware files or future inline structured metadata become harder, not easier, on top of textarea text
- if parity is the priority, lower implementation cost is not the right decision gate

## Parity Gaps The Textarea Model Cannot Fully Close

- atomic caret movement across inline mention tokens
- true token selection and deletion semantics
- stable structured mentions under arbitrary mid-token edits
- richer inline metadata on file mentions
- browser-side behavior that mirrors upstream pill insertion and DOM-backed prompt reconstruction

## Target Model

Use the upstream web prompt editor as the main interaction reference.

That means the extension should aim for:

- atomic inline file and agent tokens
- editor-owned structured prompt parts
- insertion that replaces the active `@query` span with a token plus trailing space
- cursor restoration and composition handling aligned with upstream web behavior
- prompt reconstruction from structured editor state instead of textarea diff heuristics

The TUI remains an important semantic reference for prompt-part ownership and range integrity, but the VS Code webview should not try to port TUI rendering primitives directly.

## Implementation Direction

Two upgrade paths are reasonable:

### Option 1 - contenteditable pill editor

- closest visual and interaction match to upstream web app
- highest parity potential
- highest browser and IME complexity

### Option 2 - structured segmented editor

- render text runs and atomic tokens from a controlled structured model
- slightly less direct than upstream web DOM behavior, but still much closer to parity than textarea
- likely safer to maintain in a VS Code webview than full contenteditable mutation handling

## Recommended Path

Move to a structured segmented editor first, while keeping the Phase A submit contract intact.

Reason:

- it closes the main architectural gap by making mentions editor-owned tokens
- it avoids depending on fragile freeform contenteditable mutation parsing as the first migration step
- it keeps the upgrade mostly local to the webview composer while preserving bridge and host submit behavior

If segmented rendering still cannot reach the required parity after prototyping, the next step should be a fuller contenteditable pill implementation modeled on upstream web code.

## Migration Constraints

- preserve the current full-text-first submit payload shape
- keep `agent` and `file` prompt-part typing explicit in the bridge
- avoid importing runtime code from `opencode/`
- keep the migration local to the panel webview as much as possible
- carry forward the Phase D regression expectations where they still apply

## Recommended Next Work

1. Replace the textarea composer with a structured editor model in the webview
2. Render file and agent mentions as atomic inline tokens
3. Rebuild autocomplete insertion around token-aware ranges instead of string diff repair
4. Add focused tests for caret movement, deletion, selection, and prompt serialization on the new model
5. Then continue with Phase F entry-path work on top of the upgraded editor
