import { readProjectCover } from "@/lib/projects"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> },
) {
  const { file } = await context.params
  const cover = await readProjectCover(file)
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
