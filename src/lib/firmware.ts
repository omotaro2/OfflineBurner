export const USER_AGENT = "field-shelf/0.1"

export type GithubRelease = {
  tag_name: string
  name: string
  draft: boolean
  prerelease: boolean
  published_at: string
  html_url: string
  assets: { name: string; browser_download_url: string; size: number; download_count: number }[]
}

export type RemoteRelease = {
  version: string
  publishedAt: string
  releaseUrl: string
  stars: number
  downloads: number
  downloadsNote: string
  thumbnailUrl: string
  thumbnailType: string
}

export type FirmwareBytes = {
  label: string
  offset: number
  data: Uint8Array
}

export function pickStableRelease(releases: GithubRelease[]): GithubRelease | null {
  return releases.find((release) => !release.draft && !release.prerelease) ?? null
}

export function versionFromTag(tag: string): string {
  return tag.replace(/^v/, "")
}

export function downloadsForAsset(release: GithubRelease, assetName: string): number {
  const asset = release.assets.find((item) => item.name === assetName)
  if (!asset) {
    throw new Error(`リリースに ${assetName} がありません`)
  }
  return asset.download_count
}

export async function repoStars(repo: string): Promise<number> {
  const body = await fetchJson<{ stargazers_count: number }>(
    `https://api.github.com/repos/${repo}`,
  )
  return body.stargazers_count
}

export function parseHexOffset(offset: string): number {
  const value = Number(offset)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`不正な書き込み位置です: ${offset}`)
  }
  return value
}

export function spiffsOffset(meta: {
  part?: { name: string; offset: string }[]
}): number {
  const spiffs = meta.part?.find((part) => part.name === "spiffs")
  if (!spiffs) {
    throw new Error("littlefs の書き込み位置がマニフェストにありません")
  }
  return parseHexOffset(spiffs.offset)
}

type ZipManifest = {
  parts?: { path: string; offset: string }[]
}

export function partsFromZip(
  files: Record<string, Uint8Array>,
): FirmwareBytes[] {
  const manifestEntry = Object.entries(files).find(([name]) =>
    name.endsWith("manifest.json"),
  )
  if (!manifestEntry) {
    throw new Error("zip に manifest.json がありません")
  }
  const manifest = JSON.parse(new TextDecoder().decode(manifestEntry[1])) as ZipManifest
  if (!manifest.parts?.length) {
    throw new Error("manifest.json に書き込み部品がありません")
  }
  return manifest.parts.map((part) => {
    const base = part.path.split("/").pop() ?? part.path
    const data =
      files[part.path] ??
      Object.entries(files).find(([name]) => name.endsWith(base))?.[1]
    if (!data) {
      throw new Error(`zip に ${part.path} がありません`)
    }
    return { label: base, offset: parseHexOffset(part.offset), data }
  })
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/vnd.github+json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    throw new Error(`取得失敗 ${response.status}: ${url}`)
  }
  return (await response.json()) as T
}

export async function latestStable(repo: string): Promise<GithubRelease> {
  const releases = await fetchJson<GithubRelease[]>(
    `https://api.github.com/repos/${repo}/releases?per_page=20`,
  )
  const stable = pickStableRelease(releases)
  if (!stable) {
    throw new Error(`${repo} に安定版リリースがありません`)
  }
  return stable
}

export async function downloadBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/octet-stream" },
    redirect: "follow",
    signal: AbortSignal.timeout(180_000),
  })
  if (!response.ok) {
    throw new Error(`ダウンロード失敗 ${response.status}: ${url}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}
