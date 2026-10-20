import path from "node:path"
import { copySavedToDownloads, listLauncherDrives, readDownloads } from "@/lib/sd-drive"
import { DOWNLOADS_DIR, explainWriteError } from "@/lib/sd-volume"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NOT_VISIBLE =
  "Launcher の USB がまだ見えていません。Cardputer で Launcher を開き、メニューの USB を選んだまま、この PC とつないでください。"

export async function GET(request: Request) {
  const listed = await listLauncherDrives()
  const requested = new URL(request.url).searchParams.get("device")
  const drive =
    listed.drives.find((item) => item.device === requested) ??
    listed.drives.find((item) => item.mount) ??
    listed.drives[0] ??
    null
  let files: Awaited<ReturnType<typeof readDownloads>>["manifest"]["files"] = []
  let sizes: Record<string, number> = {}
  let message = listed.drives.length === 0 ? listed.detail || NOT_VISIBLE : ""
  if (drive?.mount) {
    try {
      const shelf = await readDownloads(drive.mount)
      files = shelf.manifest.files
      sizes = shelf.sizes
      message = drive.writable
        ? "Launcher の USB でカードを見ています。bin は downloads に書きます。"
        : "Launcher の USB でカードを見ています。送るときに、この PC のユーザーで書き込めるように開き直します。"
    } catch (error) {
      message = explainWriteError(error).message
    }
  } else if (drive) {
    message = "Launcher の USB は見えています。送るときにカードを開きます。"
  }
  return NextResponse.json({
    drives: listed.drives,
    device: drive?.device ?? null,
    files,
    sizes,
    message,
    folder: DOWNLOADS_DIR,
  })
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { device?: unknown; ids?: unknown } | null
  const device = typeof body?.device === "string" ? body.device : ""
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string") : []
  if (!device) {
    return NextResponse.json({ error: NOT_VISIBLE }, { status: 400 })
  }
  try {
    const result = await copySavedToDownloads(device, ids)
    return NextResponse.json({
      written: result.written,
      device: result.drive.device,
      mount: result.drive.mount,
      files: result.files,
      sizes: result.sizes,
      folder: path.posix.join("/", DOWNLOADS_DIR),
      message: `${result.written} 件を downloads へ書きました。USB を終了し、Launcher の SD で downloads を開いて Install します。`,
    })
  } catch (error) {
    console.error("sd write failed", error instanceof Error && "code" in error ? error.code : error)
    const message = error instanceof Error ? error.message : "カードへ書けません"
    const status = message.startsWith("保管が見つかりません") ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
