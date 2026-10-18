import { unzipSync } from "fflate"
import {
  downloadBytes,
  latestStable,
  partsFromZip,
  spiffsOffset,
  versionFromTag,
  type FirmwareBytes,
  type RemoteRelease,
} from "./firmware"

export type ConnectMode = "default_reset" | "no_reset"

export type DeviceInfo = {
  id: string
  name: string
  portHint: string
  prep: string[]
}

export type FirmwareInfo = {
  id: string
  deviceId: string
  name: string
  summary: string
  cautions: string[]
  chip: "ESP32-S3"
  flashSize: "8MB"
  flashMode: "dio"
  flashFreq: "80m"
  connect: ConnectMode
  eraseAll: true
}

export type ResolvedImage = RemoteRelease & {
  parts: FirmwareBytes[]
}

export type ShelfItem = FirmwareInfo & {
  probe: () => Promise<RemoteRelease>
  download: () => Promise<ResolvedImage>
}

export const devices: DeviceInfo[] = [
  {
    id: "cardputer-adv",
    name: "Cardputer Adv",
    portHint: "USB JTAG/serial（Linux では /dev/ttyACM0）",
    prep: [
      "側面の電源スイッチを OFF にする。",
      "G0 を押したまま USB を挿し、1〜2 秒後に離す。",
      "書き終わって充電に戻すときは、スイッチを ON にする。",
      "Cap LoRa-1262 を載せるときは、起動前にアンテナを付ける。",
    ],
  },
  {
    id: "heltec-v3",
    name: "Heltec WiFi LoRa 32 V3",
    portHint: "CP2102（Linux では /dev/ttyUSB0）",
    prep: [
      "データ対応の USB ケーブルで、ハブを挟まず PC の USB ポートへ挿す。",
      "ブラウザのタブは、このページだけを開く。",
      "ポートを開けないときは、PRG を押したまま RST を一度押し、そのあと PRG を離す。",
      "送信する前にアンテナを付ける。",
    ],
  },
]

const meshtasticHeltec: ShelfItem = {
  id: "meshtastic-heltec-v3",
  deviceId: "heltec-v3",
  name: "Meshtastic",
  summary:
    "公式ファームの安定版です。プレリリースは取りません。factory イメージと littlefs を、8MB のフラッシュへ全消去して書きます。",
  cautions: [
    "端末内の地域設定、チャンネル、メッセージ履歴は消えます。",
    "日本で使うときは、起動後にリージョンを JP にしてください。",
  ],
  chip: "ESP32-S3",
  flashSize: "8MB",
  flashMode: "dio",
  flashFreq: "80m",
  connect: "default_reset",
  eraseAll: true,
  probe: probeMeshtasticHeltec,
  download: downloadMeshtasticHeltec,
}

const meshtasticAdv: ShelfItem = {
  id: "meshtastic-adv-cardputer",
  deviceId: "cardputer-adv",
  name: "Meshtastic ADV",
  summary:
    "Cardputer Adv のキーボードから使う Meshtastic 端末です。フォント入りの merged イメージを先頭から書きます。キャップが無くても、既存ノードと BLE でペアリングできます。",
  cautions: [
    "M5Launcher のアプリ枠ではなく、フラッシュ先頭への全書き込みです。",
    "設定と端末内の履歴は消えます。",
  ],
  chip: "ESP32-S3",
  flashSize: "8MB",
  flashMode: "dio",
  flashFreq: "80m",
  connect: "no_reset",
  eraseAll: true,
  probe: probeMeshtasticAdv,
  download: downloadMeshtasticAdv,
}

const ratspeak: ShelfItem = {
  id: "ratspeak-cardputer",
  deviceId: "cardputer-adv",
  name: "Ratspeak",
  summary:
    "起動時に Standalone と RNode を選ぶ full イメージです。LoRa で送受信するには Cap LoRa-1262 が必要です。",
  cautions: [
    "設定と端末内の履歴は消えます。",
    "Cap LoRa-1262 の技適は 922.0〜923.4 MHz、空中線電力 1.5〜5.0 mW です。EU868 や US915、+22 dBm のままでは使いません。",
  ],
  chip: "ESP32-S3",
  flashSize: "8MB",
  flashMode: "dio",
  flashFreq: "80m",
  connect: "no_reset",
  eraseAll: true,
  probe: probeRatspeak,
  download: downloadRatspeak,
}

export const shelf: ShelfItem[] = [meshtasticAdv, ratspeak, meshtasticHeltec]

export function findShelfItem(id: string): ShelfItem | undefined {
  return shelf.find((item) => item.id === id)
}

async function probeMeshtasticHeltec(): Promise<RemoteRelease> {
  const release = await latestStable("meshtastic/firmware")
  return {
    version: versionFromTag(release.tag_name),
    publishedAt: release.published_at,
    releaseUrl: release.html_url,
  }
}

async function downloadMeshtasticHeltec(): Promise<ResolvedImage> {
  const remote = await probeMeshtasticHeltec()
  const base = `https://raw.githubusercontent.com/meshtastic/meshtastic.github.io/master/firmware-${remote.version}`
  const [factory, littlefs, meta] = await Promise.all([
    downloadBytes(`${base}/firmware-heltec-v3-${remote.version}.factory.bin`),
    downloadBytes(`${base}/littlefs-heltec-v3-${remote.version}.bin`),
    downloadBytes(`${base}/firmware-heltec-v3-${remote.version}.mt.json`),
  ])
  const offset = spiffsOffset(JSON.parse(new TextDecoder().decode(meta)) as {
    part?: { name: string; offset: string }[]
  })
  return {
    ...remote,
    parts: [
      { label: "factory", offset: 0, data: factory },
      { label: "littlefs", offset, data: littlefs },
    ],
  }
}

async function probeMeshtasticAdv(): Promise<RemoteRelease> {
  const release = await latestStable("anton-vinogradov/meshtastic-adv")
  return {
    version: versionFromTag(release.tag_name),
    publishedAt: release.published_at,
    releaseUrl: release.html_url,
  }
}

async function downloadMeshtasticAdv(): Promise<ResolvedImage> {
  const remote = await probeMeshtasticAdv()
  const data = await downloadBytes(
    `https://github.com/anton-vinogradov/meshtastic-adv/releases/download/v${remote.version}/meshtastic-adv-cardputer-adv-merged.bin`,
  )
  return {
    ...remote,
    parts: [{ label: "merged", offset: 0, data }],
  }
}

async function probeRatspeak(): Promise<RemoteRelease> {
  const release = await latestStable("ratspeak/rsCardputer")
  return {
    version: versionFromTag(release.tag_name),
    publishedAt: release.published_at,
    releaseUrl: release.html_url,
  }
}

async function downloadRatspeak(): Promise<ResolvedImage> {
  const remote = await probeRatspeak()
  const zip = await downloadBytes(
    `https://github.com/ratspeak/rsCardputer/releases/download/v${remote.version}/rscardputer-full.zip`,
  )
  return {
    ...remote,
    parts: partsFromZip(unzipSync(zip)),
  }
}
