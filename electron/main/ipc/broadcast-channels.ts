/**
 * WhatsApp Channels a device owns or follows (D89).
 *
 * The table is a local record: removing a row never deletes the real channel
 * on WhatsApp, which only the WhatsApp app can do.
 */
import type { Channel, Device } from '../../../generated/prisma/client'
import { AppError } from '../../../shared/errors'
import type { IpcResponse } from '../../../shared/ipc'
import type { WaResponses } from '../../../shared/wa-protocol'
import { getPrisma } from '../db/client'
import { waBridge } from '../wa-bridge'
import { registerHandler } from './router'

const CHANNEL_URL = 'https://whatsapp.com/channel/'
const LIST_LIMIT = 500

type ChannelDto = IpcResponse<'channel:list'>[number]

function serializeChannel(c: Channel): ChannelDto {
  return {
    id: c.id,
    deviceId: c.deviceId,
    name: c.name,
    description: c.description,
    role: c.role,
    subscribers: c.subscribers,
    inviteUrl: c.inviteCode ? `${CHANNEL_URL}${c.inviteCode}` : null,
    syncedAt: c.syncedAt.toISOString(),
  }
}

/**
 * Accepts https://whatsapp.com/channel/<code> (with or without www, a trailing
 * slash or a query string), a bare invite code, or a `…@newsletter` JID.
 */
export function parseChannelInvite(invite: string): string {
  const value = invite.trim()
  if (/^[\w.-]+@newsletter$/i.test(value)) return value

  const url = /^(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i.exec(
    value,
  )
  if (url?.[1]) return url[1]
  if (/^[A-Za-z0-9_-]{4,64}$/.test(value)) return value

  throw new AppError('VALIDATION_FAILED', {
    userMessage: 'Paste a channel link like https://whatsapp.com/channel/… or its code.',
  })
}

async function requireConnectedDevice(deviceId: string): Promise<Device> {
  const device = await getPrisma().device.findUnique({ where: { id: deviceId } })
  if (!device) {
    throw new AppError('NOT_FOUND', { userMessage: 'That device no longer exists.' })
  }
  if (device.status !== 'connected') {
    throw new AppError('DEVICE_NOT_CONNECTED', {
      userMessage: `Connect ${device.name} first.`,
    })
  }
  return device
}

/** Map a wa-service failure onto the error taxonomy. */
function waFailure(err: unknown, userMessage: string): AppError {
  const detail = err instanceof Error ? err.message : String(err)
  if (detail.includes('not connected')) {
    return new AppError('DEVICE_NOT_CONNECTED', { detail })
  }
  if (detail.includes('wa-service')) return new AppError('WA_SERVICE_DOWN', { detail })
  return new AppError('SEND_FAILED', { userMessage, detail })
}

export function registerChannelHandlers(): void {
  registerHandler('channel:list', async ({ deviceId }) => {
    const rows = await getPrisma().channel.findMany({
      where: deviceId ? { deviceId } : {},
      orderBy: { name: 'asc' },
      take: LIST_LIMIT,
    })
    return rows.map(serializeChannel)
  })

  registerHandler('channel:create', async ({ deviceId, name, description }) => {
    await requireConnectedDevice(deviceId)
    let created: WaResponses['channel:create']
    try {
      created = await waBridge.request('channel:create', { deviceId, name, description })
    } catch (err) {
      throw waFailure(err, 'WhatsApp did not create the channel. Try again later.')
    }
    const row = await getPrisma().channel.upsert({
      where: { id: created.id },
      create: {
        id: created.id,
        deviceId,
        name: created.name,
        description: description || null,
        role: 'owner',
        inviteCode: created.inviteCode,
      },
      update: {
        deviceId,
        name: created.name,
        description: description || null,
        role: 'owner',
        inviteCode: created.inviteCode,
        syncedAt: new Date(),
      },
    })
    return serializeChannel(row)
  })

  registerHandler('channel:follow', async ({ deviceId, invite }) => {
    const key = parseChannelInvite(invite)
    await requireConnectedDevice(deviceId)
    let info: WaResponses['channel:follow']
    try {
      info = await waBridge.request('channel:follow', { deviceId, key })
    } catch (err) {
      throw waFailure(err, 'That channel could not be followed. Check the link.')
    }

    const prisma = getPrisma()
    const existing = await prisma.channel.findUnique({ where: { id: info.id } })
    const synced = {
      name: info.name,
      description: info.description,
      subscribers: info.subscribers,
      inviteCode: info.inviteCode ?? existing?.inviteCode ?? null,
      syncedAt: new Date(),
    }
    // Following a channel one of our devices already runs must not demote it.
    const row = existing
      ? await prisma.channel.update({
          where: { id: info.id },
          data: existing.role === 'subscriber' ? { ...synced, deviceId } : { ...synced },
        })
      : await prisma.channel.create({
          data: { id: info.id, deviceId, role: 'subscriber', ...synced },
        })
    return serializeChannel(row)
  })

  registerHandler('channel:delete', async ({ id }) => {
    const { count } = await getPrisma().channel.deleteMany({ where: { id } })
    if (count === 0) {
      throw new AppError('NOT_FOUND', { userMessage: 'That channel is already gone.' })
    }
    return { ok: true as const }
  })
}
