import assert from "node:assert/strict"
import test from "node:test"
import { freshness, filenameFor, parseManifest, serializeManifest, upsertEntry } from "./sd-manifest.ts"

const entry = {
  id: "4098f31c0a06c447e82b36261466ddd1",
  name: "Doom",
  version: "0.1",
  publishedAt: "2024-05-19",
  filename: "4098f31c0a06c447e82b36261466ddd1.bin",
  bytes: 100,
  sha256: "abc",
  kind: "merged" as const,
}

test("manifest keeps valid card entries", () => {
  const text = serializeManifest({ version: 1, files: [entry] })
  assert.deepEqual(parseManifest(text).files, [entry])
  assert.deepEqual(parseManifest("not json").files, [])
  assert.equal(parseManifest(JSON.stringify({ files: [{ id: "../x" }] })).files.length, 0)
})

test("freshness follows the published date and the file size", () => {
  assert.equal(freshness(entry, 100, { version: "0.1", publishedAt: "2024-05-19" }), "same")
  assert.equal(freshness(entry, 100, { version: "0.2", publishedAt: "2026-01-01" }), "update")
  assert.equal(freshness(entry, 100, { version: "0.0", publishedAt: "2024-01-01" }), "card-newer")
  assert.equal(freshness(entry, null, { version: "0.1", publishedAt: "2024-05-19" }), "missing")
  assert.equal(freshness(entry, 90, { version: "0.1", publishedAt: "2024-05-19" }), "missing")
})

test("upsert replaces the same project", () => {
  const next = upsertEntry({ version: 1, files: [entry] }, { ...entry, version: "0.2" })
  assert.equal(next.files.length, 1)
  assert.equal(next.files[0]?.version, "0.2")
  assert.equal(filenameFor(entry.id), entry.filename)
})
