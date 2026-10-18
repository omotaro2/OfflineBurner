import { readPart } from "@/lib/cache"
import { findShelfItem } from "@/lib/shelf"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; part: string }> },
) {
  const { id, part } = await context.params
  if (!findShelfItem(id)) {
    return NextResponse.json({ error: "不明なファームウェアです" }, { status: 404 })
  }
  try {
    const data = await readPart(id, part)
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "Content-Length": String(data.byteLength),
      },
    })
  } catch {
    return NextResponse.json({ error: "保管したファイルがありません" }, { status: 404 })
  }
}
