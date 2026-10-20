"use client"

import Image from "next/image"
import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { ProjectCard } from "@/lib/projects"
import { cn } from "cn"
import { Download, ExternalLink } from "lucide-react"

const PAGE = 12

export type SavedBrief = {
  id: string
  version: string
  publishedAt: string
  kind: "merged" | "app"
}

export function ProjectBrowser({
  online,
  saved,
  busyId,
  errors,
  onSave,
}: {
  online: boolean
  saved: SavedBrief[]
  busyId: string | null
  errors: Record<string, string>
  onSave: (id: string) => void
}) {
  const [projects, setProjects] = useState<ProjectCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<"downloads" | "new">("downloads")
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    if (!online) return
    let cancel = false
    void fetch("/api/projects", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { projects?: ProjectCard[]; error?: string }
        if (!response.ok) throw new Error(body.error ?? "プロジェクト一覧を取得できません")
        return body.projects ?? []
      })
      .then((rows) => {
        if (!cancel) setProjects(rows)
      })
      .catch((reason: unknown) => {
        if (!cancel) {
          setError(reason instanceof Error ? reason.message : "プロジェクト一覧を取得できません")
        }
      })
    return () => {
      cancel = true
    }
  }, [online])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = (projects ?? []).filter((project) => {
      if (!needle) return true
      return `${project.name} ${project.author} ${project.description}`.toLowerCase().includes(needle)
    })
    return [...rows].sort((a, b) =>
      sort === "downloads" ? b.downloads - a.downloads : b.publishedAt.localeCompare(a.publishedAt),
    )
  }, [projects, query, sort])

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Cardputer（無印）のプロジェクト</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          ネットがあるとき、M5Burner の公開一覧から無印 Cardputer 向けを表示します。Cardputer Adv は無印の上位互換なので、同じ bin を無印と Adv の SD に送れます。ファイル名はプロジェクト名です。Launcher の USB でつながったカードの downloads に入り、SD の downloads から Install します。攻撃向けのファームは入れていません。
        </p>
      </div>
      {!online && (
        <Card>
          <CardHeader>
            <CardTitle>オンラインのときだけ表示します</CardTitle>
            <CardDescription>家のネットに繋いで、このページを開き直してください。</CardDescription>
          </CardHeader>
        </Card>
      )}
      {online && !projects && !error && (
        <Card>
          <CardHeader>
            <CardTitle>公開プロジェクトを集めています</CardTitle>
            <CardDescription>一覧は少し大きいので、最初の表示まで少し待ちます。</CardDescription>
          </CardHeader>
        </Card>
      )}
      {error && (
        <Card>
          <CardHeader>
            <CardTitle>一覧を取得できません</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      )}
      {projects && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              className="h-11 sm:max-w-sm"
              value={query}
              placeholder="名前や作者で探す"
              onChange={(event) => {
                setQuery(event.target.value)
                setShown(PAGE)
              }}
            />
            <div className="flex gap-2">
              <Button
                className="h-11"
                variant={sort === "downloads" ? "default" : "outline"}
                onClick={() => setSort("downloads")}
              >
                ダウンロード順
              </Button>
              <Button
                className="h-11"
                variant={sort === "new" ? "default" : "outline"}
                onClick={() => setSort("new")}
              >
                新しい順
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {visible.length.toLocaleString("ja-JP")} 件
            {query.trim() ? "" : ` / 全 ${projects.length.toLocaleString("ja-JP")} 件`}
          </p>
          {visible.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>該当するプロジェクトがありません</CardTitle>
                <CardDescription>別の言葉で探してください。</CardDescription>
              </CardHeader>
            </Card>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {visible.slice(0, shown).map((project) => (
              <ProjectTile
                key={project.id}
                project={project}
                saved={saved.find((item) => item.id === project.id) ?? null}
                busy={busyId === project.id}
                error={errors[project.id] ?? ""}
                onSave={() => onSave(project.id)}
              />
            ))}
          </div>
          {shown < visible.length && (
            <Button className="h-11 self-start" variant="outline" onClick={() => setShown((count) => count + PAGE)}>
              もっと見る
            </Button>
          )}
        </>
      )}
    </section>
  )
}

function ProjectTile({
  project,
  saved,
  busy,
  error,
  onSave,
}: {
  project: ProjectCard
  saved: SavedBrief | null
  busy: boolean
  error: string
  onSave: () => void
}) {
  const newer = saved && project.publishedAt > saved.publishedAt
  let saveLabel = "オフライン用に保管"
  if (busy) saveLabel = "保管しています"
  else if (project.kind === "unsupported") saveLabel = "8MB を超えます"
  else if (newer) saveLabel = "新しい版を保管"
  else if (saved) saveLabel = "もう一度保管"
  return (
    <Card className="overflow-hidden">
      <ProjectCover file={project.cover} name={project.name} />
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {project.name}
          {project.shelfId && <Badge>この棚にある</Badge>}
        </CardTitle>
        <CardDescription>{project.author || "作者不明"}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {project.description && <p className="leading-6 text-muted-foreground">{project.description}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <Download className="size-3.5 text-primary" />
            ダウンロード {project.downloads.toLocaleString("ja-JP")}
          </span>
          {project.version && <span>版 {project.version}</span>}
          {saved && <Badge variant="secondary">保管済み {saved.version}</Badge>}
          <span>SD から Install</span>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          SD のファイル名はプロジェクト名です。Launcher の SD で downloads を開き、その名前を選んで Install します。
        </p>
        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">{error}</p>}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button className="h-11" variant="outline" disabled={busy || project.kind === "unsupported"} onClick={onSave}>
          <Download />
          {saveLabel}
        </Button>
        {project.github && (
          <a
            className={cn(buttonVariants({ variant: "outline" }), "h-11")}
            href={project.github}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink />
            GitHub
          </a>
        )}
      </CardFooter>
    </Card>
  )
}

function ProjectCover({ file, name }: { file: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  if (!file || failed) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center bg-muted text-xs text-muted-foreground">
        画像なし
      </div>
    )
  }
  return (
    <div className="relative aspect-[16/9] bg-muted">
      <Image
        src={`/api/projects/cover/${file}`}
        alt={`${name} のサムネイル`}
        fill
        sizes="(min-width: 640px) 50vw, 100vw"
        unoptimized
        className="object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  )
}
