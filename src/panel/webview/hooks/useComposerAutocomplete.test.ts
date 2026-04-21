import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { filterItems, type ComposerAutocompleteItem } from "./useComposerAutocomplete"

function slashItem(label: string, detail = label): ComposerAutocompleteItem {
  return {
    id: `slash:${label}`,
    label,
    detail,
    trigger: "slash",
    kind: "command",
  }
}

describe("filterItems", () => {
  test("caps slash results to the top 50 matches for non-empty queries", () => {
    const items = Array.from({ length: 80 }, (_, index) => {
      const value = `arg-${String(index).padStart(2, "0")}`
      return slashItem(value, `argument ${index}`)
    })

    const result = filterItems(items, "slash", "ar")

    assert.equal(result.length, 50)
    assert.deepEqual(result.map((item) => item.label), items.slice(0, 50).map((item) => item.label))
    assert.ok(result.every((item) => Array.isArray(item.match?.label)))
  })
})
