import { execFile } from "node:child_process"
import { access, constants, mkdir, readdir, readFile, realpath, stat, unlink } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { launcherSdImage, uniqueSdFilename } from "./launcher-payload"
import { readSavedBin, readSavedProject } from "./project-store"
import { isSdFilename, parseManifest, serializeManifest, upsertEntry, type CardEntry, type CardManifest } from "./sd-manifest"
import {
  DOWNLOADS_DIR,
  explainWriteError,
  isBlockDevice,
  isCardMount,
  selectLauncherVolumes,
  type BlockIdentity,
  type LauncherVolume,
  type LsblkNode,
} from "./sd-volume"
import { syncDirectory, writeCardFile } from "./sd-write"

const exec = promisify(execFile)

export type LauncherDrive = LauncherVolume & { writable: boolean }

export type CardShelf = {
  manifest: CardManifest
  sizes: Record<string, number>
}

const NOT_VISIBLE =
  "Launcher の USB が見えていません。Cardputer で Launcher を開き、メニューの USB を選んだまま、この PC とつないでください。"

export async function listLauncherDrives(): Promise<{ drives: LauncherDrive[]; detail: string }> {
  if (process.platform !== "linux") {
    return { drives: [], detail: "Launcher の USB は、この PC が Linux のときにカードとして見えます。" }
  }
  let devices: LsblkNode[] = []
  try {
    const { stdout } = await exec(
      "lsblk",
      ["-J", "-o", "NAME,PATH,TYPE,VENDOR,MODEL,RO,FSTYPE,LABEL,MOUNTPOINT"],
      { timeout: 8000 },
    )
    const parsed = JSON.parse(stdout) as { blockdevices?: LsblkNode[] }
    devices = parsed.blockdevices ?? []
  } catch {
    return { drives: [], detail: "この PC から USB のカード一覧を読めませんでした。" }
  }
  const identities: Record<string, BlockIdentity> = {}
  for (const disk of devices) {
    if ((disk.type ?? "disk") !== "disk") continue
    identities[disk.name] = await readIdentity(disk)
  }
  const drives: LauncherDrive[] = []
  for (const volume of selectLauncherVolumes(devices, identities)) {
    const writable = Boolean(volume.mount) && !volume.readOnly && (await canWrite(volume.mount!))
    drives.push({ ...volume, writable })
  }
  return { drives, detail: "" }
}

export async function readDownloads(cardRoot: string): Promise<CardShelf> {
  const dir = path.join(cardRoot, DOWNLOADS_DIR)
  const sizes: Record<string, number> = {}
  let names: string[] = []
  try {
    names = await readdir(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { manifest: { version: 1, files: [] }, sizes }
    throw error
  }
  for (const name of names) {
    if (!name.endsWith(".bin") || !isSdFilename(name)) continue
    try {
      sizes[name] = (await stat(path.join(dir, name))).size
    } catch {
      // A file can vanish while Launcher leaves USB mode.
    }
  }
  try {
    const text = await readFile(path.join(dir, "manifest.json"), "utf8")
    return { manifest: parseManifest(text), sizes }
  } catch {
    return { manifest: { version: 1, files: [] }, sizes }
  }
}

export async function copySavedToDownloads(
  device: string,
  ids: string[],
): Promise<{ written: number; drive: LauncherDrive; files: CardEntry[]; sizes: Record<string, number> }> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) throw new Error("送る bin がありません。先にオフライン用に保管してください。")
  if (unique.length > 40) throw new Error("一度に送れるのは 40 件までです。")
  for (const id of unique) {
    if (!/^[\w-]{6,80}$/.test(id)) throw new Error("不明なプロジェクトです")
  }
  const drive = await prepareLauncherDrive(device)
  const dir = path.join(drive.mount!, DOWNLOADS_DIR)
  await mkdir(dir, { recursive: true })
  const current = await readDownloads(drive.mount!)
  let manifest = current.manifest
  let written = 0
  for (const id of unique) {
    const saved = await readSavedProject(id)
    if (!saved) throw new Error("保管が見つかりません。先にオフライン用に保管してください。")
    const data = Buffer.from(launcherSdImage(await readSavedBin(id)))
    const previous = manifest.files.find((entry) => entry.id === id)
    const taken = [
      ...manifest.files.filter((entry) => entry.id !== id).map((entry) => entry.filename),
      ...Object.keys(current.sizes).filter((name) => name !== previous?.filename),
    ]
    const filename = filenameForCard(saved.name, saved.version, saved.id, taken)
    if (previous && previous.filename !== filename) {
      await unlink(path.join(dir, previous.filename)).catch(() => undefined)
      delete current.sizes[previous.filename]
    }
    try {
      await writeCardFile(path.join(dir, filename), data)
    } catch (error) {
      throw explainWriteError(error)
    }
    manifest = upsertEntry(manifest, {
      id: saved.id,
      name: saved.name,
      version: saved.version,
      publishedAt: saved.publishedAt,
      filename,
      bytes: data.byteLength,
      sha256: saved.sha256,
      kind: saved.kind,
    })
    current.sizes[filename] = data.byteLength
    written += 1
  }
  try {
    await writeCardFile(path.join(dir, "manifest.json"), Buffer.from(serializeManifest(manifest)))
    await syncDirectory(dir)
  } catch (error) {
    throw explainWriteError(error)
  }
  const next = await readDownloads(drive.mount!)
  return { written, drive, files: next.manifest.files, sizes: next.sizes }
}

export async function prepareLauncherDrive(device: string): Promise<LauncherDrive> {
  if (!isBlockDevice(device)) throw new Error("Launcher の USB ではありません。")
  let drive = await findDrive(device)
  if (!drive) throw new Error(NOT_VISIBLE)
  if (!drive.mount) {
    await mountForUser(device)
    drive = (await waitForMount(device)) ?? drive
  }
  if (!drive.mount) {
    throw new Error("Launcher の USB は見えています。カードを開く前に切れたので、USB モードのままもう一度送ってください。")
  }
  const mount = await safeMount(drive.mount)
  try {
    await probe(mount)
  } catch (error) {
    await remountForUser(device)
    const again = await waitForMount(device)
    if (!again?.mount) throw explainWriteError(error)
    const remounted = await safeMount(again.mount)
    try {
      await probe(remounted)
    } catch (second) {
      throw explainWriteError(second)
    }
    return (await findDrive(device)) ?? { ...again, mount: remounted, writable: true, readOnly: false }
  }
  return (await findDrive(device)) ?? { ...drive, mount, writable: true, readOnly: false }
}

async function probe(mount: string): Promise<void> {
  const dir = path.join(mount, DOWNLOADS_DIR)
  await mkdir(dir, { recursive: true })
  const probePath = path.join(dir, "field-shelf-write.tmp")
  try {
    await writeCardFile(probePath, Buffer.from("ok"))
  } finally {
    await unlink(probePath).catch(() => undefined)
  }
}

async function safeMount(mount: string): Promise<string> {
  let resolved = mount
  try {
    resolved = await realpath(mount)
  } catch (error) {
    throw explainWriteError(error)
  }
  if (!isCardMount(resolved)) {
    throw new Error("Launcher の USB が想定外の場所に見えています。デスクトップに出たカードを閉じて、もう一度 USB を選んでください。")
  }
  return resolved
}

async function findDrive(device: string): Promise<LauncherDrive | null> {
  const { drives } = await listLauncherDrives()
  return drives.find((item) => item.device === device) ?? null
}

async function waitForMount(device: string): Promise<LauncherDrive | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const found = await findDrive(device)
    if (found?.mount) return found
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return findDrive(device)
}

function mountOptions(): string {
  const uid = process.getuid?.() ?? 0
  const gid = process.getgid?.() ?? 0
  return `rw,uid=${uid},gid=${gid},utf8,flush,shortname=mixed,fmask=0111,dmask=0000`
}

async function mountForUser(device: string): Promise<void> {
  try {
    await exec("udisksctl", ["mount", "-b", device, "-o", mountOptions()], { timeout: 20000 })
    return
  } catch {
    // Some sessions reject custom options and still mount the card for the desktop user.
  }
  await exec("udisksctl", ["mount", "-b", device], { timeout: 20000 }).catch(() => undefined)
}

async function remountForUser(device: string): Promise<void> {
  await exec("udisksctl", ["unmount", "-b", device], { timeout: 20000 }).catch(() => undefined)
  await mountForUser(device)
}

async function canWrite(mount: string): Promise<boolean> {
  try {
    await access(mount, constants.W_OK)
    return true
  } catch {
    return false
  }
}

async function readIdentity(disk: LsblkNode): Promise<BlockIdentity> {
  const blank: BlockIdentity = {
    vendor: (disk.vendor ?? "").trim(),
    model: (disk.model ?? "").trim(),
    idVendor: "",
    idProduct: "",
    usbProduct: "",
    usbManufacturer: "",
  }
  const block = `/sys/class/block/${disk.name}`
  const vendor = (await readOptional(path.join(block, "device/vendor"))) || blank.vendor
  const model = (await readOptional(path.join(block, "device/model"))) || blank.model
  let current = path.join(block, "device")
  try {
    current = await realpath(current)
  } catch {
    return { ...blank, vendor, model }
  }
  for (let depth = 0; depth < 12; depth += 1) {
    const idVendor = await readOptional(path.join(current, "idVendor"))
    if (idVendor) {
      return {
        vendor,
        model,
        idVendor,
        idProduct: await readOptional(path.join(current, "idProduct")),
        usbProduct: await readOptional(path.join(current, "product")),
        usbManufacturer: await readOptional(path.join(current, "manufacturer")),
      }
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return { ...blank, vendor, model }
}

async function readOptional(file: string): Promise<string> {
  try {
    return (await readFile(file, "utf8")).trim()
  } catch {
    return ""
  }
}

function filenameForCard(name: string, version: string, id: string, taken: string[]): string {
  const preferred = uniqueSdFilename(name, version, id, taken)
  const clash = taken.some((item) => item.toLowerCase() === preferred.toLowerCase())
  if (!clash) return preferred
  return uniqueSdFilename(name, version, id, [...taken, preferred])
}
