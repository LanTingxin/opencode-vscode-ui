import React from "react"
import type { ProviderInfo } from "../../../core/sdk"
import type { ComposerModelRef } from "./state"
import { isValidModelRef, modelKey, modelVariants, providerById, providerModelById, sameModelRef } from "../lib/session-meta"

export type ModelPickerItem = {
  id: string
  providerLabel: string
  modelLabel: string
  model: ComposerModelRef
  selected: boolean
  favorite: boolean
  variant?: string
  variantOptions: string[]
}

export type ModelPickerSection = {
  id: string
  label: string
  items: ModelPickerItem[]
}

type FilteredModelPickerSection = ModelPickerSection & {
  items: ModelPickerItem[]
}

export function buildModelPickerSections({
  providers,
  favorites,
  recents,
  currentModel,
  variants,
}: {
  providers: ProviderInfo[]
  favorites: ComposerModelRef[]
  recents: ComposerModelRef[]
  currentModel?: ComposerModelRef
  variants?: Record<string, string>
}): ModelPickerSection[] {
  const seen = new Set<string>()
  const favoriteKeys = new Set(favorites.map((item) => modelKey(item)).filter(Boolean))
  const sections: ModelPickerSection[] = []

  const buildItem = (model: ComposerModelRef): ModelPickerItem | undefined => {
    if (!isValidModelRef(providers, model)) {
      return undefined
    }

    const provider = providerById(providers, model.providerID)
    const providerLabel = provider?.name || model.providerID
    const modelLabel = providerModelById(provider, model.modelID)?.name || model.modelID
    const key = modelKey(model)
    return {
      id: key,
      providerLabel,
      modelLabel,
      model,
      selected: sameModelRef(model, currentModel),
      favorite: favoriteKeys.has(key),
      variant: variants?.[key],
      variantOptions: modelVariants(providers, model),
    }
  }

  const pushSection = (id: string, label: string, models: ComposerModelRef[]) => {
    const items = models
      .map(buildItem)
      .filter((item): item is ModelPickerItem => !!item)
      .filter((item) => {
        if (seen.has(item.id)) {
          return false
        }
        seen.add(item.id)
        return true
      })

    if (items.length > 0) {
      sections.push({ id, label, items })
    }
  }

  pushSection("favorites", "Favorites", favorites)
  pushSection("recent", "Recent", recents)

  for (const provider of providers) {
    const models = Object.values(provider.models ?? {}).map((model) => ({ providerID: provider.id, modelID: model.id }))
    pushSection(`provider:${provider.id}`, provider.name || provider.id, models)
  }

  return sections
}

export function ModelPicker({
  sections,
  currentAgent,
  onClose,
  onOpenProviderDocs,
  onSelect,
  onToggleFavorite,
  onCycleVariant,
}: {
  sections: ModelPickerSection[]
  currentAgent?: string
  onClose: () => void
  onOpenProviderDocs: () => void
  onSelect: (model: ComposerModelRef) => void
  onToggleFavorite: (model: ComposerModelRef) => void
  onCycleVariant: (model: ComposerModelRef) => void
}) {
  const [query, setQuery] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const filteredSections = React.useMemo(() => filterSections(sections, query), [sections, query])
  const flatItems = React.useMemo(() => filteredSections.flatMap((section) => section.items), [filteredSections])
  const [selectedIndex, setSelectedIndex] = React.useState(() => Math.max(0, flatItems.findIndex((item) => item.selected)))
  const activeItem = flatItems[selectedIndex]

  React.useEffect(() => {
    inputRef.current?.focus()
  }, [])

  React.useEffect(() => {
    const nextIndex = flatItems.findIndex((item) => item.selected)
    setSelectedIndex((current) => {
      if (flatItems.length === 0) {
        return 0
      }
      if (current >= 0 && current < flatItems.length) {
        return current
      }
      return nextIndex >= 0 ? nextIndex : 0
    })
  }, [flatItems])

  React.useEffect(() => {
    if (!listRef.current) {
      return
    }
    const node = listRef.current.querySelector<HTMLElement>(`[data-model-index="${selectedIndex}"]`)
    node?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  const move = React.useCallback((delta: number) => {
    setSelectedIndex((current) => clampIndex(current + delta, flatItems.length))
  }, [flatItems.length])

  const chooseActive = React.useCallback(() => {
    if (activeItem) {
      onSelect(activeItem.model)
    }
  }, [activeItem, onSelect])

  const toggleActiveFavorite = React.useCallback(() => {
    if (activeItem) {
      onToggleFavorite(activeItem.model)
    }
  }, [activeItem, onToggleFavorite])

  const cycleActiveVariant = React.useCallback(() => {
    if (activeItem) {
      onCycleVariant(activeItem.model)
    }
  }, [activeItem, onCycleVariant])

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
      setSelectedIndex(Math.max(0, flatItems.length - 1))
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
      return
    }
    if (!event.shiftKey && !event.altKey && !event.metaKey && event.ctrlKey && event.key.toLowerCase() === "f") {
      event.preventDefault()
      toggleActiveFavorite()
      return
    }
    if (!event.shiftKey && !event.altKey && !event.metaKey && event.ctrlKey && event.key.toLowerCase() === "t") {
      event.preventDefault()
      cycleActiveVariant()
      return
    }
    if (!event.shiftKey && !event.altKey && !event.metaKey && event.ctrlKey && event.key.toLowerCase() === "a") {
      event.preventDefault()
      onOpenProviderDocs()
    }
  }, [chooseActive, cycleActiveVariant, flatItems.length, move, onClose, onOpenProviderDocs, toggleActiveFavorite])

  if (sections.length === 0) {
    return (
      <div className="oc-modelPicker" role="dialog" aria-label="Switch model" onKeyDown={onKeyDown}>
        <div className="oc-modelPickerHeader">
          <span className="oc-modelPickerTitle">Switch model</span>
          <span className="oc-modelPickerMeta">No models available</span>
        </div>
        <div className="oc-modelPickerEmptyActions">
          <div className="oc-modelPickerEmptyText">Configure a provider to start switching models in this session.</div>
          <button type="button" className="oc-modelPickerAction" onClick={onOpenProviderDocs}>Open provider docs</button>
        </div>
      </div>
    )
  }

  return (
    <div className="oc-modelPicker" role="dialog" aria-label="Switch model" onKeyDown={onKeyDown}>
      <div className="oc-modelPickerHeader">
        <span className="oc-modelPickerTitle">Switch model</span>
        <span className="oc-modelPickerMeta">{currentAgent || "No agent"}</span>
      </div>
      <div className="oc-modelPickerToolbar">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="oc-modelPickerSearch"
          placeholder="Filter models"
          aria-label="Filter models"
        />
        <button type="button" className="oc-modelPickerToolbarAction" onClick={onOpenProviderDocs}>Docs</button>
      </div>
      <div className="oc-modelPickerSections" ref={listRef}>
        {filteredSections.length > 0 ? filteredSections.map((section) => {
          return (
            <div key={section.id} className="oc-modelPickerSection">
              {!query ? <div className="oc-modelPickerSectionTitle">{section.label}</div> : null}
              <div className="oc-modelPickerList">
                {section.items.map((item) => {
                  const index = flatItems.findIndex((entry) => entry.id === item.id)
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={-1}
                      data-model-index={index}
                      className={`oc-modelPickerItem${item.selected ? " is-selected" : ""}${index === selectedIndex ? " is-active" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => onSelect(item.model)}
                    >
                      <span className="oc-modelPickerItemMain">
                        <span className="oc-modelPickerItemIdentity">
                          <span className="oc-modelPickerItemLabel">{item.modelLabel}</span>
                          <span className="oc-modelPickerItemDetail">{item.providerLabel}</span>
                        </span>
                        <span className="oc-modelPickerItemMeta">
                          {item.variant ? <span className="oc-modelPickerVariant">{item.variant}</span> : null}
                          <button
                            type="button"
                            className={`oc-modelPickerFavoriteToggle${item.favorite ? " is-favorite" : ""}`}
                            aria-label={item.favorite ? "Remove favorite" : "Add favorite"}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              onToggleFavorite(item.model)
                            }}
                          >
                            ★
                          </button>
                        </span>
                      </span>
                      {item.variantOptions.length > 0 ? <span className="oc-modelPickerItemHint">Ctrl+T cycles variant</span> : null}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        }) : <div className="oc-modelPickerEmptyText">No models match "{query}".</div>}
      </div>
    </div>
  )
}

function filterSections(sections: ModelPickerSection[], query: string): FilteredModelPickerSection[] {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return sections
  }

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => [item.modelLabel, item.providerLabel, section.label, item.variant ?? ""].join(" ").toLowerCase().includes(needle)),
    }))
    .filter((section) => section.items.length > 0)
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
