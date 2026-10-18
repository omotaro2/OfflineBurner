import { readCover } from "@/lib/cache"
import { downloadBytes } from "@/lib/firmware"
import { findShelfItem, probeShelf } from "@/lib/shelf"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const item = findShelfItem(id)
  if (!item) {
    return NextResponse.json({ error: "不明なファームウェアです" }, { status: 404 })
  }
  const cached = await readCover(id)
  if (cached) {
    return imageResponse(cached.data, cached.contentType)
  }
  try {
    const remote = await probeShelf(item)
    const data = await downloadBytes(remote.thumbnailUrl)
    return imageResponse(Buffer.from(data), remote.thumbnailType)
  } catch {
    return NextResponse.json({ error: "サムネイルがありません" }, { status: 404 })
  }
}

function imageResponse(data: Buffer, contentType: string) {
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
    },
  })
}
