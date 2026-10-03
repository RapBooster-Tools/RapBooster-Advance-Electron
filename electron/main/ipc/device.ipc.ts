/**
 * Device channels.
 *
 * wa-service owns the sockets; this module owns the database rows. It is the
 * only place device state is written, which is what keeps main the single
 * writer (CLAUDE.md §2.4).
 */
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError } from '../../../shared/errors'
import { MAX_DEVICES } from '../../../shared/types'
import type { DeviceStatus } from '../../../shared/types'
import { getPrisma } from '../db/client'
import { sessionsDir } from '../db/paths'
import { waBridge } from '../wa-bridge'
import { registerHandler } from './router'
import {
  dailyCapPerDevice,
  effectiveCap,
  isStaleDay,
  warmupDay,
} from '../services/sending-policy'

function authDirFor(deviceId: string): string {
  return join(sessionsDir(), deviceId)
}

type DeviceRow = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getPrisma>['device']['findUnique']>>
>

/** `globalCap` is the configured daily cap (0 = unlimited), read once per call. */
export function serializeDevice(row: DeviceRow, globalCap: number) {
  const cap = effectiveCap(globalCap, row)
  const paused = row.healthPausedUntil && row.healthPausedUntil > new Date()
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    status: row.status as DeviceStatus,
    lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
    lastError: row.lastError,
    dailySentCount: isStaleDay(row.dailyCountResetAt) ? 0 : row.dailySentCount,
    createdAt: row.createdAt.toISOString(),
    warmupEnabled: row.warmupEnabled,
    warmupDay: warmupDay(row),
    effectiveCap: cap === 0 ? null : cap,
    healthPausedUntil: paused ? row.healthPausedUntil!.toISOString() : null,
    healthReason: paused ? row.healthReason : null,
    isBusiness: row.isBusiness,
  }
}

async function requireDevice(id: string) {
  // An archived device is gone as far as every screen and action is concerned.
  const device = await getPrisma().device.findFirst({ where: { id, archivedAt: null } })
  if (!device)
    throw new AppError('NOT_FOUND', { userMessage: 'That device no longer exists.' })
  return device
}

export function registerDeviceHandlers(): void {
  registerHandler('device:list', async () => {
    const rows = await getPrisma().device.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: 'asc' },
      take: MAX_DEVICES,
    })
    const cap = await dailyCapPerDevice()
    return rows.map((row) => serializeDevice(row, cap))
  })

  registerHandler('device:create', async ({ name }) => {
    const count = await getPrisma().device.count({ where: { archivedAt: null } })
    if (count >= MAX_DEVICES) {
      throw new AppError('DEVICE_LIMIT_REACHED', {
        userMessage: `You can connect at most ${MAX_DEVICES} devices.`,
      })
    }

    const device = await getPrisma().device.create({
      data: { name, authFolder: '', status: 'disconnected' },
    })
    // The folder name is the id, which only exists after the insert.
    const updated = await getPrisma().device.update({
      where: { id: device.id },
      data: { authFolder: device.id },
    })
    return serializeDevice(updated, await dailyCapPerDevice())
  })

  registerHandler('device:rename', async ({ id, name }) => {
    await requireDevice(id)
    const renamed = await getPrisma().device.update({ where: { id }, data: { name } })
    return serializeDevice(renamed, await dailyCapPerDevice())
  })

  registerHandler('device:connect', async ({ id }) => {
    const device = await requireDevice(id)
    await getPrisma().device.update({
      where: { id },
      data: { status: 'connecting', lastError: null },
    })
    await waBridge.request('device:connect', {
      deviceId: device.id,
      authDir: authDirFor(device.id),
    })
    return { ok: true as const }
  })

  registerHandler('device:requestPairingCode', async ({ id, phone }) => {
    await requireDevice(id)
    const { code } = await waBridge.request('device:pairingCode', { deviceId: id, phone })
    return { code }
  })

  registerHandler('device:reconnect', async ({ id }) => {
    const device = await requireDevice(id)
    // Reconnecting is the user overriding the circuit breaker, so the failure
    // counter resets — otherwise a device that gave up could never come back.
    await getPrisma().device.update({
      where: { id },
      data: { status: 'connecting', lastError: null, consecutiveFailures: 0 },
    })
    await waBridge.request('device:disconnect', { deviceId: id }).catch(() => {
      // Not being connected is the normal case here.
    })
    await waBridge.request('device:connect', {
      deviceId: device.id,
      authDir: authDirFor(device.id),
    })
    return { ok: true as const }
  })

  registerHandler('device:logout', async ({ id }) => {
    await requireDevice(id)
    await waBridge.request('device:logout', { deviceId: id }).catch((err: unknown) => {
      // The socket may already be gone; the row and credentials still must go.
      console.warn(`device:logout — service call failed for ${id}`, err)
    })
    await rm(authDirFor(id), { recursive: true, force: true })
    await getPrisma().device.update({
      where: { id },
      data: { status: 'logged_out', phone: null, jid: null },
    })
    return { ok: true as const }
  })

  /**
   * Remove a device and everything it holds (customer decision D158): its
   * chats and messages, groups, channels, posts, calls and synced contacts.
   *
   * A device that ever sent for a campaign is archived instead of deleted:
   * campaign reports reference it, and deleting it would fail on that
   * reference. Archived, it is hidden, frees its slot and never reconnects.
   */
  registerHandler('device:delete', async ({ id }) => {
    const device = await requireDevice(id)
    const prisma = getPrisma()

    // Removing a number out from under an unfinished campaign would strand it.
    const busy = await prisma.campaign.findFirst({
      where: {
        status: { in: ['scheduled', 'running', 'paused'] },
        devices: { some: { deviceId: id } },
      },
      select: { name: true },
    })
    if (busy) {
      throw new AppError('CONFLICT', {
        userMessage: `"${busy.name}" still uses ${device.name}. Finish or cancel that campaign first.`,
      })
    }

    await waBridge.request('device:logout', { deviceId: id }).catch((err: unknown) => {
      // Removing a never-connected or already logged-out device is legitimate.
      console.debug(`device:delete: logout of ${id} skipped`, err)
    })
    await rm(authDirFor(id), { recursive: true, force: true })

    const usedByCampaigns = await prisma.campaignRecipient.findFirst({
      where: { deviceId: id },
      select: { id: true },
    })
    if (!usedByCampaigns) {
      await prisma.device.delete({ where: { id } })
      return { ok: true as const }
    }

    // Chats cascade to messages, notes, drafts, scheduled messages and flows.
    await prisma.$transaction([
      prisma.chat.deleteMany({ where: { deviceId: id } }),
      prisma.group.deleteMany({ where: { deviceId: id } }),
      prisma.groupCreateJob.deleteMany({ where: { deviceId: id } }),
      prisma.channel.deleteMany({ where: { deviceId: id } }),
      prisma.scheduledPost.deleteMany({ where: { deviceId: id } }),
      prisma.callEvent.deleteMany({ where: { deviceId: id } }),
      prisma.waContact.deleteMany({ where: { deviceId: id } }),
      prisma.device.update({
        where: { id },
        data: { archivedAt: new Date(), status: 'logged_out', warmupEnabled: false },
      }),
    ])
    return { ok: true as const }
  })
}

/**
 * Re-open sockets for devices that were connected before a restart.
 *
 * Called by the supervisor's recovery hook. State comes from the database, not
 * from anything the dead process held (CLAUDE.md §5.5).
 */
export async function recoverDeviceSessions(): Promise<void> {
  const devices = await getPrisma().device.findMany({
    where: {
      status: { in: ['connected', 'connecting', 'qr_pending', 'pairing_pending'] },
    },
  })
  for (const device of devices) {
    try {
      await waBridge.request('device:connect', {
        deviceId: device.id,
        authDir: authDirFor(device.id),
      })
    } catch (err) {
      console.error(`recovery: could not reconnect device ${device.id}`, err)
    }
  }
  if (devices.length > 0) {
    console.log(`recovery: re-opened ${devices.length} device session(s)`)
  }
}
