import { readSavedCover } from "@/lib/project-store"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  if (!/^[\w-]{6,80}$/.test(id)) {
    return NextResponse.json({ error: "画像がありません" }, { status: 404 })
  }
  const cover = await readSavedCover(id)
  if (!cover) {
    return NextResponse.json({ error: "画像がありません" }, { status: 404 })
  }
  return new NextResponse(Buffer.from(cover.data), {
    headers: {
      "Content-Type": cover.contentType,
      "Cache-Control": "private, max-age=86400",
    },
  })
}
