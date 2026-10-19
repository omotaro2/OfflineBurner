export type CardEntry = {
  id: string
  name: string
  version: string
  publishedAt: string
  filename: string
  bytes: number
  sha256: string
  kind: "merged" | "app"
}

export type CardManifest = {
  version: 1
  files: CardEntry[]
}

export type Freshness = "same" | "update" | "card-newer" | "missing"

export function filenameFor(id: string): string {
  if (!/^[\w-]{6,80}$/.test(id)) throw new Error("不明なプロジェクトです")
  return `${id}.bin`
}

export function parseManifest(text: string): CardManifest {
  let body: unknown
  try {
    body = JSON.parse(text) as unknown
  } catch {
    return { version: 1, files: [] }
  }
  if (!body || typeof body !== "object" || !Array.isArray((body as { files?: unknown }).files)) {
    return { version: 1, files: [] }
  }
  const files: CardEntry[] = []
  for (const item of (body as { files: unknown[] }).files) {
    const entry = asEntry(item)
    if (entry) files.push(entry)
  }
  return { version: 1, files }
}

export function serializeManifest(manifest: CardManifest): string {
  return JSON.stringify({ version: 1, files: manifest.files }, null, 2)
}

export function freshness(
  card: Pick<CardEntry, "version" | "publishedAt" | "bytes">,
  fileBytes: number | null,
  reference: { version: string; publishedAt: string } | null,
): Freshness {
  if (fileBytes === null || fileBytes !== card.bytes) return "missing"
  if (!reference) return "same"
  if (reference.publishedAt && card.publishedAt) {
    if (reference.publishedAt > card.publishedAt) return "update"
    if (reference.publishedAt < card.publishedAt) return "card-newer"
  }
  if (reference.version && card.version && reference.version !== card.version) return "update"
  return "same"
}

export function upsertEntry(manifest: CardManifest, entry: CardEntry): CardManifest {
  const files = manifest.files.filter((item) => item.id !== entry.id && item.filename !== entry.filename)
  files.push(entry)
  return { version: 1, files }
}

function asEntry(input: unknown): CardEntry | null {
  if (!input || typeof input !== "object") return null
  const raw = input as Partial<CardEntry>
  if (typeof raw.id !== "string" || !/^[\w-]{6,80}$/.test(raw.id)) return null
  if (raw.filename !== filenameFor(raw.id)) return null
  if (raw.kind !== "merged" && raw.kind !== "app") return null
  if (typeof raw.bytes !== "number" || raw.bytes <= 0) return null
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name.slice(0, 80) : raw.id,
    version: typeof raw.version === "string" ? raw.version.slice(0, 32) : "",
    publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt.slice(0, 32) : "",
    filename: raw.filename,
    bytes: raw.bytes,
    sha256: typeof raw.sha256 === "string" ? raw.sha256 : "",
    kind: raw.kind,
  }
}
