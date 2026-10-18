import assert from "node:assert/strict"
import test from "node:test"
import {
  downloadsForAsset,
  parseHexOffset,
  partsFromZip,
  pickStableRelease,
  spiffsOffset,
  versionFromTag,
  type GithubRelease,
} from "./firmware.ts"

const release = (tag: string, prerelease: boolean): GithubRelease => ({
  tag_name: tag,
  name: tag,
  draft: false,
  prerelease,
  published_at: "2026-06-24T00:00:00Z",
  html_url: "https://example.test",
  assets: [],
})

test("pickStableRelease skips prereleases and keeps the newest stable", () => {
  const picked = pickStableRelease([
    release("v2.8.1", true),
    release("v2.7.26", false),
    release("v2.7.25", false),
  ])
  assert.equal(picked?.tag_name, "v2.7.26")
})

test("versionFromTag strips a single leading v", () => {
  assert.equal(versionFromTag("v2.7.26.54e0d8d"), "2.7.26.54e0d8d")
})

test("spiffsOffset reads the partition table", () => {
  assert.equal(
    spiffsOffset({
      part: [
        { name: "app0", offset: "0x10000" },
        { name: "spiffs", offset: "0x670000" },
      ],
    }),
    0x670000,
  )
})

test("partsFromZip follows the manifest offset", () => {
  const manifest = new TextEncoder().encode(
    JSON.stringify({ parts: [{ path: "rscardputer-full.bin", offset: "0x0000" }] }),
  )
  const firmware = new Uint8Array([1, 2, 3, 4])
  const parts = partsFromZip({
    "manifest.json": manifest,
    "rscardputer-full.bin": firmware,
  })
  assert.equal(parts.length, 1)
  assert.equal(parts[0]?.offset, 0)
  assert.equal(parts[0]?.label, "rscardputer-full.bin")
  assert.deepEqual(parts[0]?.data, firmware)
})

test("parseHexOffset rejects garbage", () => {
  assert.throws(() => parseHexOffset("nope"))
})

test("downloadsForAsset reads the named release file", () => {
  const stable = release("v1.1.2", false)
  stable.assets = [
    { name: "merged.bin", browser_download_url: "https://example.test/m", size: 10, download_count: 32 },
    { name: "other.bin", browser_download_url: "https://example.test/o", size: 4, download_count: 2 },
  ]
  assert.equal(downloadsForAsset(stable, "merged.bin"), 32)
  assert.throws(() => downloadsForAsset(stable, "missing.bin"))
})
