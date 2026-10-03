/**
 * Outgoing webhooks: a persisted outbox with signed, retried deliveries (D89).
 *
 * Every event is written to `WebhookDelivery` before anything is sent, so a
 * crash, a closed laptop or an endpoint that is down for an hour loses nothing:
 * the scheduler's tick picks pending rows up again. Each body is signed with
 * the webhook's own secret (`X-RapBooster-Signature: sha256=<hex>`), so the
 * receiver can prove the call came from this app and was not altered.
 *
 * NOTE: payloads are customer data (message text, phone numbers). They are
 * sent to the user's own endpoint and never logged here — log lines name the
 * delivery and the webhook by id only, and never the URL, which often carries
 * a token in its query string.
 */
import { createHmac, randomUUID } from 'node:crypto'
import type { WebhookEvent } from '../../../shared/types'
import { getPrisma } from '../db/client'
import { decryptValue } from './secure-store'

/** Wait before attempt 2, 3, 4, 5 and 6. A sixth failure is final. */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000]
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1
const TIMEOUT_MS = 10_000
/** Rows per tick; the rest wait for the next one. */
const TICK_BATCH = 50
/** Concurrent POSTs — one slow endpoint must not hold up every other. */
const PARALLEL = 5
const MAX_ERROR_LENGTH = 300

/**
 * The wait before the next attempt. Under E2E, RB_WEBHOOK_BACKOFF_MS replaces
 * every step so a retry spec does not wait a minute; ignored in production.
 */
function backoffMs(failedAttempts: number): number {
  const override = Number(process.env.RB_WEBHOOK_BACKOFF_MS)
  if (process.env.NODE_ENV === 'test' && Number.isFinite(override) && override >= 0) {
    return override
  }
  return BACKOFF_MS[Math.min(failedAttempts, BACKOFF_MS.length) - 1] ?? BACKOFF_MS[0]!
}

export function parseEvents(json: string): WebhookEvent[] {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as WebhookEvent[]) : []
  } catch (err) {
    console.debug('webhooks: unreadable events column', err)
    return []
  }
}

export function sign(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

export interface PostOutcome {
  status: number | null
  error: string | null
}

/** One signed POST. Never throws: every failure becomes an outcome. */
export async function postSigned(
  url: string,
  secret: string,
  event: string,
  deliveryId: string,
  body: string,
): Promise<PostOutcome> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'RapBooster-Advance',
        'X-RapBooster-Event': event,
        'X-RapBooster-Delivery': deliveryId,
        'X-RapBooster-Signature': sign(secret, body),
      },
      body,
      // A redirect is reported as a failure rather than followed: re-posting a
      // signed payload to wherever a server points is not what the user set up.
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    // Drain so the connection is released; the content is not ours to keep.
    await response.arrayBuffer().catch((err: unknown) => {
      console.debug('webhooks: response body unreadable', err)
    })
    if (response.status >= 200 && response.status < 300) {
      return { status: response.status, error: null }
    }
    return { status: response.status, error: `HTTP ${response.status}` }
  } catch (err) {
    const cause = (err as { cause?: { code?: string } } | undefined)?.cause?.code
    const message =
      err instanceof Error && err.name === 'TimeoutError'
        ? `No response within ${TIMEOUT_MS / 1000} s`
        : (cause ?? (err instanceof Error ? err.message : String(err)))
    return { status: null, error: message.slice(0, MAX_ERROR_LENGTH) }
  }
}

/** Deliveries being posted right now, so a tick never doubles a kicked one. */
const inFlight = new Set<string>()

async function attempt(deliveryId: string): Promise<void> {
  if (inFlight.has(deliveryId)) return
  inFlight.add(deliveryId)
  try {
    const prisma = getPrisma()
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    })
    if (!delivery || delivery.status !== 'pending' || !delivery.webhook.enabled) return

    const secret = decryptValue(delivery.webhook.secret)
    const outcome: PostOutcome = secret
      ? await postSigned(
          delivery.webhook.url,
          secret,
          delivery.event,
          delivery.id,
          delivery.payload,
        )
      : { status: null, error: 'The signing secret could not be read on this computer' }

    const attempts = delivery.attempts + 1
    const now = new Date()
    if (outcome.error === null) {
      await prisma.$transaction([
        prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'delivered', attempts, deliveredAt: now, lastError: null },
        }),
        prisma.webhook.update({
          where: { id: delivery.webhookId },
          data: { lastStatus: outcome.status, lastError: null, lastDeliveredAt: now },
        }),
      ])
      console.log(`webhooks: delivery ${delivery.id} delivered (attempt ${attempts})`)
      return
    }

    const final = attempts >= MAX_ATTEMPTS || secret === null
    await prisma.$transaction([
      prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attempts,
          lastError: outcome.error,
          ...(final
            ? { status: 'failed' }
            : { nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)) }),
        },
      }),
      prisma.webhook.update({
        where: { id: delivery.webhookId },
        data: { lastStatus: outcome.status, lastError: outcome.error },
      }),
    ])
    console.warn(
      `webhooks: delivery ${delivery.id} to webhook ${delivery.webhookId} failed ` +
        `(${outcome.error}, attempt ${attempts}/${MAX_ATTEMPTS})${final ? ' — giving up' : ''}`,
    )
  } finally {
    inFlight.delete(deliveryId)
  }
}

async function attemptAll(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += PARALLEL) {
    await Promise.all(
      ids
        .slice(i, i + PARALLEL)
        .map((id) =>
          attempt(id).catch((err: unknown) =>
            console.error(`webhooks: delivery ${id} could not be attempted`, err),
          ),
        ),
    )
  }
}

/** Queue `event` for every enabled webhook subscribed to it. */
export async function emitWebhook(
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const prisma = getPrisma()
  const hooks = await prisma.webhook.findMany({
    where: { enabled: true },
    select: { id: true, events: true },
    take: 100,
  })
  const subscribed = hooks.filter((h) => parseEvents(h.events).includes(event))
  if (subscribed.length === 0) return

  const at = new Date()
  const rows = subscribed.map((hook) => {
    const id = randomUUID()
    return {
      id,
      webhookId: hook.id,
      event,
      payload: JSON.stringify({ id, event, at: at.toISOString(), data }),
      nextAttemptAt: at,
    }
  })
  await prisma.$transaction(rows.map((data) => prisma.webhookDelivery.create({ data })))

  // The first attempt starts now rather than on the next tick, but the caller —
  // usually the inbound pipeline — must not wait on someone else's server.
  setImmediate(() => void attemptAll(rows.map((r) => r.id)))
}

/** Finished deliveries are kept this long for the "Recent deliveries" view. */
const RETENTION_MS = 30 * 24 * 3_600_000
const PRUNE_EVERY_MS = 3_600_000
let lastPrunedAt = 0

/**
 * Drop old finished deliveries. Every inbound message can add a row per
 * webhook, so without this the outbox would grow for the life of the install.
 */
async function pruneFinished(): Promise<void> {
  if (Date.now() - lastPrunedAt < PRUNE_EVERY_MS) return
  lastPrunedAt = Date.now()
  const { count } = await getPrisma().webhookDelivery.deleteMany({
    where: {
      status: { in: ['delivered', 'failed'] },
      createdAt: { lt: new Date(Date.now() - RETENTION_MS) },
    },
  })
  if (count > 0) console.log(`webhooks: pruned ${count} finished deliveries`)
}

/** Deliver pending webhook calls whose retry time has come. */
export async function webhookTick(): Promise<void> {
  await pruneFinished()
  const due = await getPrisma().webhookDelivery.findMany({
    where: {
      status: 'pending',
      nextAttemptAt: { lte: new Date() },
      webhook: { enabled: true },
    },
    orderBy: { nextAttemptAt: 'asc' },
    select: { id: true },
    take: TICK_BATCH,
  })
  await attemptAll(due.filter((d) => !inFlight.has(d.id)).map((d) => d.id))
}
