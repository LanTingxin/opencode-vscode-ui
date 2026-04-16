import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, test } from "node:test"
import { inflateSync } from "node:zlib"
import * as vscode from "vscode"

import { panelIconPath } from "../panel/provider/utils"

type ExtensionManifest = {
  icon?: string
  contributes?: {
    viewsContainers?: {
      activitybar?: Array<{ icon?: string }>
      secondarySidebar?: Array<{ icon?: string }>
    }
    commands?: Array<{
      command?: string
      icon?: string | { light?: string; dark?: string }
    }>
  }
}

const repoRoot = process.cwd()
const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf8"),
) as ExtensionManifest

function assetExists(relativePath: string) {
  return existsSync(path.join(repoRoot, relativePath))
}

function pngCornerAlpha(relativePath: string) {
  const data = readFileSync(path.join(repoRoot, relativePath))
  const signature = "89504e470d0a1a0a"
  assert.equal(data.subarray(0, 8).toString("hex"), signature)

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks: Buffer[] = []

  while (offset < data.length) {
    const length = data.readUInt32BE(offset)
    offset += 4
    const type = data.subarray(offset, offset + 4).toString("ascii")
    offset += 4
    const chunk = data.subarray(offset, offset + length)
    offset += length
    offset += 4

    if (type === "IHDR") {
      width = chunk.readUInt32BE(0)
      height = chunk.readUInt32BE(4)
      bitDepth = chunk.readUInt8(8)
      colorType = chunk.readUInt8(9)
    }

    if (type === "IDAT") {
      idatChunks.push(chunk)
    }

    if (type === "IEND") {
      break
    }
  }

  assert.equal(bitDepth, 8)
  assert.equal(colorType, 6)

  const bytesPerPixel = 4
  const stride = width * bytesPerPixel
  const inflated = inflateSync(Buffer.concat(idatChunks))
  const rows: Buffer[] = []
  let cursor = 0
  let previous = Buffer.alloc(stride)

  for (let row = 0; row < height; row += 1) {
    const filter = inflated.readUInt8(cursor)
    cursor += 1
    const current = Buffer.from(inflated.subarray(cursor, cursor + stride))
    cursor += stride

    if (filter === 1) {
      for (let index = 0; index < stride; index += 1) {
        const left = index >= bytesPerPixel ? current[index - bytesPerPixel] ?? 0 : 0
        current[index] = (current[index] + left) & 0xff
      }
    } else if (filter === 2) {
      for (let index = 0; index < stride; index += 1) {
        current[index] = (current[index] + (previous[index] ?? 0)) & 0xff
      }
    } else if (filter === 3) {
      for (let index = 0; index < stride; index += 1) {
        const left = index >= bytesPerPixel ? current[index - bytesPerPixel] ?? 0 : 0
        const up = previous[index] ?? 0
        current[index] = (current[index] + Math.floor((left + up) / 2)) & 0xff
      }
    } else if (filter === 4) {
      for (let index = 0; index < stride; index += 1) {
        const left = index >= bytesPerPixel ? current[index - bytesPerPixel] ?? 0 : 0
        const up = previous[index] ?? 0
        const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] ?? 0 : 0
        const predictor = paeth(left, up, upLeft)
        current[index] = (current[index] + predictor) & 0xff
      }
    } else {
      assert.equal(filter, 0)
    }

    rows.push(current)
    previous = current
  }

  const corners = [
    rows[0]?.[3] ?? 0,
    rows[0]?.[stride - 1] ?? 0,
    rows[height - 1]?.[3] ?? 0,
    rows[height - 1]?.[stride - 1] ?? 0,
  ]

  const centerIndex = Math.floor(height / 2)
  const centerOffset = Math.floor(width / 2) * bytesPerPixel + 3
  const center = rows[centerIndex]?.[centerOffset] ?? 0

  return { width, height, corners, center }
}

function paeth(left: number, up: number, upLeft: number) {
  const p = left + up - upLeft
  const leftDistance = Math.abs(p - left)
  const upDistance = Math.abs(p - up)
  const upLeftDistance = Math.abs(p - upLeft)

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left
  }

  if (upDistance <= upLeftDistance) {
    return up
  }

  return upLeft
}

describe("extension icon assets", () => {
  test("manifest icon paths all point to existing files", () => {
    const quickNewSession = manifest.contributes?.commands?.find(
      (command) => command.command === "opencode-ui.quickNewSession",
    )

    const iconPaths = [
      manifest.icon,
      ...manifest.contributes?.viewsContainers?.activitybar?.map((item) => item.icon) ?? [],
      ...manifest.contributes?.viewsContainers?.secondarySidebar?.map((item) => item.icon) ?? [],
      typeof quickNewSession?.icon === "object" ? quickNewSession.icon.light : undefined,
      typeof quickNewSession?.icon === "object" ? quickNewSession.icon.dark : undefined,
    ].filter((value): value is string => Boolean(value))

    assert.ok(iconPaths.length > 0)

    for (const iconPath of iconPaths) {
      assert.equal(assetExists(iconPath), true, `expected asset to exist: ${iconPath}`)
    }
  })

  test("session panels use the png tab icon asset", () => {
    const iconPath = panelIconPath(vscode.Uri.file(repoRoot))
    assert.ok("fsPath" in iconPath)
    assert.equal(iconPath.fsPath, path.join(repoRoot, "images", "tab.png"))
  })

  test("activity bar icon keeps a transparent background", () => {
    const alpha = pngCornerAlpha("images/activity.png")

    assert.equal(alpha.width, alpha.height)
    assert.deepEqual(alpha.corners, [0, 0, 0, 0])
    assert.equal(alpha.center, 0)
  })
})
