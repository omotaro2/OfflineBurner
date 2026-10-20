const PARTITION = 0x8000
const ENTRY = 32
const TABLE = 0xc00
const HEADER = 24
const SEGMENT = 8
const HASH_LEN = 32
/** M5Launcher seeks here before it will install a file. Shorter bins fail with Update Error. */
export const LAUNCHER_MIN_BYTES = 0x8010

export function sdFilename(name: string, version: string, id: string): string {
  const title = readable(name)
  const revision = readable(version)
  let stem = title || id.slice(0, 8)
  if (revision && stem.length <= 24 && !stem.endsWith(revision)) stem = `${stem} ${revision}`
  stem = stem.replace(/^\.+/, "").slice(0, 60).trim() || id.slice(0, 8)
  return `${stem}.bin`
}

export function uniqueSdFilename(name: string, version: string, id: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const preferred = sdFilename(name, version, id)
  if (!used.has(preferred)) return preferred
  const suffix = id.slice(0, 4).toLowerCase()
  const stem = preferred.slice(0, -4).slice(0, 55).trim()
  return `${stem}-${suffix}.bin`
}

export function launcherSdImage(data: Uint8Array): Uint8Array {
  if (hasPartitionTable(data)) {
    const app = firstApp(data)
    if (!app) throw new Error("アプリ部分を取り出せません")
    if (partitionType(data) === 0x01 && hasInstallableData(data)) return data
    return pad(data.subarray(app.offset, app.offset + app.size))
  }
  if (data.length === 0 || data[0] !== 0xe9) {
    throw new Error("Launcher が入れる形式ではありません")
  }
  return pad(data)
}

function readable(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ._()-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function hasPartitionTable(data: Uint8Array): boolean {
  return data.length >= PARTITION + ENTRY && data[PARTITION] === 0xaa && data[PARTITION + 1] === 0x50
}

function partitionType(data: Uint8Array): number {
  return data[PARTITION + 2] ?? 0
}

function firstApp(data: Uint8Array): { offset: number; size: number } | null {
  const end = Math.min(data.length, PARTITION + TABLE)
  for (let cursor = PARTITION; cursor + ENTRY <= end; cursor += ENTRY) {
    if (data[cursor] === 0xff || data[cursor] === 0xeb) break
    if (data[cursor] !== 0xaa || data[cursor + 1] !== 0x50) break
    const type = data[cursor + 2]
    const subtype = data[cursor + 3]
    if (type !== 0x00 || (subtype !== 0x00 && subtype !== 0x10 && subtype !== 0x20)) continue
    const offset = readU32(data, cursor + 4)
    const declared = readU32(data, cursor + 8)
    if (offset >= data.length || data[offset] !== 0xe9) continue
    const available = Math.min(declared, data.length - offset)
    const measured = measureEspImage(data, offset)
    const size = measured && measured <= available ? measured : available
    if (size > 0) return { offset, size }
  }
  return null
}

function hasInstallableData(data: Uint8Array): boolean {
  const end = Math.min(data.length, PARTITION + TABLE)
  for (let cursor = PARTITION; cursor + ENTRY <= end; cursor += ENTRY) {
    if (data[cursor] === 0xff || data[cursor] === 0xeb) break
    if (data[cursor] !== 0xaa || data[cursor + 1] !== 0x50) break
    const subtype = data[cursor + 3]
    if (data[cursor + 2] !== 0x01 || (subtype !== 0x81 && subtype !== 0x82 && subtype !== 0x83)) continue
    const offset = readU32(data, cursor + 4)
    const declared = readU32(data, cursor + 8)
    if (offset >= data.length || declared === 0) continue
    const sampleEnd = Math.min(data.length, offset + Math.min(declared, 256))
    for (let index = offset; index < sampleEnd; index += 1) {
      if (data[index] !== 0xff) return true
    }
  }
  return false
}

function measureEspImage(data: Uint8Array, offset: number): number | null {
  if (offset + HEADER > data.length || data[offset] !== 0xe9) return null
  const segments = data[offset + 1] ?? 0
  if (segments === 0 || segments > 16) return null
  const hashAppended = (data[offset + 23] ?? 0) !== 0
  let cursor = offset + HEADER
  for (let index = 0; index < segments; index += 1) {
    if (cursor + SEGMENT > data.length) return null
    const size = readU32(data, cursor + 4)
    cursor += SEGMENT
    if (size > data.length || cursor > data.length - size) return null
    cursor += size
  }
  let end = align(cursor, 16) + 1
  if (hashAppended) end += HASH_LEN
  end = align(end, 16)
  if (end <= offset || end > data.length) return null
  return end - offset
}

function pad(image: Uint8Array): Uint8Array {
  const copy = new Uint8Array(image)
  if (copy.length >= LAUNCHER_MIN_BYTES) return copy
  const padded = new Uint8Array(LAUNCHER_MIN_BYTES)
  padded.fill(0xff)
  padded.set(copy)
  return padded
}

function readU32(data: Uint8Array, offset: number): number {
  return (
    (data[offset] ?? 0) |
    ((data[offset + 1] ?? 0) << 8) |
    ((data[offset + 2] ?? 0) << 16) |
    ((data[offset + 3] ?? 0) << 24)
  ) >>> 0
}

function align(value: number, boundary: number): number {
  return (value + boundary - 1) & ~(boundary - 1)
}
