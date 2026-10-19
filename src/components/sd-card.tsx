"use client"

import { useCallback, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  filenameFor,
  freshness,
  parseManifest,
  serializeManifest,
  upsertEntry,
  type CardEntry,
  type CardManifest,
  type Freshness,
} from "@/lib/sd-manifest"
import type { SavedBrief } from "@/components/project-browser"
import { RefreshCw, Usb } from "lucide-react"

type SavedFile = SavedBrief & {
  name: string
  bytes: number
  sha256: string
}

type DirectoryHandle = FileSystemDirectoryHandle

type Row = CardEntry & { fileBytes: number | null; state: Freshness; referenceLabel: string }

export function SdCard({
  online,
  saved,
  remote,
  onEnsure,
}: {
  online: boolean
  saved: SavedFile[]
  remote: { id: string; version: string; publishedAt: string }[]
  onEnsure: (id: string) => Promise<void>
}) {
  const [root, setRoot] = useState<DirectoryHandle | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const picker = typeof window !== "undefined" && "showDirectoryPicker" in window

  const reload = useCallback(async (directory: DirectoryHandle) => {
    const { manifest, sizes } = await readShelf(directory)
    setRows(manifest.files.map((entry) => decorate(entry, sizes[entry.filename] ?? null, saved, remote)))
  }, [remote, saved])

  const choose = async () => {
    setError("")
    try {
      const directory = await window.showDirectoryPicker({ mode: "readwrite" })
      setRoot(directory)
      await reload(directory)
      setMessage("field-shelf フォルダを見ています。")
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return
      setError(reason instanceof Error ? reason.message : "フォルダを開けません")
    }
  }

  const copySaved = async () => {
    if (!root) return
    setBusy(true)
    setError("")
    try {
      let manifest = (await readShelf(root)).manifest
      for (const item of saved) {
        manifest = await writeSaved(root, manifest, item)
      }
      await writeManifest(root, manifest)
      await reload(root)
      setMessage(`${saved.length} 件をカードへコピーしました。`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "コピーに失敗しました")
    } finally {
      setBusy(false)
    }
  }

  const updateOld = async () => {
    if (!root) return
    setBusy(true)
    setError("")
    try {
      let manifest = (await readShelf(root)).manifest
      let count = 0
      for (const row of rows) {
        if (row.state !== "update" && row.state !== "missing") continue
        const remoteItem = remote.find((item) => item.id === row.id)
        const savedItem = saved.find((item) => item.id === row.id)
        const reference = remoteItem ?? savedItem
        if (!reference) continue
        if (online && remoteItem && (!savedItem || remoteItem.publishedAt > savedItem.publishedAt)) {
          await onEnsure(row.id)
        }
        const fresh = await fetchSaved(row.id)
        if (!fresh) continue
        manifest = await writeSaved(root, manifest, fresh)
        count += 1
      }
      await writeManifest(root, manifest)
      await reload(root)
      setMessage(count === 0 ? "更新が必要な bin はありません。" : `${count} 件を更新しました。`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "更新に失敗しました")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">SD カード</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          microSD を USB リーダで挿すか、カードが USB ドライブとして見えている状態でフォルダを選びます。Cardputer のシリアル端子からは、カードの中のファイルは見えません。選んだ場所に field-shelf フォルダを作り、bin と台帳を置きます。Launcher の SD からそのフォルダを開き Install すると、Launcher 本体は残ります。
        </p>
      </div>
      {!picker && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">
          このブラウザはフォルダを選べません。Chromium で http://127.0.0.1:43127 を開いてください。
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button className="h-11" variant="outline" disabled={!picker || busy} onClick={() => void choose()}>
          <Usb />
          カードのフォルダを選ぶ
        </Button>
        <Button className="h-11" disabled={!root || busy || saved.length === 0} onClick={() => void copySaved()}>
          {busy ? <RefreshCw className="animate-spin" /> : <Usb />}
          保管済みをコピー
        </Button>
        <Button className="h-11" variant="outline" disabled={!root || busy} onClick={() => void updateOld()}>
          古い bin を更新
        </Button>
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">{error}</p>}
      {root && rows.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>カードにはまだ台帳がありません</CardTitle>
            <CardDescription>保管済みをコピーすると、field-shelf フォルダに bin と manifest.json ができます。</CardDescription>
          </CardHeader>
        </Card>
      )}
      {rows.length > 0 && (
        <div className="grid gap-3">
          {rows.map((row) => (
            <Card key={row.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {row.name}
                  <Badge variant={row.state === "same" ? "secondary" : "outline"}>{labelFor(row.state)}</Badge>
                </CardTitle>
                <CardDescription>
                  カード {row.version || "版不明"}
                  {row.referenceLabel ? ` / 照合 ${row.referenceLabel}` : ""}
                  {row.fileBytes === null ? " / ファイルなし" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{row.filename}</CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}

function decorate(
  entry: CardEntry,
  fileBytes: number | null,
  saved: SavedFile[],
  remote: { id: string; version: string; publishedAt: string }[],
): Row {
  const remoteItem = remote.find((item) => item.id === entry.id)
  const savedItem = saved.find((item) => item.id === entry.id)
  const reference = remoteItem ?? savedItem ?? null
  return {
    ...entry,
    fileBytes,
    state: freshness(entry, fileBytes, reference),
    referenceLabel: reference ? `${reference.version}（${reference.publishedAt || "日付なし"}）` : "",
  }
}

async function readShelf(root: DirectoryHandle): Promise<{ manifest: CardManifest; sizes: Record<string, number> }> {
  try {
    const directory = await root.getDirectoryHandle("field-shelf")
    const sizes: Record<string, number> = {}
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind !== "file" || !name.endsWith(".bin")) continue
      sizes[name] = (await (handle as FileSystemFileHandle).getFile()).size
    }
    try {
      const manifestHandle = await directory.getFileHandle("manifest.json")
      const text = await (await manifestHandle.getFile()).text()
      return { manifest: parseManifest(text), sizes }
    } catch {
      return { manifest: { version: 1, files: [] }, sizes }
    }
  } catch {
    return { manifest: { version: 1, files: [] }, sizes: {} }
  }
}

async function writeSaved(root: DirectoryHandle, manifest: CardManifest, item: SavedFile): Promise<CardManifest> {
  const response = await fetch(`/api/projects/${item.id}/file`, { cache: "no-store" })
  if (!response.ok) throw new Error(`${item.name} の保管を読めません`)
  const data = new Uint8Array(await response.arrayBuffer())
  const directory = await root.getDirectoryHandle("field-shelf", { create: true })
  const handle = await directory.getFileHandle(filenameFor(item.id), { create: true })
  const writable = await handle.createWritable()
  await writable.write(new Blob([data]))
  await writable.close()
  return upsertEntry(manifest, {
    id: item.id,
    name: item.name,
    version: item.version,
    publishedAt: item.publishedAt,
    filename: filenameFor(item.id),
    bytes: data.byteLength,
    sha256: item.sha256,
    kind: item.kind,
  })
}

async function writeManifest(root: DirectoryHandle, manifest: CardManifest) {
  const directory = await root.getDirectoryHandle("field-shelf", { create: true })
  const handle = await directory.getFileHandle("manifest.json", { create: true })
  const writable = await handle.createWritable()
  await writable.write(serializeManifest(manifest))
  await writable.close()
}

async function fetchSaved(id: string): Promise<SavedFile | null> {
  const response = await fetch("/api/projects/saved", { cache: "no-store" })
  if (!response.ok) return null
  const body = (await response.json()) as { saved?: SavedFile[] }
  return body.saved?.find((item) => item.id === id) ?? null
}

function labelFor(state: Freshness): string {
  if (state === "same") return "一致"
  if (state === "update") return "更新あり"
  if (state === "card-newer") return "カードが新しい"
  return "ファイルなし"
}
