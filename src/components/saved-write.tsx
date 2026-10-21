"use client"

import Image from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"
import { StatusLegend, cardToneClass, cardToneLabel, type CardTone } from "@/components/card-tone"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DriveBar } from "@/components/sd-card"
import type { LauncherCard, SavedFile } from "@/components/use-launcher-card"
import type { Freshness } from "@/lib/sd-manifest"
import { cn } from "cn"
import { RefreshCw, Usb } from "lucide-react"

const RANK: Record<CardTone, number> = {
  update: 0,
  missing: 1,
  absent: 2,
  "card-newer": 3,
  same: 4,
  foreign: 5,
}

export function SavedWrite({
  card,
  saved,
  hiddenPlain,
}: {
  card: LauncherCard
  saved: SavedFile[]
  hiddenPlain: number
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const master = useRef<HTMLInputElement>(null)
  const ids = useMemo(() => saved.map((item) => item.id), [saved])
  const selected = ids.filter((id) => picked.has(id))
  const all = ids.length > 0 && selected.length === ids.length

  useEffect(() => {
    if (master.current) master.current.indeterminate = selected.length > 0 && !all
  }, [all, selected.length])

  const ordered = [...saved].sort((a, b) => {
    const toneA = toneFor(card.stateById[a.id])
    const toneB = toneFor(card.stateById[b.id])
    return RANK[toneA] - RANK[toneB] || a.name.localeCompare(b.name, "ja")
  })

  const pickUpdates = () => {
    setPicked(
      new Set(
        saved
          .filter((item) => {
            const tone = toneFor(card.stateById[item.id])
            return tone === "update" || tone === "missing"
          })
          .map((item) => item.id),
      ),
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">保管からカードへ</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          チェックした保管だけを、Launcher の USB でつながったカードの downloads へ送ります。緑はすでに同じ版があり、オレンジは送り直すと新しい版になります。サムネイルと説明は、プロジェクト一覧と同じものを出します。
        </p>
        {hiddenPlain > 0 && (
          <p className="text-sm leading-6 text-muted-foreground">
            無印向けとして保管されていた {hiddenPlain} 件は、Adv の一覧から外しています。
          </p>
        )}
        <StatusLegend />
      </div>
      <DriveBar card={card} />
      {card.error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">{card.error}</p>}
      {saved.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>保管はまだありません</CardTitle>
            <CardDescription>プロジェクトタブで「オフライン用に保管」を押すと、ここに並びます。</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                ref={master}
                type="checkbox"
                className="size-5 accent-current"
                checked={all}
                disabled={card.busy}
                onChange={(event) => setPicked(event.target.checked ? new Set(ids) : new Set())}
              />
              {selected.length === 0 ? "すべて選択" : `${selected.length} 件選択`}
            </label>
            <Button className="h-11" variant="outline" disabled={card.busy} onClick={pickUpdates}>
              新しい版と欠けているものを選ぶ
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {ordered.map((item) => {
              const tone = toneFor(card.stateById[item.id])
              return (
                <SavedCard
                  key={item.id}
                  item={item}
                  tone={tone}
                  checked={picked.has(item.id)}
                  disabled={card.busy}
                  onChange={(checked) => {
                    setPicked((current) => {
                      const next = new Set(current)
                      if (checked) next.add(item.id)
                      else next.delete(item.id)
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
        <Button
          className="h-11"
          disabled={!card.device || card.busy || selected.length === 0}
          onClick={() =>
            void card.writeIds(selected).then((done) => {
              if (done) setPicked(new Set())
            })
          }
        >
          {card.busy ? <RefreshCw className="animate-spin" /> : <Usb />}
          {selected.length === 0 ? "チェックしたものを送る" : `${selected.length} 件を downloads へ送る`}
        </Button>
      </div>
    </section>
  )
}

function SavedCard({
  item,
  tone,
  checked,
  disabled,
  onChange,
}: {
  item: SavedFile
  tone: CardTone
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  const [failed, setFailed] = useState(false)
  return (
    <label className={cn("overflow-hidden rounded-xl border border-l-4", cardToneClass(tone), disabled && "opacity-60")}>
      <span className="relative block aspect-[16/9] bg-muted">
        {failed ? (
          <span className="flex size-full items-center justify-center text-xs text-muted-foreground">画像なし</span>
        ) : (
          <Image
            src={`/api/projects/${item.id}/cover`}
            alt={`${item.name} のサムネイル`}
            fill
            sizes="(min-width: 640px) 50vw, 100vw"
            unoptimized
            className="object-contain"
            onError={() => setFailed(true)}
          />
        )}
        <input
          type="checkbox"
          className="absolute top-3 left-3 size-5 accent-current"
          checked={checked}
          disabled={disabled}
          aria-label={item.name}
          onChange={(event) => onChange(event.target.checked)}
        />
      </span>
      <span className="flex flex-col gap-2 p-4">
        <span className="flex flex-wrap items-center gap-2 text-base font-medium">
          {item.name}
          <Badge variant="outline">{cardToneLabel(tone)}</Badge>
        </span>
        {item.author && <span className="text-sm text-muted-foreground">{item.author}</span>}
        {item.description && (
          <span className="line-clamp-4 text-sm leading-6 text-muted-foreground">{item.description}</span>
        )}
        <span className="text-xs text-muted-foreground">
          {item.version || "版不明"}（{formatBytes(item.bytes)}
          {item.savedAt ? `、${item.savedAt.slice(0, 16).replace("T", " ")}` : ""}）
        </span>
      </span>
    </label>
  )
}

function toneFor(state: Freshness | undefined): CardTone {
  return state ?? "absent"
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
