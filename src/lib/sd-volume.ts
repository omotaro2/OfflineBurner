export const DOWNLOADS_DIR = "downloads"

export type BlockIdentity = {
  vendor: string
  model: string
  idVendor: string
  idProduct: string
  usbProduct: string
  usbManufacturer: string
}

export type LsblkNode = {
  name: string
  path?: string | null
  type?: string | null
  vendor?: string | null
  model?: string | null
  ro?: boolean | string | number | null
  fstype?: string | null
  label?: string | null
  mountpoint?: string | null
  children?: LsblkNode[] | null
}

export type LauncherVolume = {
  device: string
  disk: string
  mount: string | null
  label: string
  fstype: string
  readOnly: boolean
}

const CARD_FS = new Set(["vfat", "exfat", "msdos", "fat", "fat32"])

const MOUNT_ROOTS = ["/media/", "/run/media/", "/mnt/", "/var/run/media/"]

export function isLauncherSd(identity: BlockIdentity): boolean {
  const vendor = identity.vendor.trim().toLowerCase()
  const model = identity.model.trim().toLowerCase()
  if (vendor.includes("m5stack") && model.includes("launcher")) return true
  const product = identity.usbProduct.trim().toLowerCase()
  const manufacturer = identity.usbManufacturer.trim().toLowerCase()
  const vid = identity.idVendor.trim().toLowerCase().replace(/^0x/, "")
  return product.includes("launcher") && (manufacturer.includes("m5stack") || vid === "303a")
}

export function isBlockDevice(device: string): boolean {
  return /^\/dev\/(?:sd[a-z]\d*|mmcblk\d+p\d+|nvme\d+n\d+p\d+)$/.test(device)
}

export function isCardMount(mount: string): boolean {
  const normalized = mount.replace(/\/+$/, "") || "/"
  if (
    normalized === "/" ||
    normalized === "/home" ||
    normalized === "/media" ||
    normalized === "/mnt" ||
    normalized === "/run" ||
    normalized === "/run/media" ||
    normalized === "/var/run/media"
  ) {
    return false
  }
  return MOUNT_ROOTS.some((root) => normalized.startsWith(root))
}

export function selectLauncherVolumes(
  devices: LsblkNode[],
  identities: Readonly<Record<string, BlockIdentity>>,
): LauncherVolume[] {
  const volumes: LauncherVolume[] = []
  for (const disk of devices) {
    if ((disk.type ?? "disk") !== "disk") continue
    const identity = identities[disk.name]
    if (!identity || !isLauncherSd(identity)) continue
    const parts = (disk.children ?? []).filter((child) => (child.type ?? "part") === "part")
    const targets = parts.length > 0 ? parts : [disk]
    for (const target of targets) {
      const fstype = (target.fstype ?? "").trim().toLowerCase()
      if (fstype && !CARD_FS.has(fstype)) continue
      const label = (target.label || "").trim()
      volumes.push({
        device: target.path || `/dev/${target.name}`,
        disk: disk.name,
        mount: target.mountpoint?.trim() || null,
        label: label || "Launcher SD",
        fstype: fstype || "vfat",
        readOnly: flag(target.ro),
      })
    }
  }
  volumes.sort((a, b) => Number(Boolean(b.mount)) - Number(Boolean(a.mount)))
  return volumes
}

export function explainWriteError(error: unknown): Error {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""
  if (code === "EROFS" || code === "EACCES" || code === "EPERM") {
    return new Error(
      "カードへの書き込みが権限で止まりました。Launcher の USB を一度終了し、メニューの USB を選び直して、この PC にカードが見えてから送ってください。ファイルマネージャでカードを開いているときは、そのウィンドウを閉じてから送ってください。",
    )
  }
  if (code === "ENOENT" || code === "ENXIO" || code === "ENODEV" || code === "EHOSTDOWN") {
    return new Error("カードが見えなくなりました。Launcher の USB モードのまま、ケーブルを挿し直してください。")
  }
  if (code === "EIO" || code === "ETIMEDOUT") {
    return new Error("転送が途中で切れました。Launcher の USB を入れたまま、もう一度送ってください。")
  }
  if (code === "ENOSPC") {
    return new Error("カードの空きが足りません。downloads の古い bin を消してから送ってください。")
  }
  if (code === "ENOTDIR") {
    return new Error("カードの downloads がフォルダになっていません。Launcher の SD で downloads を確認してください。")
  }
  if (error instanceof Error && error.message) return error
  return new Error("カードへ書けません")
}

function flag(value: boolean | string | number | null | undefined): boolean {
  return value === true || value === 1 || value === "1" || value === "true"
}
