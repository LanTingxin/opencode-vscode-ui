# OpenCode UI Panel Theme System Design

## Goal

Add reliable light-theme support to the OpenCode session panel and introduce a small set of selectable visual presets without turning the panel into a layout-variant system.

## Scope

This slice includes:

1. Full light-theme support for the session panel webview
2. A panel theme preset setting exposed through extension configuration
3. Three preset styles for the panel:
   - `default`
   - `codex`
   - `claude`
4. A token-based theme layer that supports both VS Code dark and VS Code light environments
5. Light visual differentiation between presets through color, radius, border, spacing, and composer treatment

This slice does not include:

- Sidebar brand-style theme presets
- Forced light-only or dark-only overrides independent of VS Code theme
- Large panel layout changes such as moving the composer to a side rail
- Separate theme packs or user-defined custom themes
- Reworking host or transcript data structures

## Product Decisions

### 1. Panel theme preset and light or dark mode are separate concerns

The extension should let users choose a panel style preset, while the actual light or dark rendering should continue to follow the active VS Code theme.

Behavior:

- Users choose `default`, `codex`, or `claude`
- The panel automatically renders the matching dark or light token set based on VS Code theme state
- Switching the editor theme should restyle the panel without needing a separate extension-specific mode toggle

This keeps the setting model small and avoids multiplying the number of combinations to test in the first version.

### 2. First version presets should be visual, not structural

The first preset system should focus on style rather than layout.

Allowed preset differences:

- surface and background hierarchy
- text and border contrast
- roundedness
- card and bubble feel
- composer density and treatment
- hover and accent behavior

Deferred differences:

- moving the composer to a different region
- changing transcript column structure
- major left and right offset logic for turns

This keeps the implementation low-risk while still making each preset feel distinct.

### 3. Theme behavior should be panel-only in this slice

The existing sidebar webviews already follow VS Code theme tokens and should remain aligned with native VS Code surfaces.

Behavior:

- panel webview gets the new preset system
- sidebar webviews continue to follow VS Code theme variables directly
- no attempt is made to give the sidebar `codex` or `claude` styling in this slice

This minimizes churn and keeps the work focused on the session experience where the current dark-only issue is most visible.

### 4. Theme presets should be built on semantic tokens

The panel should not keep growing by hardcoding one-off component overrides per preset. Instead, components should consume semantic variables and presets should primarily redefine those variables.

This is the key design constraint that keeps the system maintainable after the first three presets ship.

## Settings Design

Add a new extension setting:

- `opencode-ui.panelTheme`

Type:

- string enum

Allowed values:

- `default`
- `codex`
- `claude`

Default:

- `default`

Behavior:

- the setting selects the panel preset
- light or dark rendering continues to follow VS Code theme state
- missing or invalid values should fall back to `default`

This setting should be grouped with the existing display-oriented panel settings rather than introducing a separate theme subsystem.

## Architecture

The existing display-settings data flow already reaches the panel host and webview. This slice should extend that flow rather than introducing a new transport path.

Preferred flow:

1. `package.json` contributes `opencode-ui.panelTheme`
2. `src/core/settings.ts` extends `DisplaySettings` to include `panelTheme`
3. `getDisplaySettings()` reads and normalizes the setting
4. `affectsDisplaySettings()` treats the theme preset like other display settings
5. `src/panel/provider/snapshot.ts` keeps sending `display` through the existing snapshot payload
6. `src/panel/webview/app/state.ts` carries `panelTheme` in snapshot state and default state
7. `src/panel/webview/app/App.tsx` places the preset on the root shell element as a data attribute
8. CSS resolves final variables from:
   - selected preset
   - VS Code light or dark theme environment

This keeps host and webview protocol changes minimal and preserves the current snapshot model.

## File-Level Design

### `package.json`

- Add `opencode-ui.panelTheme` to extension configuration
- Describe the three preset options clearly
- Keep the setting machine-overridable to match the existing display settings

### `src/core/settings.ts`

- Extend `DisplaySettings` with a `panelTheme` field
- Add a narrow string union type for supported presets
- Read and normalize the setting in `getDisplaySettings()`
- Include the new key in `affectsDisplaySettings()`

### `src/panel/provider/snapshot.ts`

- No structural transport changes are needed
- Continue including `display` in snapshot payloads, now with `panelTheme`

### `src/panel/webview/app/state.ts`

- Add `panelTheme: "default"` to the initial display fallback
- Preserve normalized `panelTheme` from incoming snapshots
- Fall back to `default` if older snapshots do not provide the field

### `src/panel/webview/app/App.tsx`

- Add a root attribute such as `data-oc-theme`
- Keep attribute assignment localized to the outer shell so the CSS can branch from one stable anchor

### `src/panel/webview/theme.css`

- Convert the current theme file from a dark-only token definition into a semantic token system
- Keep `theme.css` responsible for tokens only, not for component structure
- Define:
  - base semantic variables
  - per-preset overrides
  - dark and light variants for each preset

### Other panel CSS files

Files such as:

- `base.css`
- `layout.css`
- `timeline.css`
- `dock.css`
- `status.css`
- `markdown.css`
- `tool.css`
- `diff.css`

should keep their current responsibility for layout and component rules. They should only be updated where hardcoded visual values need to move to semantic tokens.

## Theme Token Model

The exact names may evolve during implementation, but the token system should cover these semantic groups.

### Surface and text

- canvas background
- primary surface
- inset surface
- control surface
- primary text
- muted text
- accent text

### Border and interaction

- standard border
- strong border
- hover block
- inset hover
- focus or accent border treatment

### Transcript and message styling

- user turn surface
- assistant part surface
- card or dock surface
- empty-state surface
- rail or accent color

### Composer styling

- composer background
- composer border
- composer placeholder or hint text
- composer action background and hover treatment

### Visual shape

- small radius
- medium radius
- large radius
- compact spacing
- regular spacing
- roomy spacing

The `default`, `codex`, and `claude` presets should mostly differ through these values rather than through large component-specific override blocks.

## CSS Strategy

The first implementation should minimize disruption to current structure.

### 1. Keep current stylesheet boundaries

Do not reorganize the entire CSS tree. The goal is to make the existing files theme-aware, not to redesign the stylesheet architecture from scratch.

### 2. Centralize visual decisions in `theme.css`

`theme.css` should become the source of truth for:

- semantic theme tokens
- preset selection
- light and dark branching

Other files should reference tokens and avoid introducing new hardcoded theme values where possible.

### 3. Replace critical hardcoded values incrementally

Implementation should focus on the panel areas that most obviously fail under light themes:

- root background and foreground
- transcript and footer surfaces
- message cards and user turns
- composer
- docks and question cards
- markdown and code block contrast
- diff surfaces
- button and pill states

This should be done incrementally, not as a wholesale rewrite of every selector.

## Preset Intent

### `default`

Intent:

- preserve the current OpenCode look and feel
- keep a strong contrast dark mode
- add a matching light mode that still feels like the same product

### `codex`

Intent:

- more restrained and tool-like
- stronger borders and clearer panel segmentation
- slightly more pronounced rounding and control framing

### `claude`

Intent:

- softer surfaces
- warmer or gentler background hierarchy
- lighter card feel and more relaxed visual density

These intents should guide token choices, but they should not force layout divergence in the first version.

## Testing Strategy

### Automated coverage

Add or extend tests for:

- `src/core/settings.ts`
  - reading `panelTheme`
  - fallback normalization to `default`
  - `affectsDisplaySettings()` reacting to theme changes
- webview snapshot state normalization
  - preserving `panelTheme`
  - defaulting correctly when absent
- panel root rendering
  - applying the theme attribute for the selected preset

The goal is not full visual snapshot testing, but stable coverage for settings flow and state normalization.

### Manual verification

Validate the panel in these combinations:

- VS Code dark with `default`
- VS Code dark with `codex`
- VS Code dark with `claude`
- VS Code light with `default`
- VS Code light with `codex`
- VS Code light with `claude`

Check these UI areas:

- empty state
- regular transcript flow
- user messages
- assistant parts and tool blocks
- permission and question docks
- composer
- markdown rendering
- diff rendering
- status and action controls

## Risks And Mitigations

### Risk: light mode reveals low-contrast surfaces or text

Mitigation:

- define light tokens explicitly instead of deriving them mechanically from dark tokens
- review contrast-sensitive areas such as markdown, diff, and composer states during manual verification

### Risk: some components still depend on dark-only hardcoded values

Mitigation:

- audit panel webview CSS for hardcoded dark backgrounds, white text, and fixed contrast assumptions
- migrate only the values that affect visible rendering in the panel-critical path

### Risk: theme presets become a pile of one-off overrides

Mitigation:

- keep preset differences primarily at the token level
- avoid component-level preset overrides unless a token-only solution is not practical

### Risk: future layout-themed presets need stronger divergence

Mitigation:

- treat this slice as the foundation layer
- defer layout-variant ideas until the token system and preset setting are stable

## Success Criteria

This slice is successful when:

- the session panel renders correctly in both VS Code dark and VS Code light themes
- users can switch between `default`, `codex`, and `claude` presets through settings
- each preset has a distinct but restrained visual identity
- panel layout and behavior remain stable
- the implementation primarily extends existing display settings and CSS structure rather than introducing a new theme transport system

## Approved Implementation Slice

The approved first slice is:

- add light-theme support to the panel webview
- add `opencode-ui.panelTheme`
- ship `default`, `codex`, and `claude` presets
- keep preset differences visual and lightweight
- leave sidebar theming and layout variants for later
