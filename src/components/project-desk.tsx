"use client"

import { useCallback, useEffect, useState } from "react"
import { ProjectBrowser, type SavedBrief } from "@/components/project-browser"
import { SdCard } from "@/components/sd-card"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type SavedProject = SavedBrief & {
  name: string
  author: string
  bytes: number
  sha256: string
  savedAt: string
}

type RemoteBrief = { id: string; version: string; publishedAt: string }

export function ProjectDesk({ online }: { online: boolean }) {
  const [saved, setSaved] = useState<SavedProject[]>([])
  const [remote, setRemote] = useState<RemoteBrief[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

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

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">保管したプロジェクト</h2>
        {saved.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>まだありません</CardTitle>
              <CardDescription>
                下の一覧でプロジェクトを開き、オフライン用に保管します。SD へ送ると、Launcher の Install で入れられます。
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-3">
            {saved.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {item.name}
                    <Badge>SD から Install</Badge>
                  </CardTitle>
                  <CardDescription>
                    {item.version || "版不明"}（{formatBytes(item.bytes)}、{item.savedAt.slice(0, 16).replace("T", " ")}）
                  </CardDescription>
                </CardHeader>
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
      />
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
