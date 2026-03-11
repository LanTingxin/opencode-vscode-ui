import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { collectDirectoryResults, matchesPath, sortPaths } from "./file-search"

const FIXTURE_PATHS = [
  "README.md",
  "package.json",
  "foo.txt",
  "foo/",
  "foo/bar.txt",
  "foo/bar/",
  "foo/bar/baz.txt",
  "nested/",
  "nested/foo/",
  "nested/foo/file.txt",
  "src/",
  "src/app.ts",
  "src/components/",
  "src/components/button.tsx",
  ".env",
  ".github/",
  ".github/workflows/",
  ".github/workflows/ci.yml",
  "config/",
  "config/.hidden/",
  "config/.hidden/file.txt",
]

describe("directory mention matching", () => {
  test("matches a top-level directory without trailing slash", () => {
    const results = collectDirectoryResults(["src/", "src/app/", "src/web/"], "src")

    assert.ok(results.map((item) => item.path).includes("src/"))
  })

  test("matches a nested directory without trailing slash", () => {
    const results = collectDirectoryResults(["src/", "src/app/", "src/web/"], "src/app")

    assert.ok(results.map((item) => item.path).includes("src/app/"))
  })

  test("treats slash-suffixed directory candidates as matchable by raw query", () => {
    assert.equal(matchesPath("src/", "src"), true)
    assert.equal(matchesPath("src/app/", "src/app"), true)
    assert.equal(matchesPath("src/app/", "src/a"), true)
  })

  test("keeps child files visible for nested path-prefix queries", () => {
    const results = sortPaths([
      "src/app/",
      "src/app/index.ts",
      "src/app/index.test.ts",
      "src/web/index.ts",
    ], "src/app")

    assert.ok(results.includes("src/app/"))
    assert.ok(results.includes("src/app/index.ts"))
    assert.ok(results.includes("src/app/index.test.ts"))
  })

  test("matches root-level basename queries", () => {
    const results = sortPaths([
      "index.ts",
      "index.test.ts",
      "src/app/index.ts",
      "package.json",
    ], "index")

    assert.ok(results.includes("index.ts"))
    assert.ok(results.includes("index.test.ts"))
    assert.ok(results.includes("src/app/index.ts"))
  })

  test("matches basename queries across files directories and descendants", () => {
    const results = sortPaths(FIXTURE_PATHS, "foo")

    assert.ok(results.includes("foo/"))
    assert.ok(results.includes("foo.txt"))
    assert.ok(results.includes("foo/bar/"))
    assert.ok(results.includes("foo/bar.txt"))
    assert.ok(results.includes("foo/bar/baz.txt"))
    assert.ok(results.includes("nested/foo/"))
    assert.ok(results.includes("nested/foo/file.txt"))
    assert.ok(!results.includes("README.md"))
    assert.ok(!results.includes("src/app.ts"))
  })

  test("matches path-prefix queries with descendants", () => {
    const results = sortPaths(FIXTURE_PATHS, "src/")

    assert.ok(results.includes("src/"))
    assert.ok(results.includes("src/app.ts"))
    assert.ok(results.includes("src/components/"))
    assert.ok(results.includes("src/components/button.tsx"))
    assert.ok(!results.includes("README.md"))
    assert.ok(!results.includes("foo/bar.txt"))
  })

  test("matches nested path-prefix queries", () => {
    const results = sortPaths(FIXTURE_PATHS, "src/co")

    assert.ok(results.includes("src/components/"))
    assert.ok(results.includes("src/components/button.tsx"))
    assert.ok(!results.includes("src/"))
    assert.ok(!results.includes("src/app.ts"))
  })

  test("matches child files under matched directory query", () => {
    const results = sortPaths(FIXTURE_PATHS, "foo/ba")

    assert.ok(results.includes("foo/bar/"))
    assert.ok(results.includes("foo/bar.txt"))
    assert.ok(results.includes("foo/bar/baz.txt"))
    assert.ok(!results.includes("foo.txt"))
    assert.ok(!results.includes("nested/foo/file.txt"))
  })

  test("matches root-level file queries", () => {
    const results = sortPaths(FIXTURE_PATHS, "README")

    assert.ok(results.includes("README.md"))
    assert.ok(!results.includes("src/app.ts"))
    assert.ok(!results.includes("package.json"))
  })

  test("matches fuzzy partial queries", () => {
    const results = sortPaths(FIXTURE_PATHS, "bttn")

    assert.ok(results.includes("src/components/button.tsx"))
    assert.ok(!results.includes("src/app.ts"))
    assert.ok(!results.includes("package.json"))
  })

  test("matches hidden paths consistently", () => {
    const hiddenRoot = sortPaths(FIXTURE_PATHS, ".env")
    const hiddenName = sortPaths(FIXTURE_PATHS, "hidden")
    const hiddenPrefix = sortPaths(FIXTURE_PATHS, "config/.h")

    assert.ok(hiddenRoot.includes(".env"))
    assert.ok(!hiddenRoot.includes("README.md"))

    assert.ok(hiddenName.includes("config/.hidden/"))
    assert.ok(hiddenName.includes("config/.hidden/file.txt"))
    assert.ok(!hiddenName.includes("src/components/button.tsx"))

    assert.ok(hiddenPrefix.includes("config/.hidden/"))
    assert.ok(hiddenPrefix.includes("config/.hidden/file.txt"))
    assert.ok(!hiddenPrefix.includes(".github/workflows/ci.yml"))
  })

  test("collectDirectoryResults only returns matching directories", () => {
    const results = collectDirectoryResults(FIXTURE_PATHS, "src/co")

    assert.ok(results.map((item) => item.path).includes("src/components/"))
    assert.ok(!results.map((item) => item.path).includes("foo/"))
    assert.ok(!results.map((item) => item.path).includes("config/"))
  })
})
