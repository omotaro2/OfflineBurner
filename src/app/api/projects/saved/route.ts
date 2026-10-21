import { listSavedProjects, type SavedProject } from "@/lib/project-store"
import { listCardputerProjects, type ProjectCard } from "@/lib/projects"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const saved = await listSavedProjects()
  let catalog: ProjectCard[] | null = null
  try {
    catalog = await listCardputerProjects()
  } catch {
    catalog = null
  }
  if (!catalog) {
    return NextResponse.json({ saved, hiddenPlain: 0 })
  }
  const byId = new Map(catalog.map((project) => [project.id, project]))
  const visible: SavedProject[] = []
  let hiddenPlain = 0
  for (const item of saved) {
    const project = byId.get(item.id)
    if (!project) {
      hiddenPlain += 1
      continue
    }
    visible.push({
      ...item,
      name: item.name || project.name,
      author: item.author || project.author,
      description: item.description || project.description,
      cover: item.cover || project.cover,
    })
  }
  return NextResponse.json({ saved: visible, hiddenPlain })
}
