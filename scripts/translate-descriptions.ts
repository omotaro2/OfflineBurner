import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { toProjectCard } from "../src/lib/projects.ts"

const CATALOG_URL =
  "https://raw.githubusercontent.com/bmorcelli/M5Stack-json-fw/main/v2/all_device_firmware.json"
const OUT = fileURLToPath(new URL("../src/lib/description-ja.json", import.meta.url))
const MARK = "\n8675309\n"

const response = await fetch(CATALOG_URL, {
  headers: { "User-Agent": "field-shelf/0.1", Accept: "application/json" },
})
if (!response.ok) throw new Error(`catalog ${response.status}`)
const body = (await response.json()) as unknown[]
const descriptions = [
  ...new Set(
    body
      .map((item) => toProjectCard(item)?.description ?? "")
      .filter((text) => text.length > 0 && !/[\u3040-\u30ff]/.test(text)),
  ),
]

const dict: Record<string, string> = {}
try {
  const existing = JSON.parse(readFileSync(OUT, "utf8")) as unknown
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    for (const [key, value] of Object.entries(existing)) {
      if (typeof value === "string" && value.trim()) dict[key] = value
    }
  }
} catch {
  // first run
}
const pending = descriptions.filter((text) => !dict[text])
console.log(`pending ${pending.length} of ${descriptions.length}`)
for (let index = 0; index < pending.length; index += 10) {
  const batch = pending.slice(index, index + 10)
  const translated = await translateBatch(batch)
  batch.forEach((source, offset) => {
    dict[source] = translated[offset] || source
  })
  writeDict(dict)
  console.log(`${Math.min(index + batch.length, pending.length)}/${pending.length}`)
}

writeDict(dict)
console.log(`wrote ${Object.keys(dict).length}`)

function writeDict(current: Record<string, string>) {
  const ordered = Object.fromEntries(Object.entries(current).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  writeFileSync(OUT, `${JSON.stringify(ordered, null, 2)}\n`)
}

async function translateBatch(batch: string[]): Promise<string[]> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const url =
        "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ja&dt=t&q=" +
        encodeURIComponent(batch.join(MARK))
      const result = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })
      if (!result.ok) throw new Error(String(result.status))
      const data = (await result.json()) as unknown
      const parts = Array.isArray(data) ? data[0] : null
      if (!Array.isArray(parts)) throw new Error("empty")
      const text = parts
        .map((part) => (Array.isArray(part) ? String(part[0] ?? "") : ""))
        .join("")
      const rows = text.split("8675309").map((row) => row.replace(/\s+/g, " ").trim())
      if (rows.length === batch.length) return rows
      throw new Error(`split ${rows.length}`)
    } catch (error) {
      console.warn("retry", attempt, error instanceof Error ? error.message : error)
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)))
    }
  }
  throw new Error("translation failed")
}
