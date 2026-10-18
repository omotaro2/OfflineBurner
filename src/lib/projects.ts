const USER_AGENT = "field-shelf/0.1"

const CATALOG_URL =
  "https://raw.githubusercontent.com/bmorcelli/M5Stack-json-fw/main/v2/all_device_firmware.json"

export const COVER_BASE = "https://m5burner-cdn.m5stack.com/cover/"

const NAME_BLOCK =
  /bruce|marauder|\bnemo\b|pork\s*chop|\bshark\b|ghost[\s-]*esp|bad[\s-]*card|(bit|bus)[\s-]*pirate|pwnagotchi|palnagotchi|m5gotchi|\bevil|killerhack|wifihck|wifi.?hck|\bsniffer\b|\bkiller\b/i

const TEXT_BLOCK =
  /de[\s-]?auth|evil[\s-]?twin|evil[\s-]?portal|handshake|pmkid|wardriv|duckyscript|\bducky\b|key[\s-]?log|bad[\s-]?usb|pentest|wifi[\s-]*kill|beacon[\s-]*spam|packet[\s-]*inject|m5stick-nemo|pr3y\/bruce|brucedevices|esp32marauder|wpa[\s-]*bruteforce|through walls|wifi attacks|ble spam|honeypot|credential listener|raspyjack|\bsniffer\b/i

const SHELF_REPOS: Record<string, string> = {
  "anton-vinogradov/meshtastic-adv": "meshtastic-adv-cardputer",
  "ratspeak/rscardputer": "ratspeak-cardputer",
}

export type ProjectCard = {
  id: string
  name: string
  author: string
  description: string
  downloads: number
  cover: string | null
  github: string | null
  version: string
  publishedAt: string
  shelfId: string | null
}

type RawVersion = { version?: unknown; published_at?: unknown }

type RawFirmware = {
  fid?: unknown
  name?: unknown
  description?: unknown
  cover?: unknown
  category?: unknown
  author?: unknown
  github?: unknown
  download?: unknown
  versions?: unknown
}

const store = globalThis as typeof globalThis & {
  __fieldShelfProjectsV2?: { at: number; projects: ProjectCard[] }
}

export function toProjectCard(input: unknown): ProjectCard | null {
  if (!input || typeof input !== "object") return null
  const raw = input as RawFirmware
  if (String(raw.category ?? "").toLowerCase() !== "cardputer") return null
  const name = clip(raw.name, 80)
  const id = typeof raw.fid === "string" ? raw.fid : ""
  if (!name || !/^[\w-]{6,80}$/.test(id)) return null
  const full = clip(raw.description, 4000)
  if (NAME_BLOCK.test(name) || TEXT_BLOCK.test(`${name}\n${full}`)) return null
  const github = githubLink(raw.github)
  const latest = latestVersion(raw.versions)
  return {
    id,
    name,
    author: clip(raw.author, 40),
    description: clip(full, 180),
    downloads: count(raw.download),
    cover: coverFile(raw.cover),
    github,
    version: latest.version,
    publishedAt: latest.publishedAt,
    shelfId: shelfIdFor(github),
  }
}

export function githubLink(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null
    return url.toString()
  } catch {
    return null
  }
}

export function coverFile(value: unknown): string | null {
  if (typeof value !== "string") return null
  return /^[a-f0-9]{32}\.(jpe?g|png|webp|gif)$/i.test(value) ? value : null
}

export async function listCardputerProjects(): Promise<ProjectCard[]> {
  const memory = store.__fieldShelfProjectsV2
  if (memory && Date.now() - memory.at < 10 * 60_000) return memory.projects
  const response = await fetch(CATALOG_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) {
    throw new Error(`プロジェクト一覧を取得できません (${response.status})`)
  }
  const body = (await response.json()) as unknown
  if (!Array.isArray(body)) {
    throw new Error("プロジェクト一覧の形式が違います")
  }
  const projects = body
    .map((item) => toProjectCard(item))
    .filter((item): item is ProjectCard => item !== null)
    .sort((a, b) => b.downloads - a.downloads)
  store.__fieldShelfProjectsV2 = { at: Date.now(), projects }
  return projects
}

export async function readProjectCover(file: string): Promise<{ data: Uint8Array; contentType: string } | null> {
  const name = coverFile(file)
  if (!name) return null
  const projects = await listCardputerProjects()
  if (!projects.some((project) => project.cover === name)) return null
  const response = await fetch(`${COVER_BASE}${name}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) return null
  const contentType = contentTypeFor(name)
  return { data: new Uint8Array(await response.arrayBuffer()), contentType }
}

function shelfIdFor(github: string | null): string | null {
  if (!github) return null
  const match = github.match(/github\.com\/([^/]+)\/([^/#?]+)/i)
  if (!match) return null
  const repo = `${match[1]}/${match[2].replace(/\.git$/i, "")}`.toLowerCase()
  return SHELF_REPOS[repo] ?? null
}

function latestVersion(value: unknown): { version: string; publishedAt: string } {
  if (!Array.isArray(value)) return { version: "", publishedAt: "" }
  let best = { version: "", publishedAt: "" }
  for (const item of value as RawVersion[]) {
    if (!item || typeof item !== "object") continue
    const publishedAt = typeof item.published_at === "string" ? item.published_at : ""
    const version = typeof item.version === "string" ? clip(item.version, 32) : ""
    if (publishedAt >= best.publishedAt) best = { version, publishedAt }
  }
  return best
}

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return ""
  const flat = value.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max - 1)}…`
}

function count(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number) || number < 0) return 0
  return Math.round(number)
}

function contentTypeFor(file: string): string {
  const extension = file.split(".").pop()?.toLowerCase()
  if (extension === "png") return "image/png"
  if (extension === "webp") return "image/webp"
  if (extension === "gif") return "image/gif"
  return "image/jpeg"
}
