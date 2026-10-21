import { unzipSync } from "fflate"
import { chooseCardputerAsset } from "./adv-target"
import {
  downloadBytes,
  downloadsForAsset,
  latestStable,
  partsFromZip,
  repoStars,
  spiffsOffset,
  versionFromTag,
  type FirmwareBytes,
  type GithubRelease,
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
  writesDevice: boolean
  listed: boolean
}

export type ResolvedImage = RemoteRelease & {
  parts: FirmwareBytes[]
  cover: { contentType: string; data: Uint8Array } | null
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
      "プロジェクトは Cardputer Adv 向けだけを出します。無印専用の bin は取りません。",
      "SD へ送るときは、Launcher のメニューで USB を選んだまま、この PC とつなぎます。bin はカードの downloads に入ります。",
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
  writesDevice: true,
  listed: true,
  probe: probeMeshtasticHeltec,
  download: downloadMeshtasticHeltec,
}

const meshtasticAdv: ShelfItem = {
  id: "meshtastic-adv-cardputer",
  deviceId: "cardputer-adv",
  name: "Meshtastic ADV",
  summary:
    "Cardputer Adv のキーボードから使う Meshtastic 端末です。Launcher を消して上書きはしないので、この棚からは書き込みません。",
  cautions: ["安定版の確認と保管だけです。基板への書き込みはしません。"],
  chip: "ESP32-S3",
  flashSize: "8MB",
  flashMode: "dio",
  flashFreq: "80m",
  connect: "no_reset",
  eraseAll: true,
  writesDevice: false,
  listed: true,
  probe: probeMeshtasticAdv,
  download: downloadMeshtasticAdv,
}

const ratspeak: ShelfItem = {
  id: "ratspeak-cardputer",
  deviceId: "cardputer-adv",
  name: "Ratspeak",
  summary:
    "起動時に Standalone と RNode を選ぶ full イメージです。Launcher を消して上書きはしないので、この棚からは書き込みません。",
  cautions: [
    "安定版の確認と保管だけです。基板への書き込みはしません。",
    "Cap LoRa-1262 の技適は 922.0〜923.4 MHz、空中線電力 1.5〜5.0 mW です。",
  ],
  chip: "ESP32-S3",
  flashSize: "8MB",
  flashMode: "dio",
  flashFreq: "80m",
  connect: "no_reset",
  eraseAll: true,
  writesDevice: false,
  listed: true,
  probe: probeRatspeak,
  download: downloadRatspeak,
}

const launcher: ShelfItem = {
  id: "m5launcher-cardputer",
  deviceId: "cardputer-adv",
  name: "M5Launcher（復旧）",
  summary:
    "Cardputer Adv 向けの公式 Launcher です。ふだんのアプリは SD の Install で入れ、この書き込みは Launcher が消えたときだけ使います。",
  cautions: [
    "今入っている Launcher と、そこから入れたアプリは消えます。",
    "公式の Launcher-m5stack-cardputer.bin を書きます。",
  ],
  chip: "ESP32-S3",
  flashSize: "8MB",
  flashMode: "dio",
  flashFreq: "80m",
  connect: "no_reset",
  eraseAll: true,
  writesDevice: true,
  listed: false,
  probe: probeLauncher,
  download: downloadLauncher,
}

export const shelf: ShelfItem[] = [launcher, meshtasticAdv, ratspeak, meshtasticHeltec]

function releaseAsset(release: GithubRelease, preferred: string) {
  const name = chooseCardputerAsset(
    release.assets.map((item) => item.name),
    preferred,
  )
  const asset = release.assets.find((item) => item.name === name)
  if (!asset) throw new Error(`リリースに ${preferred} がありません`)
  return asset
}

export function findShelfItem(id: string): ShelfItem | undefined {
  return shelf.find((item) => item.id === id)
}

const probeCache = new Map<string, { at: number; value: Promise<RemoteRelease> }>()

export function probeShelf(item: ShelfItem): Promise<RemoteRelease> {
  const hit = probeCache.get(item.id)
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value
  const value = item.probe().then(
    (release) => release,
    (error: unknown) => {
      probeCache.delete(item.id)
      throw error
    },
  )
  probeCache.set(item.id, { at: Date.now(), value })
  return value
}

const HELTEC_THUMB = {
  url: "https://meshtastic.org/assets/images/HTIT-WB32LA(F)_V3-bd4009e3b90756e5bc8a679428950e7f.webp",
  contentType: "image/webp",
}
const CARDPUTER_THUMB = {
  url: "https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/1178/Cardputer-Adv_01.webp",
  contentType: "image/webp",
}

async function describeRelease(
  repo: string,
  release: GithubRelease,
  downloads: number,
  downloadsNote: string,
  thumbnail: { url: string; contentType: string },
): Promise<RemoteRelease> {
  return {
    version: versionFromTag(release.tag_name),
    publishedAt: release.published_at,
    releaseUrl: release.html_url,
    stars: await repoStars(repo),
    downloads,
    downloadsNote,
    thumbnailUrl: thumbnail.url,
    thumbnailType: thumbnail.contentType,
  }
}

async function coverFrom(remote: RemoteRelease): Promise<ResolvedImage["cover"]> {
  try {
    return {
      contentType: remote.thumbnailType,
      data: await downloadBytes(remote.thumbnailUrl),
    }
  } catch {
    return null
  }
}

async function probeLauncher(): Promise<RemoteRelease> {
  const release = await latestStable("bmorcelli/Launcher")
  return describeRelease(
    "bmorcelli/Launcher",
    release,
    downloadsForAsset(release, "Launcher-m5stack-cardputer.bin"),
    "Cardputer 用 Launcher のダウンロード回数です。",
    CARDPUTER_THUMB,
  )
}

async function downloadLauncher(): Promise<ResolvedImage> {
  const remote = await probeLauncher()
  const data = await downloadBytes(
    `https://github.com/bmorcelli/Launcher/releases/download/${remote.version}/Launcher-m5stack-cardputer.bin`,
  )
  return {
    ...remote,
    cover: await coverFrom(remote),
    parts: [{ label: "Launcher-m5stack-cardputer.bin", offset: 0, data }],
  }
}

async function probeMeshtasticHeltec(): Promise<RemoteRelease> {
  const release = await latestStable("meshtastic/firmware")
  const version = versionFromTag(release.tag_name)
  return describeRelease(
    "meshtastic/firmware",
    release,
    downloadsForAsset(release, `firmware-esp32s3-${version}.zip`),
    "ESP32-S3 版リリース一式の回数です。Heltec 単体の数ではありません。",
    HELTEC_THUMB,
  )
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
    cover: await coverFrom(remote),
    parts: [
      { label: "factory", offset: 0, data: factory },
      { label: "littlefs", offset, data: littlefs },
    ],
  }
}

async function probeMeshtasticAdv(): Promise<RemoteRelease> {
  const release = await latestStable("anton-vinogradov/meshtastic-adv")
  const version = versionFromTag(release.tag_name)
  const asset = releaseAsset(release, "meshtastic-adv-cardputer-adv-merged.bin")
  return describeRelease(
    "anton-vinogradov/meshtastic-adv",
    release,
    asset.download_count,
    "merged イメージのダウンロード回数です。",
    {
      url: `https://github.com/anton-vinogradov/meshtastic-adv/releases/download/v${version}/meshtastic-adv-hero.gif`,
      contentType: "image/gif",
    },
  )
}

async function downloadMeshtasticAdv(): Promise<ResolvedImage> {
  const remote = await probeMeshtasticAdv()
  const release = await latestStable("anton-vinogradov/meshtastic-adv")
  const asset = releaseAsset(release, "meshtastic-adv-cardputer-adv-merged.bin")
  const data = await downloadBytes(asset.browser_download_url)
  return {
    ...remote,
    cover: await coverFrom(remote),
    parts: [{ label: "merged", offset: 0, data }],
  }
}

async function probeRatspeak(): Promise<RemoteRelease> {
  const release = await latestStable("ratspeak/rsCardputer")
  const asset = releaseAsset(release, "rscardputer-full.zip")
  return describeRelease(
    "ratspeak/rsCardputer",
    release,
    asset.download_count,
    "full パッケージのダウンロード回数です。",
    CARDPUTER_THUMB,
  )
}

async function downloadRatspeak(): Promise<ResolvedImage> {
  const remote = await probeRatspeak()
  const release = await latestStable("ratspeak/rsCardputer")
  const asset = releaseAsset(release, "rscardputer-full.zip")
  const zip = await downloadBytes(asset.browser_download_url)
  return {
    ...remote,
    cover: await coverFrom(remote),
    parts: partsFromZip(unzipSync(zip)),
  }
}
