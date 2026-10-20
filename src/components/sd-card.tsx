"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { freshness, type CardEntry, type Freshness } from "@/lib/sd-manifest"
import type { SavedBrief } from "@/components/project-browser"
import { RefreshCw, Usb } from "lucide-react"

type SavedFile = SavedBrief & {
  name: string
  bytes: number
  sha256: string
}

type Drive = {
  device: string
  mount: string | null
  label: string
  fstype: string
  readOnly: boolean
  writable: boolean
}

type ShelfResponse = {
  drives?: Drive[]
  device?: string | null
  files?: CardEntry[]
  sizes?: Record<string, number>
  message?: string
  error?: string
}

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
  const [drives, setDrives] = useState<Drive[]>([])
  const [device, setDevice] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [message, setMessage] = useState("Launcher の USB を探しています。")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const apply = useCallback(
    (body: ShelfResponse) => {
      const nextDrives = body.drives
      if (nextDrives) setDrives(nextDrives)
      setDevice((current) => {
        if (!nextDrives) return body.device ?? current
        if (current && nextDrives.some((item) => item.device === current)) return current
        return body.device && nextDrives.some((item) => item.device === body.device) ? body.device : nextDrives[0]?.device ?? null
      })
      if (body.files) {
        const sizes = body.sizes ?? {}
        setRows(body.files.map((entry) => decorate(entry, sizes[entry.filename] ?? null, saved, remote)))
      }
      if (body.message) setMessage(body.message)
    },
    [remote, saved],
  )

  const reload = useCallback(async () => {
    const query = device ? `?device=${encodeURIComponent(device)}` : ""
    const response = await fetch(`/api/sd${query}`, { cache: "no-store" })
    const body = (await response.json().catch(() => null)) as ShelfResponse | null
    if (!body) return
    apply(body)
  }, [apply, device])

  useEffect(() => {
    let cancel = false
    const load = () => {
      if (cancel || busyRef.current) return
      void reload().catch(() => undefined)
    }
    load()
    const timer = window.setInterval(load, 4000)
    return () => {
      cancel = true
      window.clearInterval(timer)
    }
  }, [reload])

  const post = async (ids: string[]) => {
    const response = await fetch("/api/sd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device, ids }),
    })
    const body = (await response.json().catch(() => null)) as ShelfResponse | null
    if (!response.ok) throw new Error(body?.error ?? "カードへ書けません")
    if (body) apply(body)
  }

  const copySaved = async () => {
    if (!device) {
      setError("Launcher の USB がまだ見えていません。メニューの USB を選んだまま、この PC とつないでください。")
      return
    }
    busyRef.current = true
    setBusy(true)
    setError("")
    try {
      await post(saved.map((item) => item.id))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "カードへ書けません")
    } finally {
      busyRef.current = false
      setBusy(false)
      void reload().catch(() => undefined)
    }
  }

  const updateOld = async () => {
    if (!device) {
      setError("Launcher の USB がまだ見えていません。メニューの USB を選んだまま、この PC とつないでください。")
      return
    }
    busyRef.current = true
    setBusy(true)
    setError("")
    try {
      const ids: string[] = []
      for (const row of rows) {
        if (row.state !== "update" && row.state !== "missing") continue
        const remoteItem = remote.find((item) => item.id === row.id)
        const savedItem = saved.find((item) => item.id === row.id)
        if (!remoteItem && !savedItem) continue
        if (online && remoteItem && (!savedItem || remoteItem.publishedAt > savedItem.publishedAt)) {
          await onEnsure(row.id)
        }
        ids.push(row.id)
      }
      if (ids.length === 0) {
        setMessage("更新が必要な bin はありません。")
        return
      }
      await post(ids)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "カードへ書けません")
    } finally {
      busyRef.current = false
      setBusy(false)
      void reload().catch(() => undefined)
    }
  }

  const active = drives.find((item) => item.device === device) ?? null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Launcher の USB で downloads へ送る</h2>
        <ol className="flex max-w-3xl list-decimal flex-col gap-1 pl-5 text-sm leading-6 text-muted-foreground">
          <li>無印または Adv で Launcher を開き、メニューの USB を選ぶ。画面に USB の印が出ているあいだ、挿さったカードがこの PC のドライブになる。</li>
          <li>このページが Launcher SD を見つけたら、「downloads へ送る」を押す。bin はカードの downloads に、プロジェクト名で保存される。</li>
          <li>Launcher で USB を終了し、SD から downloads を開く。その名前の bin を選んで Install する。</li>
        </ol>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="h-11" variant="outline" disabled={busy} onClick={() => void reload()}>
          <Usb />
          接続を確認
        </Button>
        <Button className="h-11" disabled={!device || busy || saved.length === 0} onClick={() => void copySaved()}>
          {busy ? <RefreshCw className="animate-spin" /> : <Usb />}
          downloads へ送る
        </Button>
        <Button className="h-11" variant="outline" disabled={!device || busy} onClick={() => void updateOld()}>
          古い bin を更新
        </Button>
      </div>
      {drives.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {drives.map((item) => (
            <Button
              key={item.device}
              className="h-11"
              variant={item.device === device ? "default" : "outline"}
              onClick={() => setDevice(item.device)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {message}
        {active?.mount ? `（${active.label}）` : ""}
      </p>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">{error}</p>}
      {active && rows.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>downloads にはまだ台帳がありません</CardTitle>
            <CardDescription>送ると、downloads にプロジェクト名の bin と、この棚の manifest.json ができます。</CardDescription>
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
              <CardContent className="text-xs text-muted-foreground">downloads/{row.filename}</CardContent>
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

function labelFor(state: Freshness): string {
  if (state === "same") return "一致"
  if (state === "update") return "更新あり"
  if (state === "card-newer") return "カードが新しい"
  return "ファイルなし"
}
