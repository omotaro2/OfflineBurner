import { listSavedProjects } from "@/lib/project-store"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const saved = await listSavedProjects()
  return NextResponse.json({ saved })
}
