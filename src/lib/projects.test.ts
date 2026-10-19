import assert from "node:assert/strict"
import test from "node:test"
import { coverFile, githubLink, inspectImage, toProjectCard } from "./projects.ts"

const cover = "d635d0b8b77dc66c9d7c42d6758baae6.jpg"

function entry(overrides: Record<string, unknown>) {
  return {
    fid: "4098f31c0a06c447e82b36261466ddd1",
    category: "cardputer",
    name: "Doom for Cardputer",
    description: "A Doom port.",
    author: "romalik",
    download: 10,
    cover,
    github: "https://github.com/romalik/m5cardputer_doom",
    versions: [{ version: "1.2.0", published_at: "2026-01-02" }],
    ...overrides,
  }
}

test("keeps ordinary Cardputer projects", () => {
  const card = toProjectCard(entry({}))
  assert.ok(card)
  assert.equal(card?.name, "Doom for Cardputer")
  assert.equal(card?.downloads, 10)
  assert.equal(card?.cover, cover)
  assert.equal(card?.version, "1.2.0")
  assert.equal(card?.github, "https://github.com/romalik/m5cardputer_doom")
})

test("drops other devices and attack firmware", () => {
  assert.equal(toProjectCard(entry({ category: "stickc" })), null)
  assert.equal(toProjectCard(entry({ name: "Bruce for Cardputer & ADV" })), null)
  assert.equal(toProjectCard(entry({ name: "Marauder for Cardputer" })), null)
  assert.equal(toProjectCard(entry({ name: "EvilMoll" })), null)
  assert.equal(
    toProjectCard(entry({ description: "Wi-Fi scanner, deauth, and a clock." })),
    null,
  )
  assert.equal(
    toProjectCard(entry({ description: "Detect motion through walls with CSI." })),
    null,
  )
})

test("keeps a setup page that only mentions a captive portal", () => {
  const card = toProjectCard(
    entry({
      name: "GeminiPuter",
      description: "Connect to the GeminiPuter-Setup captive portal to set up Wi-Fi.",
    }),
  )
  assert.equal(card?.name, "GeminiPuter")
})

test("keeps Bad Apple and marks shelf repos", () => {
  const apple = toProjectCard(entry({ name: "Bad Apple!! on M5Cardputer" }))
  assert.equal(apple?.name, "Bad Apple!! on M5Cardputer")
  const shelf = toProjectCard(
    entry({
      github: "https://github.com/anton-vinogradov/meshtastic-adv",
    }),
  )
  assert.equal(shelf?.shelfId, "meshtastic-adv-cardputer")
})

test("inspectImage tells a merged card image from an app image", () => {
  const app = new Uint8Array(64)
  app[0] = 0xe9
  assert.equal(inspectImage(app), "app")
  const merged = new Uint8Array(0x10001)
  merged[0] = 0xe9
  merged[0x8000] = 0xaa
  merged[0x8001] = 0x50
  merged[0x10000] = 0xe9
  assert.equal(inspectImage(merged), "merged")
  assert.equal(inspectImage(new Uint8Array([0])), "invalid")
})

test("github and cover values stay on the public hosts", () => {
  assert.equal(githubLink("http://github.com/a/b"), null)
  assert.equal(githubLink("https://example.com/a"), null)
  assert.equal(coverFile("../secret.jpg"), null)
  assert.equal(coverFile(cover), cover)
})
