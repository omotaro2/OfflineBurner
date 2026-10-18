import { listCaches } from "@/lib/cache"
import { devices, shelf } from "@/lib/shelf"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const caches = await listCaches()
  const probes = await Promise.all(
    shelf.map(async (item) => {
      try {
        return { id: item.id, remote: await item.probe(), error: null as string | null }
      } catch (error) {
        return {
          id: item.id,
          remote: null,
          error: error instanceof Error ? error.message : "安定版を確認できません",
        }
      }
    }),
  )
  const probeById = new Map(probes.map((probe) => [probe.id, probe]))
  const online = probes.some((probe) => probe.remote)

  return NextResponse.json({
    online,
    checkedAt: new Date().toISOString(),
    devices: devices.map((device) => ({
      ...device,
      firmwares: shelf
        .filter((item) => item.deviceId === device.id)
        .map((item) => {
          const probe = probeById.get(item.id)
          const cached = caches[item.id] ?? null
          const info = {
            id: item.id,
            deviceId: item.deviceId,
            name: item.name,
            summary: item.summary,
            cautions: item.cautions,
            chip: item.chip,
            flashSize: item.flashSize,
            flashMode: item.flashMode,
            flashFreq: item.flashFreq,
            connect: item.connect,
            eraseAll: item.eraseAll,
          }
          return {
            ...info,
            cached,
            remote: probe?.remote ?? null,
            remoteError: probe?.error ?? null,
            updateAvailable: Boolean(
              cached && probe?.remote && cached.version !== probe.remote.version,
            ),
          }
        }),
    })),
  })
}
