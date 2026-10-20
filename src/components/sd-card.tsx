"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CheckRow, StatusLegend, cardToneLabel, type CardTone } from "@/components/card-tone"
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
import type { LauncherCard } from "@/components/use-launcher-card"
import { RefreshCw, Trash2, Usb } from "lucide-react"

const RANK: Record<CardTone, number> = {
  update: 0,
  missing: 1,
  "card-newer": 2,
  same: 3,
  foreign: 4,
  absent: 5,
}

export function SdCard({ card }: { card: LauncherCard }) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const master = useRef<HTMLInputElement>(null)
  const names = useMemo(() => card.rows.map((row) => row.filename), [card.rows])
  const selected = names.filter((name) => picked.has(name))
  const all = names.length > 0 && selected.length === names.length

  useEffect(() => {
    if (master.current) master.current.indeterminate = selected.length > 0 && !all
  }, [all, selected.length])

  const ordered = [...card.rows].sort((a, b) => {
    const toneA = a.tracked ? a.state : "foreign"
    const toneB = b.tracked ? b.state : "foreign"
    return RANK[toneA] - RANK[toneB] || a.name.localeCompare(b.name, "ja")
  })

  const remove = async () => {
    setConfirm(false)
    const done = await card.removeFiles(selected)
    if (done) setPicked(new Set())
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">カードの downloads</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Launcher のメニューで USB を選んだまま、この PC とつなぐと、挿さったカードの downloads をここに出します。チェックした bin を削除できます。
        </p>
        <StatusLegend />
      </div>
      <DriveBar card={card} />
      {card.error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">{card.error}</p>}
      {card.rows.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{card.active ? "downloads は空です" : "カードがまだ見えていません"}</CardTitle>
            <CardDescription>
              {card.active
                ? "保管タブでチェックした項目を送ると、ここにプロジェクト名の bin が出ます。"
                : "Cardputer で Launcher の USB を選び、ケーブルを挿したまま「接続を確認」を押してください。"}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      {card.rows.length > 0 && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              ref={master}
              type="checkbox"
              className="size-5 accent-current"
              checked={all}
              disabled={card.busy}
              onChange={(event) => setPicked(event.target.checked ? new Set(names) : new Set())}
            />
            {selected.length === 0 ? "すべて選択" : `${selected.length} 件選択`}
          </label>
          <div className="grid gap-2">
            {ordered.map((row) => {
              const tone: CardTone = row.tracked ? row.state : "foreign"
              return (
                <CheckRow
                  key={row.filename}
                  checked={picked.has(row.filename)}
                  disabled={card.busy}
                  tone={tone}
                  title={row.name}
                  detail={
                    row.tracked
                      ? `カード ${row.version || "版不明"}${row.referenceLabel ? ` / 照合 ${row.referenceLabel}` : ""}${row.fileBytes === null ? " / ファイルなし" : ""}`
                      : "この棚の台帳にない bin です。OTA で落としたファイルかもしれません。"
                  }
                  meta={`downloads/${row.filename} ・ ${cardToneLabel(tone)}`}
                  onChange={(checked) => {
                    setPicked((current) => {
                      const next = new Set(current)
                      if (checked) next.add(row.filename)
                      else next.delete(row.filename)
                      return next
                    })
                  }}
                />
              )
            })}
          </div>
        </>
      )}
      <div className="sticky bottom-3 flex flex-wrap gap-2 rounded-xl border bg-background/95 p-2 backdrop-blur">
        <Button className="h-11" variant="destructive" disabled={card.busy || selected.length === 0} onClick={() => setConfirm(true)}>
          {card.busy ? <RefreshCw className="animate-spin" /> : <Trash2 />}
          選択を削除
        </Button>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected.length} 件を downloads から削除</DialogTitle>
            <DialogDescription>
              Launcher の USB はつなぎたままにしてください。削除した bin は Install の一覧から消えます。
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-40 overflow-auto text-sm leading-6 text-muted-foreground">
            {selected.slice(0, 8).map((name) => (
              <li key={name}>{name}</li>
            ))}
            {selected.length > 8 && <li>ほか {selected.length - 8} 件</li>}
          </ul>
          <DialogFooter>
            <Button className="h-11" variant="outline" onClick={() => setConfirm(false)}>
              中止
            </Button>
            <Button className="h-11" variant="destructive" onClick={() => void remove()}>
              <Trash2 />
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

export function DriveBar({ card }: { card: LauncherCard }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button className="h-11" variant="outline" disabled={card.busy} onClick={() => void card.reload()}>
          <Usb />
          接続を確認
        </Button>
        {card.drives.length > 1 &&
          card.drives.map((item) => (
            <Button
              key={item.device}
              className="h-11"
              variant={item.device === card.device ? "default" : "outline"}
              onClick={() => card.setDevice(item.device)}
            >
              {item.label}
            </Button>
          ))}
      </div>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {card.message}
        {card.active ? `（${card.active.label}）` : ""}
      </p>
    </div>
  )
}
