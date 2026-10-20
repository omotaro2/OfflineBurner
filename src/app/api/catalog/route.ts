import { listCaches } from "@/lib/cache"
import { devices, probeShelf, shelf } from "@/lib/shelf"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const caches = await listCaches()
  const probes = await Promise.all(
    shelf.map(async (item) => {
      try {
        return { id: item.id, remote: await probeShelf(item), error: null as string | null }
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

  const present = (item: (typeof shelf)[number]) => {
    const probe = probeById.get(item.id)
    const cached = caches[item.id] ?? null
    return {
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
      writesDevice: item.writesDevice,
      cached,
      remote: probe?.remote ?? null,
      remoteError: probe?.error ?? null,
      updateAvailable: Boolean(cached && probe?.remote && cached.version !== probe.remote.version),
    }
  }
  const recovery = shelf.find((item) => item.id === "m5launcher-cardputer")

  return NextResponse.json({
    online,
    checkedAt: new Date().toISOString(),
    recovery: recovery ? present(recovery) : null,
    devices: devices.map((device) => ({
      ...device,
      firmwares: shelf
        .filter((item) => item.listed && item.deviceId === device.id)
        .map((item) => present(item)),
    })),
  })
}
