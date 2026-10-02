/**
 * Webhook channels (D89).
 *
 * The signing secret leaves main exactly once, in the `webhook:create`
 * response. Every other channel returns the webhook without it, so a stolen
 * renderer state or a screenshot of the settings screen cannot forge payloads.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { AppError } from '../../../../shared/errors'
import type { WebhookEvent } from '../../../../shared/types'
import { getPrisma } from '../../db/client'
import { toast } from '../../services/notify'
import { decryptValue, encryptValue } from '../../services/secure-store'
import { parseEvents, postSigned } from '../../services/webhooks'
import { registerHandler } from '../router'

interface WebhookRow {
  id: string
  url: string
  events: string
  enabled: boolean
  lastStatus: number | null
  lastError: string | null
  lastDeliveredAt: Date | null
  createdAt: Date
}

function serializeWebhook(row: WebhookRow) {
  return {
    id: row.id,
    url: row.url,
    events: parseEvents(row.events),
    enabled: row.enabled,
    lastStatus: row.lastStatus,
    lastError: row.lastError,
    lastDeliveredAt: row.lastDeliveredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

const MAX_WEBHOOKS = 100

async function requireWebhook(id: string) {
  const row = await getPrisma().webhook.findUnique({ where: { id } })
  if (!row) {
    throw new AppError('NOT_FOUND', { userMessage: 'That webhook no longer exists.' })
  }
  return row
}

export function registerWebhookHandlers(): void {
  registerHandler('webhook:list', async () => {
    const rows = await getPrisma().webhook.findMany({
      orderBy: { createdAt: 'asc' },
      take: MAX_WEBHOOKS,
    })
    return rows.map(serializeWebhook)
  })

  registerHandler('webhook:create', async ({ url, events }) => {
    const secret = randomBytes(32).toString('hex')
    const stored = encryptValue(secret)
    if (!stored.encrypted) {
      // CLAUDE.md §5.6: degrade explicitly, never silently.
      toast(
        'warning',
        'OS encryption is unavailable, so this webhook secret is stored unencrypted on this computer.',
      )
    }
    const row = await getPrisma().webhook.create({
      data: { url, events: JSON.stringify([...new Set(events)]), secret: stored.data },
    })
    return { ...serializeWebhook(row), secret }
  })

  registerHandler('webhook:update', async ({ id, url, events, enabled }) => {
    await requireWebhook(id)
    const row = await getPrisma().webhook.update({
      where: { id },
      data: {
        ...(url !== undefined ? { url } : {}),
        ...(events !== undefined ? { events: JSON.stringify([...new Set(events)]) } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
      },
    })
    return serializeWebhook(row)
  })

  registerHandler('webhook:delete', async ({ id }) => {
    // Deliveries cascade with the webhook.
    await getPrisma().webhook.deleteMany({ where: { id } })
    return { ok: true as const }
  })

  registerHandler('webhook:test', async ({ id }) => {
    const row = await requireWebhook(id)
    const secret = decryptValue(row.secret)
    if (!secret) {
      throw new AppError('UNKNOWN', {
        userMessage:
          'This webhook’s signing secret cannot be read on this computer. Delete it and create it again.',
      })
    }
    const deliveryId = randomUUID()
    const event: WebhookEvent = 'message.received'
    // Clearly synthetic, so a receiver can tell a test from a real customer.
    const body = JSON.stringify({
      id: deliveryId,
      event,
      at: new Date().toISOString(),
      test: true,
      data: {
        deviceId: 'test-device',
        chatId: 'test@s.whatsapp.net',
        phone: '+10000000000',
        isGroup: false,
        type: 'text',
        text: 'This is a test event from RapBooster Advance.',
        at: new Date().toISOString(),
      },
    })
    const outcome = await postSigned(row.url, secret, event, deliveryId, body)
    await getPrisma().webhook.update({
      where: { id },
      data: {
        lastStatus: outcome.status,
        lastError: outcome.error,
        ...(outcome.error === null ? { lastDeliveredAt: new Date() } : {}),
      },
    })
    return outcome
  })

  registerHandler('webhook:deliveries', async ({ id, limit }) => {
    const rows = await getPrisma().webhookDelivery.findMany({
      where: { webhookId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return rows.map((d) => ({
      id: d.id,
      event: d.event as WebhookEvent,
      status: d.status as 'pending' | 'delivered' | 'failed',
      attempts: d.attempts,
      lastError: d.lastError,
      createdAt: d.createdAt.toISOString(),
      deliveredAt: d.deliveredAt?.toISOString() ?? null,
    }))
  })
}
