import React from "react"
import type { PanelColorScheme, PanelTheme } from "../../../core/settings"

export type ThemePickerItem = ({
  id: PanelTheme
  kind: "theme"
} | {
  id: PanelColorScheme
  kind: "color"
}) & {
  label: string
  detail: string
  selected: boolean
}

export function buildThemePickerItems(currentTheme: PanelTheme, currentColorScheme: PanelColorScheme): ThemePickerItem[] {
  return [
    {
      id: "classic",
      kind: "theme",
      label: "Classic",
      detail: "Use the standard OpenCode panel styling that follows the active VS Code light or dark theme.",
      selected: currentTheme === "classic",
    },
    {
      id: "codex",
      kind: "theme",
      label: "Codex",
      detail: "Use a more tool-like panel preset with stronger framing while still following the active VS Code light or dark theme.",
      selected: currentTheme === "codex",
    },
    {
      id: "claude",
      kind: "theme",
      label: "Claude",
      detail: "Use a softer panel preset with gentler surfaces while still following the active VS Code light or dark theme.",
      selected: currentTheme === "claude",
    },
    {
      id: "default",
      kind: "color",
      label: "Default",
      detail: "Use the color palette designed for the selected panel preset.",
      selected: currentColorScheme === "default",
    },
    {
      id: "nocturne",
      kind: "color",
      label: "Nocturne",
      detail: "Use a night-focused blue, violet, cyan, and soft amber palette.",
      selected: currentColorScheme === "nocturne",
    },
    {
      id: "orchid",
      kind: "color",
      label: "Orchid",
      detail: "Use a muted mauve, rose, sage, and apricot palette.",
      selected: currentColorScheme === "orchid",
    },
    {
      id: "verdant",
      kind: "color",
      label: "Verdant",
      detail: "Use a sage, teal, lake blue, and wheat palette for long reading sessions.",
      selected: currentColorScheme === "verdant",
    },
    {
      id: "solar",
      kind: "color",
      label: "Solar",
      detail: "Use a solarized cyan, blue, olive, and amber palette with low fatigue contrast.",
      selected: currentColorScheme === "solar",
    },
    {
      id: "graphite",
      kind: "color",
      label: "Graphite",
      detail: "Use a neutral blue-gray, teal, brass, and copper palette.",
      selected: currentColorScheme === "graphite",
    },
    {
      id: "ember",
      kind: "color",
      label: "Ember",
      detail: "Use a restrained ember, olive, mint, and cyan palette.",
      selected: currentColorScheme === "ember",
    },
  ]
}

export function ThemePicker({
  items,
  onClose,
  onSelect,
}: {
  items: ThemePickerItem[]
  onClose: () => void
  onSelect: (item: ThemePickerItem) => void
}) {
  const [query, setQuery] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const filteredItems = React.useMemo(() => filterItems(items, query), [items, query])
  const [selectedIndex, setSelectedIndex] = React.useState(() => Math.max(0, filteredItems.findIndex((item) => item.selected)))
  const activeItem = filteredItems[selectedIndex]

  React.useEffect(() => {
    inputRef.current?.focus()
  }, [])

  React.useEffect(() => {
    const nextIndex = filteredItems.findIndex((item) => item.selected)
    setSelectedIndex((current) => {
      if (filteredItems.length === 0) {
        return 0
      }
      if (current >= 0 && current < filteredItems.length) {
        return current
      }
      return nextIndex >= 0 ? nextIndex : 0
    })
  }, [filteredItems])

  React.useEffect(() => {
    if (!listRef.current) {
      return
    }
    const node = listRef.current.querySelector<HTMLElement>(`[data-theme-index="${selectedIndex}"]`)
    node?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  const move = React.useCallback((delta: number) => {
    setSelectedIndex((current) => clampIndex(current + delta, filteredItems.length))
  }, [filteredItems.length])

  const chooseActive = React.useCallback(() => {
    if (activeItem) {
      onSelect(activeItem)
    }
  }, [activeItem, onSelect])

  const onKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || (!event.shiftKey && !event.altKey && !event.metaKey && event.ctrlKey && event.key.toLowerCase() === "n")) {
      event.preventDefault()
      move(1)
      return
    }
    if (event.key === "ArrowUp" || (!event.shiftKey && !event.altKey && !event.metaKey && event.ctrlKey && event.key.toLowerCase() === "p")) {
      event.preventDefault()
      move(-1)
      return
    }
    if (event.key === "PageDown") {
      event.preventDefault()
      move(10)
      return
    }
    if (event.key === "PageUp") {
      event.preventDefault()
      move(-10)
      return
    }
    if (event.key === "Home") {
      event.preventDefault()
      setSelectedIndex(0)
      return
    }
    if (event.key === "End") {
      event.preventDefault()
      setSelectedIndex(Math.max(0, filteredItems.length - 1))
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      chooseActive()
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
    }
  }, [chooseActive, filteredItems.length, move, onClose])

  return (
    <div className="oc-modelPicker" role="dialog" aria-label="Switch theme" onKeyDown={onKeyDown}>
      <div className="oc-modelPickerTop">
        <div className="oc-modelPickerHeader">
          <span className="oc-modelPickerTitle">Switch theme</span>
          <span className="oc-modelPickerMeta">Presets and colors</span>
        </div>
        <div className="oc-modelPickerToolbar">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="oc-modelPickerSearch"
            placeholder="Filter themes"
            aria-label="Filter themes"
          />
        </div>
      </div>
      <div className="oc-modelPickerSections" ref={listRef}>
        {filteredItems.length > 0 ? (
          themePickerSections(filteredItems).map((section) => (
            <div key={section.kind} className="oc-modelPickerSection">
              {!query ? <div className="oc-modelPickerSectionTitle">{section.label}</div> : null}
              <div className="oc-modelPickerList">
                {section.items.map((item) => {
                  const index = filteredItems.findIndex((entry) => entry.kind === item.kind && entry.id === item.id)
                  return (
                    <div
                      key={`${item.kind}:${item.id}`}
                      role="button"
                      tabIndex={-1}
                      data-theme-index={index}
                      className={`oc-modelPickerItem${item.selected ? " is-selected" : ""}${index === selectedIndex ? " is-active" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => onSelect(item)}
                    >
                      <span className="oc-modelPickerItemMain">
                        <span className="oc-modelPickerItemIdentity">
                          <span className="oc-modelPickerItemLabel">{item.label}</span>
                          <span className="oc-modelPickerItemDetail">{item.detail}</span>
                        </span>
                        <span className="oc-modelPickerItemKind">{item.kind === "theme" ? "Preset" : "Color"}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        ) : <div className="oc-modelPickerEmptyText">No themes match "{query}".</div>}
      </div>
    </div>
  )
}

function themePickerSections(items: ThemePickerItem[]) {
  return [
    { kind: "theme" as const, label: "Presets", items: items.filter((item) => item.kind === "theme") },
    { kind: "color" as const, label: "Colors", items: items.filter((item) => item.kind === "color") },
  ].filter((section) => section.items.length > 0)
}

function filterItems(items: ThemePickerItem[], query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return items
  }

  return items.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(needle))
}

function clampIndex(index: number, size: number) {
  if (size <= 0) {
    return 0
  }
  if (index < 0) {
    return 0
  }
  if (index >= size) {
    return size - 1
  }
  return index
}
