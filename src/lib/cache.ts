import { createHash } from "node:crypto"
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { findShelfItem, shelf, type ConnectMode, type ShelfItem } from "./shelf"

export const CACHE_ROOT = path.join(process.cwd(), "data", "cache")

export type CachedPart = {
  file: string
  label: string
  offset: number
  bytes: number
  sha256: string
}

export type CachedFirmware = {
  id: string
  version: string
  publishedAt: string
  releaseUrl: string
  savedAt: string
  chip: ShelfItem["chip"]
  flashSize: ShelfItem["flashSize"]
  flashMode: ShelfItem["flashMode"]
  flashFreq: ShelfItem["flashFreq"]
  connect: ConnectMode
  eraseAll: true
  parts: CachedPart[]
}

function directoryFor(id: string): string {
  if (!findShelfItem(id)) {
    throw new Error("不明なファームウェアです")
  }
  const directory = path.resolve(CACHE_ROOT, id)
  if (!directory.startsWith(CACHE_ROOT + path.sep)) {
    throw new Error("不正な保存先です")
  }
  return directory
}

export async function readCache(id: string): Promise<CachedFirmware | null> {
  try {
    const raw = await readFile(path.join(directoryFor(id), "meta.json"), "utf8")
    return JSON.parse(raw) as CachedFirmware
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

export async function readPart(id: string, file: string): Promise<Buffer> {
  if (!/^part-\d+\.bin$/.test(file)) {
    throw new Error("不明な部品です")
  }
  const directory = directoryFor(id)
  const full = path.resolve(directory, file)
  if (!full.startsWith(directory + path.sep)) {
    throw new Error("不正な部品です")
  }
  return readFile(full)
}

export async function saveLatest(id: string): Promise<CachedFirmware> {
  const item = findShelfItem(id)
  if (!item) throw new Error("不明なファームウェアです")
  const image = await item.download()
  const finalDirectory = directoryFor(id)
  const staging = path.join(CACHE_ROOT, `.staging-${id}-${Date.now()}`)
  await mkdir(staging, { recursive: true })
  try {
    const parts: CachedPart[] = []
    for (const [index, part] of image.parts.entries()) {
      const file = `part-${index}.bin`
      await writeFile(path.join(staging, file), part.data)
      parts.push({
        file,
        label: part.label,
        offset: part.offset,
        bytes: part.data.byteLength,
        sha256: createHash("sha256").update(part.data).digest("hex"),
      })
    }
    const meta: CachedFirmware = {
      id,
      version: image.version,
      publishedAt: image.publishedAt,
      releaseUrl: image.releaseUrl,
      savedAt: new Date().toISOString(),
      chip: item.chip,
      flashSize: item.flashSize,
      flashMode: item.flashMode,
      flashFreq: item.flashFreq,
      connect: item.connect,
      eraseAll: true,
      parts,
    }
    await writeFile(path.join(staging, "meta.json"), JSON.stringify(meta, null, 2))
    const backup = `${finalDirectory}.bak`
    await rm(backup, { recursive: true, force: true })
    if (await exists(finalDirectory)) {
      await rename(finalDirectory, backup)
    }
    try {
      await rename(staging, finalDirectory)
    } catch (error) {
      if (await exists(backup)) {
        await rename(backup, finalDirectory).catch(() => undefined)
      }
      throw error
    }
    await rm(backup, { recursive: true, force: true })
    return meta
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

async function exists(directory: string): Promise<boolean> {
  try {
    await stat(directory)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

export async function listCaches(): Promise<Record<string, CachedFirmware | null>> {
  const entries = await Promise.all(
    shelf.map(async (item) => [item.id, await readCache(item.id)] as const),
  )
  return Object.fromEntries(entries)
}
