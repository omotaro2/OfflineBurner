import { saveLatest } from "@/lib/cache"
import { findShelfItem } from "@/lib/shelf"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  if (!findShelfItem(id)) {
    return NextResponse.json({ error: "不明なファームウェアです" }, { status: 404 })
  }
  try {
    const cached = await saveLatest(id)
    return NextResponse.json({ cached })
  } catch (error) {
    const message = error instanceof Error ? error.message : "保管に失敗しました"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
