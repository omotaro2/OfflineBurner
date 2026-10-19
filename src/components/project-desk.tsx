"use client"

import { useCallback, useEffect, useState } from "react"
import { ProjectBrowser, type SavedBrief } from "@/components/project-browser"
import { SdCard } from "@/components/sd-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TriangleAlert, Usb } from "lucide-react"

type SavedProject = SavedBrief & {
  name: string
  author: string
  bytes: number
  sha256: string
  savedAt: string
}

type RemoteBrief = { id: string; version: string; publishedAt: string }

type FlashPhase = "confirm" | "working" | "done" | "error"

export function ProjectDesk({ online }: { online: boolean }) {
  const [saved, setSaved] = useState<SavedProject[]>([])
  const [remote, setRemote] = useState<RemoteBrief[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [target, setTarget] = useState<SavedProject | null>(null)
  const [downloadMode, setDownloadMode] = useState(true)
  const [phase, setPhase] = useState<FlashPhase>("confirm")
  const [log, setLog] = useState<string[]>([])
  const [progress, setProgress] = useState(0)
  const [flashError, setFlashError] = useState<string | null>(null)

  const loadSaved = useCallback(async () => {
    const response = await fetch("/api/projects/saved", { cache: "no-store" })
    if (!response.ok) return
    const body = (await response.json()) as { saved?: SavedProject[] }
    setSaved(body.saved ?? [])
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSaved()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadSaved])

  useEffect(() => {
    if (!online) return
    let cancel = false
    void fetch("/api/projects", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return []
        const body = (await response.json()) as { projects?: RemoteBrief[] }
        return body.projects ?? []
      })
      .then((rows) => {
        if (!cancel) setRemote(rows)
      })
      .catch(() => undefined)
    return () => {
      cancel = true
    }
  }, [online])

  const save = useCallback(
    async (id: string) => {
      setBusyId(id)
      setErrors((current) => ({ ...current, [id]: "" }))
      try {
        const response = await fetch(`/api/projects/${id}`, { method: "POST" })
        const body = (await response.json()) as { error?: string }
        if (!response.ok) throw new Error(body.error ?? "保管に失敗しました")
        await loadSaved()
      } catch (error) {
        setErrors((current) => ({
          ...current,
          [id]: error instanceof Error ? error.message : "保管に失敗しました",
        }))
        throw error
      } finally {
        setBusyId(null)
      }
    },
    [loadSaved],
  )

  const openFlash = (id: string) => {
    const item = saved.find((project) => project.id === id)
    if (!item || item.kind !== "merged") return
    setTarget(item)
    setDownloadMode(true)
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
    if (!target) return
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
      const port = await navigator.serial.requestPort()
      appendLog("ブートローダへ接続しています。")
      const { ESPLoader, Transport } = await import("esptool-js")
      const transport = new Transport(port)
      disconnect = () => transport.disconnect()
      const loader = new ESPLoader({
        transport,
        baudrate: 115200,
        romBaudrate: 115200,
        terminal: { clean() {}, writeLine: appendLog, write: appendLog },
      })
      const chip = await loader.main(downloadMode ? "no_reset" : "default_reset")
      appendLog(`チップ: ${chip}`)
      if (!chip.toLowerCase().includes("esp32-s3")) {
        throw new Error(`${chip} です。ESP32-S3 のポートを選び直してください。`)
      }
      appendLog("保管したイメージを読み込んでいます。")
      const response = await fetch(`/api/projects/${target.id}/file`, { cache: "no-store" })
      if (!response.ok) throw new Error("保管したファイルを読めません")
      const data = new Uint8Array(await response.arrayBuffer())
      appendLog("フラッシュを全消去して書き込みます。ケーブルを抜かないでください。")
      await loader.writeFlash({
        fileArray: [{ data, address: 0 }],
        flashMode: "dio",
        flashFreq: "80m",
        flashSize: "8MB",
        eraseAll: true,
        compress: true,
        reportProgress: (_fileIndex, written, total) => {
          setProgress(total === 0 ? 0 : Math.round((written / total) * 100))
        },
      })
      await loader.after("hard_reset")
      setProgress(100)
      appendLog("書き込みが終わり、基板をリセットしました。")
      setPhase("done")
    } catch (error) {
      setFlashError(explainFlashError(error))
      setPhase("error")
    } finally {
      await disconnect().catch(() => undefined)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">保管したプロジェクト</h2>
        {saved.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>まだありません</CardTitle>
              <CardDescription>下の一覧でプロジェクトを開き、オフライン用に保管します。ネットが切れても、ここから書けます。</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-3">
            {saved.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {item.name}
                    <Badge>{item.kind === "merged" ? "全体イメージ" : "アプリ単体"}</Badge>
                  </CardTitle>
                  <CardDescription>
                    {item.version || "版不明"}（{formatBytes(item.bytes)}、{item.savedAt.slice(0, 16).replace("T", " ")}）
                  </CardDescription>
                </CardHeader>
                {item.kind === "merged" && (
                  <div className="px-(--card-spacing) pb-(--card-spacing)">
                    <Button className="h-11" onClick={() => openFlash(item.id)}>
                      <Usb />
                      オフラインで書き込む
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <SdCard
        online={online}
        saved={saved}
        remote={remote}
        onEnsure={async (id) => {
          await save(id)
        }}
      />

      <ProjectBrowser
        online={online}
        saved={saved}
        busyId={busyId}
        errors={errors}
        onSave={(id) => void save(id).catch(() => undefined)}
        onFlash={openFlash}
      />

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
              {target ? `保管済み ${target.version} を先頭から全消去して書きます。` : ""}
            </DialogDescription>
          </DialogHeader>
          {phase === "confirm" && (
            <div className="flex flex-col gap-3 text-sm leading-6">
              <p className="flex gap-2 text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>標準 Launcher も消えます。残すなら中止して、SD へコピーしてから Launcher の Install を使ってください。</span>
              </p>
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
              {flashError && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">{flashError}</p>
              )}
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
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function explainFlashError(error: unknown): string {
  const message = error instanceof Error ? error.message : "書き込みに失敗しました"
  if (message.includes("Failed to open serial port") || message.includes("NetworkError")) {
    return "ポートを開けません。このページ以外のタブとシリアルモニタを閉じ、基板を挿し直してからもう一度選んでください。"
  }
  if (/failed to connect|timed out|packet header/i.test(message)) {
    return "ブートローダが応答しません。G0 を押したまま挿し、ダウンロードモードにチェックを入れて書き直してください。"
  }
  return message
}
