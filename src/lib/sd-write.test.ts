import assert from "node:assert/strict"
import { chmod, mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { writeCardFile, writeInPlace } from "./sd-write.ts"

test("writes the bin in place without a swap file", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "field-shelf-sd-"))
  try {
    const file = path.join(dir, "Doom.bin")
    await writeInPlace(file, Buffer.from("first"))
    await writeInPlace(file, Buffer.from("second-payload"))
    assert.equal(await readFile(file, "utf8"), "second-payload")
    const names = await readdir(dir)
    assert.deepEqual(names, ["Doom.bin"])
    assert.equal(names.some((name) => name.endsWith(".crswap")), false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("replaces a file the card exposes as read-only", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "field-shelf-sd-"))
  try {
    const file = path.join(dir, "Doom.bin")
    await writeCardFile(file, Buffer.from("old"))
    await chmod(file, 0o444)
    await writeCardFile(file, Buffer.from("fresh"))
    assert.equal(await readFile(file, "utf8"), "fresh")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
