"use client"

import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { uniqueSdFilename } from "@/lib/launcher-payload"
import {
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

  useEffect(() => {
    let cancel = false
    void loadRememberedHandle().then(async (directory) => {
      if (cancel || !directory) return
      const permission = await directory.queryPermission({ mode: "readwrite" }).catch(() => "prompt" as const)
      if (permission !== "granted") return
      try {
        await reload(directory)
        if (!cancel) {
          setRoot(directory)
          setMessage("前回開いた無印または Adv の SD を見ています。")
        }
      } catch {
        if (!cancel) setMessage("前回のカードは今つながっていません。Launcher の USB を入れてから開き直してください。")
      }
    })
    return () => {
      cancel = true
    }
  }, [reload])

  const choose = async () => {
    setError("")
    try {
      const directory = await window.showDirectoryPicker({ id: "cardputer-sd", mode: "readwrite" })
      await rememberHandle(directory)
      setRoot(directory)
      await reload(directory)
      setMessage("挿さった SD を開きました。無印でも Adv でも、同じ field-shelf フォルダへ送ります。")
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return
      setError(driveError(reason))
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
      setError(driveError(reason))
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
      setError(driveError(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">無印と Adv の SD へ送る</h2>
        <ol className="flex max-w-3xl list-decimal flex-col gap-1 pl-5 text-sm leading-6 text-muted-foreground">
          <li>無印または Adv に microSD を挿し、USB ケーブルでこの PC とつなぐ。</li>
          <li>Launcher を開き、メニューの USB を選ぶ。挿さったカードが PC のドライブになる。</li>
          <li>「無印 / Adv の SD を開く」で、そのドライブを選ぶ。</li>
          <li>保管した bin を送る。ファイル名はプロジェクト名です。USB を終了し、Launcher の SD でその名前を選んで Install します。</li>
        </ol>
      </div>
      {!picker && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">
          このブラウザはフォルダを選べません。Chromium で http://127.0.0.1:43127 を開いてください。
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button className="h-11" variant="outline" disabled={!picker || busy} onClick={() => void choose()}>
          <Usb />
          無印 / Adv の SD を開く
        </Button>
        <Button className="h-11" disabled={!root || busy || saved.length === 0} onClick={() => void copySaved()}>
          {busy ? <RefreshCw className="animate-spin" /> : <Usb />}
          挿したカードへ送る
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
            <CardDescription>挿したカードへ送ると、field-shelf フォルダに bin と manifest.json ができます。</CardDescription>
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
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `${item.name} の保管を読めません`)
  }
  const data = new Uint8Array(await response.arrayBuffer())
  const previous = manifest.files.find((entry) => entry.id === item.id)
  const filename = uniqueSdFilename(
    item.name,
    item.version,
    item.id,
    manifest.files.filter((entry) => entry.id !== item.id).map((entry) => entry.filename),
  )
  const directory = await root.getDirectoryHandle("field-shelf", { create: true })
  if (previous && previous.filename !== filename) {
    await directory.removeEntry(previous.filename).catch(() => undefined)
  }
  const handle = await directory.getFileHandle(filename, { create: true })
  const writable = await handle.createWritable()
  await writable.write(new Blob([data]))
  await writable.close()
  return upsertEntry(manifest, {
    id: item.id,
    name: item.name,
    version: item.version,
    publishedAt: item.publishedAt,
    filename,
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

function driveError(reason: unknown): string {
  if (reason instanceof DOMException && (reason.name === "NotFoundError" || reason.name === "InvalidStateError")) {
    return "カードが見えません。無印または Adv で Launcher の USB を入れたまま、もう一度開いてください。"
  }
  return reason instanceof Error ? reason.message : "カードへ書けません"
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("field-shelf", 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("handles")) {
        request.result.createObjectStore("handles")
      }
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function rememberHandle(directory: FileSystemDirectoryHandle): Promise<void> {
  return openHandleDb().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction("handles", "readwrite")
        transaction.objectStore("handles").put(directory, "cardputer-sd")
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      }),
  )
}

function loadRememberedHandle(): Promise<FileSystemDirectoryHandle | null> {
  return openHandleDb()
    .then(
      (database) =>
        new Promise<FileSystemDirectoryHandle | null>((resolve) => {
          const request = database.transaction("handles", "readonly").objectStore("handles").get("cardputer-sd")
          request.onsuccess = () => {
            resolve(request.result instanceof FileSystemDirectoryHandle ? request.result : null)
          }
          request.onerror = () => resolve(null)
        }),
    )
    .catch(() => null)
}

function labelFor(state: Freshness): string {
  if (state === "same") return "一致"
  if (state === "update") return "更新あり"
  if (state === "card-newer") return "カードが新しい"
  return "ファイルなし"
}
