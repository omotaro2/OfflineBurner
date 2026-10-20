"use client"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ProjectDesk } from "@/components/project-desk"
import { cn } from "cn"
import type { CachedFirmware, CachedPart } from "@/lib/cache"
import type { ConnectMode } from "@/lib/shelf"
import { Download, RefreshCw, Star, TriangleAlert, Usb } from "lucide-react"

type RemoteRelease = {
  version: string
  publishedAt: string
  releaseUrl: string
  stars: number
  downloads: number
  downloadsNote: string
}

type FirmwareCard = {
  id: string
  deviceId: string
  name: string
  summary: string
  cautions: string[]
  chip: "ESP32-S3"
  connect: ConnectMode
  writesDevice: boolean
  cached: CachedFirmware | null
  remote: RemoteRelease | null
  remoteError: string | null
  updateAvailable: boolean
}

type DeviceCard = {
  id: string
  name: string
  portHint: string
  prep: string[]
  firmwares: FirmwareCard[]
}

type Catalog = {
  online: boolean
  checkedAt: string
  recovery: FirmwareCard | null
  devices: DeviceCard[]
}

type FlashPhase = "confirm" | "working" | "done" | "error"

export function Shelf() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState("cardputer-adv")
  const [work, setWork] = useState<WorkTab>("shelf")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [cardError, setCardError] = useState<Record<string, string>>({})
  const [target, setTarget] = useState<FirmwareCard | null>(null)
  const [downloadMode, setDownloadMode] = useState(true)
  const [phase, setPhase] = useState<FlashPhase>("confirm")
  const [log, setLog] = useState<string[]>([])
  const [progress, setProgress] = useState(0)
  const [flashError, setFlashError] = useState<string | null>(null)
  const [serialChecked, setSerialChecked] = useState(false)
  const [serialAvailable, setSerialAvailable] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const response = await fetch("/api/catalog", { cache: "no-store" })
      if (!response.ok) throw new Error("棚の情報を読めません")
      const body = (await response.json()) as Catalog
      setCatalog(body)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "棚の情報を読めません")
    }
  }, [])

  useEffect(() => {
    setSerialAvailable("serial" in navigator)
    setSerialChecked(true)
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const device = catalog?.devices.find((item) => item.id === deviceId) ?? catalog?.devices[0]

  const saveOne = useCallback(
    async (id: string) => {
      setBusyId(id)
      setCardError((current) => ({ ...current, [id]: "" }))
      try {
        const response = await fetch(`/api/firmware/${id}`, { method: "POST" })
        const body = (await response.json()) as { error?: string }
        if (!response.ok) throw new Error(body.error ?? "保管に失敗しました")
        await load()
      } catch (error) {
        setCardError((current) => ({
          ...current,
          [id]: error instanceof Error ? error.message : "保管に失敗しました",
        }))
      } finally {
        setBusyId(null)
      }
    },
    [load],
  )

  const saveAll = useCallback(async () => {
    if (!catalog) return
    const ids = catalog.devices.flatMap((item) => item.firmwares.map((firmware) => firmware.id))
    for (const id of ids) {
      await saveOne(id)
    }
  }, [catalog, saveOne])

  const openFlash = (firmware: FirmwareCard) => {
    setTarget(firmware)
    setDownloadMode(firmware.connect === "no_reset")
    setPhase("confirm")
    setLog([])
    setProgress(0)
    setFlashError(null)
  }

  const appendLog = useCallback((line: string) => {
    const text = line.trim()
    if (!text) return
    setLog((current) => [...current.slice(-180), text])
  }, [])

  const startFlash = async () => {
    if (!target?.cached) return
    if (!("serial" in navigator)) {
      setPhase("error")
      setFlashError("このブラウザはシリアルポートを開けません。Chromium で開いてください。")
      return
    }
    setPhase("working")
    setFlashError(null)
    setProgress(0)
    setLog(["ポートを選択してください。"])
    let disconnect = async () => {}
    try {
      const serial = navigator.serial
      const port = await serial.requestPort()
      appendLog("ブートローダへ接続しています。")
      const { ESPLoader, Transport } = await import("esptool-js")
      const transport = new Transport(port)
      disconnect = () => transport.disconnect()
      const loader = new ESPLoader({
        transport,
        baudrate: 115200,
        romBaudrate: 115200,
        terminal: {
          clean() {},
          writeLine: appendLog,
          write: appendLog,
        },
      })
      const chip = await loader.main(downloadMode ? "no_reset" : "default_reset")
      appendLog(`チップ: ${chip}`)
      if (!chip.toLowerCase().includes("esp32-s3")) {
        throw new Error(`${chip} です。ESP32-S3 のポートを選び直してください。`)
      }
      const cached = target.cached
      const fileArray = []
      for (const part of cached.parts) {
        appendLog(`${part.label} を読み込んでいます。`)
        const response = await fetch(`/api/firmware/${target.id}/file/${part.file}`, {
          cache: "no-store",
        })
        if (!response.ok) throw new Error("保管したファイルを読めません")
        fileArray.push({
          data: new Uint8Array(await response.arrayBuffer()),
          address: part.offset,
        })
      }
      appendLog("フラッシュを消去して書き込みます。ケーブルを抜かないでください。")
      await loader.writeFlash({
        fileArray,
        flashMode: cached.flashMode,
        flashFreq: cached.flashFreq,
        flashSize: cached.flashSize,
        eraseAll: true,
        compress: true,
        reportProgress: (fileIndex, written, total) => {
          const fileWeight = 1 / fileArray.length
          const ratio = total === 0 ? 0 : written / total
          setProgress(Math.round((fileIndex * fileWeight + ratio * fileWeight) * 100))
        },
      })
      await loader.after("hard_reset")
      setProgress(100)
      appendLog("書き込みが終わり、基板をリセットしました。")
      setPhase("done")
      disconnect = () => transport.disconnect()
    } catch (error) {
      setFlashError(explainFlashError(error))
      setPhase("error")
    } finally {
      await disconnect().catch(() => undefined)
    }
  }

  const savingAny = busyId !== null
  const cachedCount = useMemo(
    () => catalog?.devices.reduce((sum, item) => sum + item.firmwares.filter((firmware) => firmware.cached).length, 0) ?? 0,
    [catalog],
  )

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Field shelf</p>
          <h1 className="text-2xl font-semibold tracking-tight">フィールドシェルフ</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            家のネットで安定版を保管し、出先ではそのファイルだけを基板へ書きます。Cardputer は安定版、プロジェクト、保管、カードのタブに分かれています。シリアルで書くときは、ブラウザのタブはこのページだけにしてください。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={catalog?.online ? "default" : "outline"}>
            {catalog ? (catalog.online ? "オンライン" : "オフライン") : "確認中"}
          </Badge>
          <Badge variant="secondary">保管 {cachedCount}</Badge>
          <Button className="h-11" disabled={!catalog?.online || savingAny} onClick={() => void saveAll()}>
            <Download />
            安定版をまとめて保管
          </Button>
        </div>
      </header>

      {serialChecked && !serialAvailable && (
        <Notice tone="warn">
          このブラウザはシリアルポートを開けません。書き込みは Chromium（Chrome か Edge）で行ってください。保管自体はこの画面のままできます。
        </Notice>
      )}
      {loadError && <Notice tone="warn">{loadError}</Notice>}

      {!catalog && !loadError && (
        <Card>
          <CardHeader>
            <CardTitle>安定版を確認しています</CardTitle>
            <CardDescription>
              公開中の版と、この PC に保管済みのファイルを照合しています。
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {device && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 overflow-x-auto">
            {catalog?.devices.map((item) => (
              <Button
                key={item.id}
                className="h-11"
                variant={item.id === device.id ? "default" : "outline"}
                onClick={() => setDeviceId(item.id)}
              >
                {item.name}
              </Button>
            ))}
          </div>
          {cardputerDevice(device.id) && (
            <div role="tablist" aria-label="機能" className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
              {WORK_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={work === tab.id}
                  className={cn(
                    "h-11 shrink-0 rounded-lg px-4 text-sm font-medium",
                    work === tab.id ? "bg-background text-foreground" : "text-muted-foreground",
                  )}
                  onClick={() => setWork(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          {(!cardputerDevice(device.id) || work === "shelf") && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{device.name}</CardTitle>
                  <CardDescription>{device.portHint}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-muted-foreground">
                    {device.prep.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <div className="grid gap-4">
                {device.firmwares.map((firmware) => (
                  <FirmwareRow
                    key={firmware.id}
                    firmware={firmware}
                    busy={busyId === firmware.id}
                    error={cardError[firmware.id] ?? ""}
                    online={catalog?.online ?? false}
                    onSave={() => void saveOne(firmware.id)}
                    onFlash={() => openFlash(firmware)}
                  />
                ))}
              </div>
              {cardputerDevice(device.id) && catalog?.recovery && (
                <FirmwareRow
                  firmware={catalog.recovery}
                  busy={busyId === catalog.recovery.id}
                  error={cardError[catalog.recovery.id] ?? ""}
                  online={catalog.online}
                  onSave={() => {
                    if (catalog.recovery) void saveOne(catalog.recovery.id)
                  }}
                  onFlash={() => {
                    if (catalog.recovery) openFlash(catalog.recovery)
                  }}
                />
              )}
            </>
          )}
          {cardputerDevice(device.id) && work !== "shelf" && (
            <ProjectDesk online={catalog?.online ?? false} panel={work} />
          )}
        </div>
      )}

      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && phase !== "working") setTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={phase !== "working"}>
          <DialogHeader>
            <DialogTitle>{target ? `${target.name} を書き込む` : "書き込み"}</DialogTitle>
            <DialogDescription>
              {target?.cached
                ? `保管済み ${target.cached.version} を全消去して書きます。`
                : "先に安定版を保管してください。"}
            </DialogDescription>
          </DialogHeader>
          {target && phase === "confirm" && (
            <div className="flex flex-col gap-3 text-sm leading-6">
              {target.cautions.map((caution) => (
                <p key={caution} className="flex gap-2 text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{caution}</span>
                </p>
              ))}
              <label className="flex items-start gap-2">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={downloadMode}
                  onChange={(event) => setDownloadMode(event.target.checked)}
                />
                <span>すでにダウンロードモードに入れてある。リセット信号は送らない。</span>
              </label>
            </div>
          )}
          {phase !== "confirm" && (
            <div className="flex flex-col gap-3">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
              <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-5 whitespace-pre-wrap">
                {log.join("\n")}
              </pre>
              {flashError && <Notice tone="warn">{flashError}</Notice>}
            </div>
          )}
          <DialogFooter>
            {phase === "confirm" && (
              <>
                <Button variant="outline" className="h-11" onClick={() => setTarget(null)}>
                  中止
                </Button>
                <Button className="h-11" onClick={() => void startFlash()}>
                  <Usb />
                  消去して書き込む
                </Button>
              </>
            )}
            {phase === "working" && (
              <Button className="h-11" disabled>
                書き込み中 {progress}%
              </Button>
            )}
            {(phase === "done" || phase === "error") && (
              <Button className="h-11" onClick={() => setTarget(null)}>
                閉じる
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

const WORK_TABS = [
  { id: "shelf", label: "安定版" },
  { id: "projects", label: "プロジェクト" },
  { id: "saved", label: "保管" },
  { id: "card", label: "カード" },
] as const

type WorkTab = (typeof WORK_TABS)[number]["id"]

function cardputerDevice(id: string): boolean {
  return id === "cardputer" || id === "cardputer-adv"
}

function FirmwareRow({
  firmware,
  busy,
  error,
  online,
  onSave,
  onFlash,
}: {
  firmware: FirmwareCard
  busy: boolean
  error: string
  online: boolean
  onSave: () => void
  onFlash: () => void
}) {
  const cached = firmware.cached
  const total = cached?.parts.reduce((sum, part) => sum + part.bytes, 0) ?? 0
  const stars = firmware.remote?.stars ?? cached?.stars
  const downloads = firmware.remote?.downloads ?? cached?.downloads
  const downloadsNote = firmware.remote?.downloadsNote ?? cached?.downloadsNote
  let action = "安定版を保管"
  if (cached && firmware.updateAvailable) action = "安定版に更新"
  if (cached && !firmware.updateAvailable) action = "もう一度保管"
  return (
    <Card>
      <div className="grid gap-4 px-(--card-spacing) sm:grid-cols-[11rem_1fr] sm:items-start">
        <Cover id={firmware.id} name={firmware.name} />
        <div className="flex min-w-0 flex-col gap-3">
          <CardHeader className="px-0">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {firmware.name}
              {cached ? <Badge>保管済み</Badge> : <Badge variant="outline">未保管</Badge>}
              {firmware.updateAvailable && <Badge variant="secondary">新しい安定版</Badge>}
            </CardTitle>
            <CardDescription>{firmware.summary}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-0 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5 text-primary" />
                スター {stars === undefined ? "未取得" : formatCount(stars)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Download className="size-3.5 text-primary" />
                ダウンロード {downloads === undefined ? "未取得" : formatCount(downloads)}
              </span>
            </div>
            {downloadsNote && <p className="text-xs leading-5 text-muted-foreground">{downloadsNote}</p>}
            <p>
              保管: {cached ? `${cached.version}（${formatBytes(total)}、${formatDate(cached.savedAt)}）` : "まだありません"}
            </p>
            <p className="text-muted-foreground">
              公開中の安定版: {firmware.remote ? `${firmware.remote.version}（${formatDate(firmware.remote.publishedAt)}）` : firmware.remoteError ?? "未確認"}
            </p>
            {cached && <PartList parts={cached.parts} />}
            {error && <Notice tone="warn">{error}</Notice>}
          </CardContent>
        </div>
      </div>
      <CardFooter className="flex flex-wrap gap-2">
        <Button className="h-11" variant="outline" disabled={!online || busy} onClick={onSave}>
          {busy ? <RefreshCw className="animate-spin" /> : <Download />}
          {busy ? "保管しています" : action}
        </Button>
        {firmware.writesDevice && (
          <Button className="h-11" disabled={!cached || busy} onClick={onFlash}>
            <Usb />
            {firmware.id === "m5launcher-cardputer" ? "復旧用に書き込む" : "オフラインで書き込む"}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

function Cover({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
        画像なし
      </div>
    )
  }
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
      <Image
        src={`/api/firmware/${id}/cover`}
        alt={`${name} のサムネイル`}
        fill
        sizes="(min-width: 640px) 11rem, 100vw"
        unoptimized
        className="object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  )
}

function PartList({ parts }: { parts: CachedPart[] }) {
  return (
    <ul className="font-mono text-xs leading-5 text-muted-foreground">
      {parts.map((part) => (
        <li key={part.file}>
          0x{part.offset.toString(16)} {part.label} {formatBytes(part.bytes)} {part.sha256.slice(0, 12)}
        </li>
      ))}
    </ul>
  )
}

function Notice({ children, tone }: { children: string; tone: "warn" }) {
  return (
    <p
      className={
        tone === "warn"
          ? "rounded-lg bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive"
          : ""
      }
    >
      {children}
    </p>
  )
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(value)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso))
}

function explainFlashError(error: unknown): string {
  const message = error instanceof Error ? error.message : "書き込みに失敗しました"
  if (message.includes("Failed to open serial port") || message.includes("NetworkError")) {
    return "ポートを開けません。このページ以外のタブとシリアルモニタを閉じ、基板を挿し直してからもう一度選んでください。"
  }
  if (/failed to connect|timed out|packet header/i.test(message)) {
    return "ブートローダが応答しません。Cardputer は G0 を押したまま挿し、Heltec は PRG を押したまま RST を押してから、ダウンロードモードにチェックを入れて書き直してください。"
  }
  return message
}
