"use client"

import { useCallback, useEffect, useState } from "react"
import { ProjectBrowser } from "@/components/project-browser"
import { SavedWrite } from "@/components/saved-write"
import { SdCard } from "@/components/sd-card"
import { useLauncherCard, type SavedFile } from "@/components/use-launcher-card"

type RemoteBrief = { id: string; version: string; publishedAt: string }

export function ProjectDesk({
  online,
  panel,
}: {
  online: boolean
  panel: "projects" | "saved" | "card"
}) {
  const [saved, setSaved] = useState<SavedFile[]>([])
  const [hiddenPlain, setHiddenPlain] = useState(0)
  const [remote, setRemote] = useState<RemoteBrief[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const loadSaved = useCallback(async () => {
    const response = await fetch("/api/projects/saved", { cache: "no-store" })
    if (!response.ok) return
    const body = (await response.json()) as { saved?: SavedFile[]; hiddenPlain?: number }
    setSaved(body.saved ?? [])
    setHiddenPlain(body.hiddenPlain ?? 0)
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

  const card = useLauncherCard({
    online,
    saved,
    remote,
    onEnsure: save,
  })

  if (panel === "saved") return <SavedWrite card={card} saved={saved} hiddenPlain={hiddenPlain} />
  if (panel === "card") return <SdCard card={card} />
  return (
    <ProjectBrowser
      online={online}
      saved={saved}
      busyId={busyId}
      errors={errors}
      cardState={card.stateById}
      onSave={(id) => void save(id).catch(() => undefined)}
    />
  )
}
