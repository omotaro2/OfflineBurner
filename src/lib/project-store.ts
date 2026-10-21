import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { CACHE_ROOT } from "./cache"
import {
  downloadFirmware,
  findProject,
  inspectImage,
  readProjectCover,
  type ImageKind,
} from "./projects"

export type SavedProject = {
  id: string
  name: string
  author: string
  description: string
  cover: string | null
  coverType: string
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
    const meta = JSON.parse(raw) as Partial<SavedProject>
    if (meta.id !== id || (meta.kind !== "merged" && meta.kind !== "app")) return null
    return {
      id,
      name: typeof meta.name === "string" ? meta.name : id,
      author: typeof meta.author === "string" ? meta.author : "",
      description: typeof meta.description === "string" ? meta.description : "",
      cover: typeof meta.cover === "string" && meta.cover ? meta.cover : null,
      coverType: typeof meta.coverType === "string" ? meta.coverType : "",
      version: typeof meta.version === "string" ? meta.version : "",
      publishedAt: typeof meta.publishedAt === "string" ? meta.publishedAt : "",
      bytes: typeof meta.bytes === "number" ? meta.bytes : 0,
      sha256: typeof meta.sha256 === "string" ? meta.sha256 : "",
      kind: meta.kind,
      savedAt: typeof meta.savedAt === "string" ? meta.savedAt : "",
      firmwareFile: typeof meta.firmwareFile === "string" ? meta.firmwareFile : "",
    }
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
    const cover = await cacheCover(staging, project.cover)
    const meta: SavedProject = {
      id,
      name: project.name,
      author: project.author,
      description: project.description,
      cover: cover.file,
      coverType: cover.contentType,
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

export async function readSavedCover(id: string): Promise<{ data: Uint8Array; contentType: string } | null> {
  const meta = await readSavedProject(id)
  if (!meta) return null
  try {
    const data = await readFile(path.join(directoryFor(id), "cover.bin"))
    if (data.byteLength > 0 && data.byteLength <= 4 * 1024 * 1024) {
      return { data, contentType: meta.coverType || contentTypeFor(meta.cover) }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const file = meta.cover
  if (file) {
    try {
      return await readProjectCover(file)
    } catch {
      return null
    }
  }
  try {
    const project = await findProject(id)
    if (!project?.cover) return null
    return await readProjectCover(project.cover)
  } catch {
    return null
  }
}

async function cacheCover(
  staging: string,
  file: string | null,
): Promise<{ file: string | null; contentType: string }> {
  if (!file) return { file: null, contentType: "" }
  try {
    const image = await readProjectCover(file)
    if (!image || image.data.byteLength === 0 || image.data.byteLength > 4 * 1024 * 1024) {
      return { file, contentType: "" }
    }
    await writeFile(path.join(staging, "cover.bin"), image.data)
    return { file, contentType: image.contentType }
  } catch {
    return { file, contentType: "" }
  }
}

function contentTypeFor(file: string | null): string {
  const extension = file?.split(".").pop()?.toLowerCase()
  if (extension === "png") return "image/png"
  if (extension === "webp") return "image/webp"
  if (extension === "gif") return "image/gif"
  return "image/jpeg"
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
