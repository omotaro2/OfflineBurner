"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { freshness, type CardEntry, type Freshness } from "@/lib/sd-manifest"
import type { SavedBrief } from "@/components/project-browser"

export type SavedFile = SavedBrief & {
  name: string
  author?: string
  description?: string
  cover?: string | null
  bytes: number
  sha256: string
  savedAt?: string
}

export type Drive = {
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

export type CardRow = CardEntry & {
  fileBytes: number | null
  state: Freshness
  referenceLabel: string
  tracked: boolean
}

export function useLauncherCard({
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
  const [rows, setRows] = useState<CardRow[]>([])
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
        setRows(buildRows(body.files, body.sizes ?? {}, saved, remote))
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

  const post = async (payload: { action?: "delete"; ids?: string[]; filenames?: string[] }) => {
    const response = await fetch("/api/sd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device, ...payload }),
    })
    const body = (await response.json().catch(() => null)) as ShelfResponse | null
    if (!response.ok) throw new Error(body?.error ?? "カードへ書けません")
    if (body) apply(body)
  }

  const writeIds = async (ids: string[]) => {
    if (!device) {
      setError("Launcher の USB がまだ見えていません。メニューの USB を選んだまま、この PC とつないでください。")
      return false
    }
    if (ids.length === 0) {
      setMessage("送る項目をチェックしてください。")
      return false
    }
    busyRef.current = true
    setBusy(true)
    setError("")
    try {
      for (const id of ids) {
        const remoteItem = remote.find((item) => item.id === id)
        const savedItem = saved.find((item) => item.id === id)
        if (online && remoteItem && (!savedItem || remoteItem.publishedAt > savedItem.publishedAt)) {
          await onEnsure(id)
        }
      }
      await post({ ids })
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "カードへ書けません")
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
      void reload().catch(() => undefined)
    }
  }

  const removeFiles = async (filenames: string[]) => {
    if (!device) {
      setError("Launcher の USB がまだ見えていません。メニューの USB を選んだまま、この PC とつないでください。")
      return false
    }
    if (filenames.length === 0) {
      setMessage("削除する項目をチェックしてください。")
      return false
    }
    busyRef.current = true
    setBusy(true)
    setError("")
    try {
      await post({ action: "delete", filenames })
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "カードから削除できません")
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
      void reload().catch(() => undefined)
    }
  }

  const stateById = useMemo(() => {
    const map: Record<string, Freshness> = {}
    for (const row of rows) {
      if (row.tracked) map[row.id] = row.state
    }
    return map
  }, [rows])

  const active = drives.find((item) => item.device === device) ?? null

  return {
    drives,
    device,
    setDevice,
    rows,
    message,
    error,
    busy,
    active,
    stateById,
    reload,
    writeIds,
    removeFiles,
  }
}

export type LauncherCard = ReturnType<typeof useLauncherCard>

function buildRows(
  files: CardEntry[],
  sizes: Record<string, number>,
  saved: SavedFile[],
  remote: { id: string; version: string; publishedAt: string }[],
): CardRow[] {
  const listed = new Set<string>()
  const rows: CardRow[] = []
  for (const entry of files) {
    listed.add(entry.filename)
    const fileBytes = sizes[entry.filename] ?? null
    const remoteItem = remote.find((item) => item.id === entry.id)
    const savedItem = saved.find((item) => item.id === entry.id)
    const reference = remoteItem ?? savedItem ?? null
    rows.push({
      ...entry,
      fileBytes,
      state: freshness(entry, fileBytes, reference),
      referenceLabel: reference ? `${reference.version}（${reference.publishedAt || "日付なし"}）` : "",
      tracked: true,
    })
  }
  for (const [filename, bytes] of Object.entries(sizes)) {
    if (listed.has(filename)) continue
    const stem = filename.replace(/\.bin$/i, "")
    rows.push({
      id: `bin:${filename}`,
      name: stem,
      version: "",
      publishedAt: "",
      filename,
      bytes,
      sha256: "",
      kind: "app",
      fileBytes: bytes,
      state: "same",
      referenceLabel: "",
      tracked: false,
    })
  }
  return rows
}
