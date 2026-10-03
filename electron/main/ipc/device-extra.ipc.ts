/**
 * Warmup, device health, business labels and the catalog (D89).
 */
import { AppError } from '../../../shared/errors'
import { getPrisma } from '../db/client'
import { refreshBusinessStatus } from '../services/labels'
import { notify } from '../services/notify'
import { applyDevicePolicy } from '../services/sending-policy'
import { readWarmupConfig, writeWarmupConfig } from '../services/warmup'
import { waBridge } from '../wa-bridge'
import { registerHandler } from './router'

async function requireDevice(id: string) {
  const device = await getPrisma().device.findUnique({ where: { id } })
  if (!device)
    throw new AppError('NOT_FOUND', { userMessage: 'That device no longer exists.' })
  return device
}

const NOT_BUSINESS = 'Catalogs exist only on WhatsApp Business accounts.'

export function registerDeviceExtraHandlers(): void {
  registerHandler('device:setWarmup', async ({ id, enabled }) => {
    await requireDevice(id)
    // Re-enabling restarts the ramp at day 1 on purpose: a number that sat
    // idle has lost the reputation the earlier days built.
    await getPrisma().device.update({
      where: { id },
      data: { warmupEnabled: enabled, warmupStartedAt: enabled ? new Date() : null },
    })
    // The throttle enforces the cap, so it must hear about the new ceiling
    // now — not when the next campaign happens to start.
    await applyDevicePolicy(id)
    notify('device:updated', { deviceId: id })
    return { ok: true as const }
  })

  registerHandler('device:clearHealthPause', async ({ id }) => {
    await requireDevice(id)
    await getPrisma().device.update({
      where: { id },
      data: { healthPausedUntil: null, healthReason: null },
    })
    notify('device:updated', { deviceId: id })
    return { ok: true as const }
  })

  registerHandler('device:syncLabels', async ({ id }) => {
    const device = await requireDevice(id)
    if (device.status !== 'connected') {
      throw new AppError('DEVICE_NOT_CONNECTED', {
        userMessage: 'Connect this device first, then re-check.',
      })
    }
    await refreshBusinessStatus(id).catch((err: unknown) => {
      throw new AppError('NETWORK_ERROR', {
        userMessage: 'WhatsApp did not answer. Try again in a moment.',
        detail: err instanceof Error ? err.message : String(err),
        cause: err,
      })
    })
    const after = await requireDevice(id)
    return { isBusiness: after.isBusiness }
  })

  registerHandler('warmup:getConfig', () => readWarmupConfig())

  registerHandler('warmup:setConfig', async (config) => {
    await writeWarmupConfig(config)
    return { ok: true as const }
  })

  registerHandler('catalog:list', async ({ deviceId }) => {
    let device = await requireDevice(deviceId)
    if (device.status !== 'connected') {
      throw new AppError('DEVICE_NOT_CONNECTED', {
        userMessage: 'Connect this device to load its catalog.',
      })
    }
    if (!device.isBusiness) {
      // The flag is read on connect; ask once more in case that answer was
      // missed (the user converted the account, or the check was still in
      // flight when this request arrived).
      await refreshBusinessStatus(deviceId).catch((err: unknown) =>
        console.warn('catalog: business re-check failed', err),
      )
      device = await requireDevice(deviceId)
      if (!device.isBusiness) {
        throw new AppError('VALIDATION_FAILED', { userMessage: NOT_BUSINESS })
      }
    }
    try {
      const { products } = await waBridge.request('catalog:fetch', { deviceId })
      return products
    } catch (err) {
      throw new AppError('NETWORK_ERROR', {
        userMessage: 'Could not load the catalog from WhatsApp. Try again shortly.',
        detail: err instanceof Error ? err.message : String(err),
        cause: err,
      })
    }
  })
}
