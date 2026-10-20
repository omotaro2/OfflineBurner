import { launcherSdImage } from "@/lib/launcher-payload"
import { readSavedBin } from "@/lib/project-store"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  try {
    const data = launcherSdImage(await readSavedBin(id))
    return new NextResponse(new Blob([new Uint8Array(data)]), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "保管が見つかりません"
    const status = message === "保管が見つかりません" ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
