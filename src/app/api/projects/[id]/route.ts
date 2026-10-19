import { saveProject } from "@/lib/project-store"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  try {
    const saved = await saveProject(id)
    return NextResponse.json({ saved })
  } catch (error) {
    const message = error instanceof Error ? error.message : "保管に失敗しました"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
