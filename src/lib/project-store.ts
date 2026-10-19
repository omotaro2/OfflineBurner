import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { CACHE_ROOT } from "./cache"
import {
  downloadFirmware,
  findProject,
  inspectImage,
  type ImageKind,
} from "./projects"

export type SavedProject = {
  id: string
  name: string
  author: string
  version: string
  publishedAt: string
  bytes: number
  sha256: string
  kind: Exclude<ImageKind, "unsupported">
  savedAt: string
  firmwareFile: string
}

const ROOT = path.join(CACHE_ROOT, "projects")

export async function listSavedProjects(): Promise<SavedProject[]> {
  let names: string[] = []
  try {
    names = await readdir(ROOT)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
  const saved = await Promise.all(
    names.map((name) => (/^[\w-]{6,80}$/.test(name) ? readSavedProject(name) : Promise.resolve(null))),
  )
  return saved
    .filter((item): item is SavedProject => item !== null)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export async function readSavedProject(id: string): Promise<SavedProject | null> {
  try {
    const raw = await readFile(path.join(directoryFor(id), "meta.json"), "utf8")
    const meta = JSON.parse(raw) as SavedProject
    if (meta.id !== id || (meta.kind !== "merged" && meta.kind !== "app")) return null
    return meta
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

export async function readSavedBin(id: string): Promise<Buffer> {
  const meta = await readSavedProject(id)
  if (!meta) throw new Error("保管が見つかりません")
  return readFile(path.join(directoryFor(id), "image.bin"))
}

export async function saveProject(id: string): Promise<SavedProject> {
  const project = await findProject(id)
  if (!project) throw new Error("一覧にないプロジェクトです")
  if (project.kind === "unsupported" || !project.firmwareFile) {
    throw new Error("このイメージは Cardputer の 8MB に合いません")
  }
  const data = await downloadFirmware(project.firmwareFile)
  const kind = inspectImage(data)
  if (kind === "invalid") {
    throw new Error("ESP のイメージとして読めません")
  }
  const finalDirectory = directoryFor(id)
  const staging = path.join(CACHE_ROOT, `.staging-project-${id}-${Date.now()}`)
  await mkdir(staging, { recursive: true })
  try {
    await writeFile(path.join(staging, "image.bin"), data)
    const meta: SavedProject = {
      id,
      name: project.name,
      author: project.author,
      version: project.version,
      publishedAt: project.publishedAt,
      bytes: data.byteLength,
      sha256: createHash("sha256").update(data).digest("hex"),
      kind,
      savedAt: new Date().toISOString(),
      firmwareFile: project.firmwareFile,
    }
    await writeFile(path.join(staging, "meta.json"), JSON.stringify(meta, null, 2))
    await mkdir(ROOT, { recursive: true })
    const backup = `${finalDirectory}.bak`
    await rm(backup, { recursive: true, force: true })
    if (await exists(finalDirectory)) await rename(finalDirectory, backup)
    try {
      await rename(staging, finalDirectory)
    } catch (error) {
      if (await exists(backup)) await rename(backup, finalDirectory).catch(() => undefined)
      throw error
    }
    await rm(backup, { recursive: true, force: true })
    return meta
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

function directoryFor(id: string): string {
  if (!/^[\w-]{6,80}$/.test(id)) throw new Error("不明なプロジェクトです")
  const directory = path.resolve(ROOT, id)
  if (!directory.startsWith(ROOT + path.sep)) throw new Error("不正な保存先です")
  return directory
}

async function exists(directory: string): Promise<boolean> {
  try {
    await stat(directory)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}
