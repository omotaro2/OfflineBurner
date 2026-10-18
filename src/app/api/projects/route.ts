import { listCardputerProjects } from "@/lib/projects"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const projects = await listCardputerProjects()
    return NextResponse.json({ projects })
  } catch (error) {
    const message = error instanceof Error ? error.message : "プロジェクト一覧を取得できません"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
