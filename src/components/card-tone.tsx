import { Badge } from "@/components/ui/badge"
import type { Freshness } from "@/lib/sd-manifest"
import { cn } from "cn"

export type CardTone = Freshness | "absent" | "foreign"

export function cardToneClass(tone: CardTone): string {
  if (tone === "same") return "border-emerald-500/80 bg-emerald-950/45 ring-emerald-500/70"
  if (tone === "update") return "border-orange-400/80 bg-orange-950/45 ring-orange-400/70"
  if (tone === "card-newer") return "border-sky-400/75 bg-sky-950/40 ring-sky-400/70"
  if (tone === "missing") return "border-rose-400/75 bg-rose-950/40 ring-rose-400/70"
  if (tone === "foreign") return "border-border bg-muted/40"
  return "border-border bg-card"
}

export function cardToneLabel(tone: CardTone): string {
  if (tone === "same") return "カードと一致"
  if (tone === "update") return "新しい版がある"
  if (tone === "card-newer") return "カードが新しい"
  if (tone === "missing") return "ファイルがない"
  if (tone === "foreign") return "台帳の外"
  return "まだカードにない"
}

const LEGEND: CardTone[] = ["same", "update", "card-newer", "missing", "absent"]

export function StatusLegend() {
  return (
    <ul className="flex flex-wrap gap-2 text-xs">
      {LEGEND.map((tone) => (
        <li key={tone} className={cn("rounded-full border px-2.5 py-1", cardToneClass(tone))}>
          {cardToneLabel(tone)}
        </li>
      ))}
    </ul>
  )
}

export function CheckRow({
  checked,
  disabled,
  onChange,
  tone,
  title,
  detail,
  meta,
}: {
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
  tone: CardTone
  title: string
  detail: string
  meta?: string
}) {
  return (
    <label className={cn("flex items-start gap-3 rounded-xl border border-l-4 p-3", cardToneClass(tone), disabled && "opacity-60")}>
      <input
        type="checkbox"
        className="mt-1 size-5 shrink-0 accent-current"
        checked={checked}
        disabled={disabled}
        aria-label={title}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-base font-medium">
          {title}
          <Badge variant="outline">{cardToneLabel(tone)}</Badge>
        </span>
        <span className="mt-1 block text-sm leading-6 text-muted-foreground">{detail}</span>
        {meta && <span className="mt-1 block text-xs text-muted-foreground">{meta}</span>}
      </span>
    </label>
  )
}
