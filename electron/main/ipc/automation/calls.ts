/**
 * Call handling channels (D89).
 */
import { getPrisma } from '../../db/client'
import { readCallConfig, writeCallConfig } from '../../services/calls'
import { registerHandler } from '../router'

export function registerCallHandlers(): void {
  registerHandler('calls:getConfig', () => readCallConfig())

  registerHandler('calls:setConfig', async (config) => {
    await writeCallConfig(config)
    return { ok: true as const }
  })

  registerHandler('calls:list', async ({ limit }) => {
    const rows = await getPrisma().callEvent.findMany({
      orderBy: { at: 'desc' },
      take: limit,
    })
    return rows.map((r) => ({
      id: r.id,
      deviceId: r.deviceId,
      from: r.from,
      isVideo: r.isVideo,
      rejected: r.rejected,
      replied: r.replied,
      at: r.at.toISOString(),
    }))
  })
}
