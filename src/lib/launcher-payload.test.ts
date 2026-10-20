import assert from "node:assert/strict"
import test from "node:test"
import { LAUNCHER_MIN_BYTES, launcherSdImage, sdFilename, uniqueSdFilename } from "./launcher-payload.ts"

test("names the SD file after the project", () => {
  assert.equal(sdFilename("Doom for Cardputer!", "1.2", "4098f31c0a06c447e82b36261466ddd1"), "Doom for Cardputer 1.2.bin")
  assert.equal(sdFilename("   ", "", "4098f31c0a06c447e82b36261466ddd1"), "4098f31c.bin")
})

test("keeps two projects from sharing one filename", () => {
  const id = "4098f31c0a06c447e82b36261466ddd1"
  const first = sdFilename("Doom", "1", id)
  const second = uniqueSdFilename("Doom", "1", "abcdef1234567890abcd", [first])
  assert.equal(second, "Doom 1-abcd.bin")
  assert.notEqual(first, second)
})

test("pads a short app so Launcher can seek to the partition offset", () => {
  const app = new Uint8Array(64)
  app[0] = 0xe9
  const image = launcherSdImage(app)
  assert.equal(image.length, LAUNCHER_MIN_BYTES)
  assert.equal(image[0], 0xe9)
  assert.equal(image[0x8000], 0xff)
  assert.equal(image[0x8001], 0xff)
})

test("extracts the app from a merged image and leaves a data image whole", () => {
  const merged = new Uint8Array(0x10000 + 80)
  merged.fill(0xff)
  merged[0] = 0xe9
  writeEntry(merged, 0, 0x01, 0x02, 0x9000, 0x100)
  writeEntry(merged, 1, 0x00, 0x10, 0x10000, 80)
  merged[0x10000] = 0xe9
  merged[0x10000 + 1] = 0
  const extracted = launcherSdImage(merged)
  assert.equal(extracted.length, LAUNCHER_MIN_BYTES)
  assert.equal(extracted[0], 0xe9)
  assert.equal(extracted[0x8000], 0xff)

  const withData = new Uint8Array(merged)
  writeEntry(withData, 2, 0x01, 0x82, 0x2000, 0x100)
  withData[0x2000] = 0x11
  const kept = launcherSdImage(withData)
  assert.equal(kept.length, withData.length)
  assert.equal(kept[0x8000], 0xaa)
})

function writeEntry(
  data: Uint8Array,
  index: number,
  type: number,
  subtype: number,
  offset: number,
  size: number,
) {
  const cursor = 0x8000 + index * 32
  data[cursor] = 0xaa
  data[cursor + 1] = 0x50
  data[cursor + 2] = type
  data[cursor + 3] = subtype
  data[cursor + 4] = offset & 0xff
  data[cursor + 5] = (offset >> 8) & 0xff
  data[cursor + 6] = (offset >> 16) & 0xff
  data[cursor + 7] = (offset >> 24) & 0xff
  data[cursor + 8] = size & 0xff
  data[cursor + 9] = (size >> 8) & 0xff
  data[cursor + 10] = (size >> 16) & 0xff
  data[cursor + 11] = (size >> 24) & 0xff
}
