import assert from "node:assert/strict"
import test from "node:test"
import { chooseCardputerAsset } from "./adv-target.ts"
import { supportsCardputerAdv } from "./projects.ts"

test("keeps projects that name Cardputer Adv", () => {
  assert.equal(supportsCardputerAdv("Doom for Cardputer ADV", "A Doom port."), true)
  assert.equal(supportsCardputerAdv("Mp3_Adv", "Player."), true)
  assert.equal(supportsCardputerAdv("ADVUtil", "Air mouse."), true)
  assert.equal(supportsCardputerAdv("Aura MSX", "Runs on the original Cardputer and the Cardputer-ADV."), true)
  assert.equal(supportsCardputerAdv("Beepbot", "Sequencer for M5Stack Cardputer/ADV/Zero."), true)
  assert.equal(supportsCardputerAdv("Bad Apple!! on M5Cardputer", "It's Bad Apple!! on M5Stack Cardputer ADV!"), true)
})

test("drops original Cardputer projects and Adv exclusions", () => {
  assert.equal(supportsCardputerAdv("Doom for Cardputer", "A Doom port."), false)
  assert.equal(supportsCardputerAdv("2048", "A puzzle."), false)
  assert.equal(supportsCardputerAdv("The Adversary", "A story game for Cardputer."), false)
  assert.equal(supportsCardputerAdv("AdvanceOS", "A shell for Cardputer."), false)
  assert.equal(supportsCardputerAdv("Clock for Cardputer ADV", "Original Cardputer only. Not for Adv."), false)
  assert.equal(supportsCardputerAdv("ツール", "無印専用です。"), false)
})

test("prefers the Adv asset when a release splits bins", () => {
  const names = [
    "meshtastic-cardputer-merged.bin",
    "meshtastic-adv-cardputer-adv-merged.bin",
    "notes.txt",
  ]
  assert.equal(
    chooseCardputerAsset(names, "meshtastic-cardputer-merged.bin"),
    "meshtastic-adv-cardputer-adv-merged.bin",
  )
  assert.equal(
    chooseCardputerAsset(names, "meshtastic-adv-cardputer-adv-merged.bin"),
    "meshtastic-adv-cardputer-adv-merged.bin",
  )
  assert.equal(chooseCardputerAsset(["rscardputer-full.zip"], "rscardputer-full.zip"), "rscardputer-full.zip")
  assert.equal(
    chooseCardputerAsset(["Launcher-m5stack-cardputer.bin"], "Launcher-m5stack-cardputer.bin"),
    "Launcher-m5stack-cardputer.bin",
  )
})
