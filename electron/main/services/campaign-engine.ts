/**
 * Campaign send engine (SPRINTS.md §6.2–§6.4).
 *
 * Runs in main because it owns the database. Pacing is enforced in wa-service
 * at the socket boundary, so this file never sleeps between sends — it asks
 * wa-service to send and the scheduler there decides when.
 *
 * The correctness rules, in order of importance:
 *
 *   1. Progress lives in `CampaignRecipient` rows, never in memory. A crash
 *      must lose nothing that was already decided.
 *   2. A row is claimed with a single atomic UPDATE, so two workers can never
 *      take the same recipient.
 *   3. Counters are recomputed from rows, never incremented in memory, so they
 *      cannot drift after a restart.
 */
import Database from 'better-sqlite3'
import { getPrisma } from '../db/client'
import { databasePath } from '../db/paths'
import { inQuietHours } from '../../../shared/quiet-hours'
import type { CampaignStatus } from '../../../shared/types'
import { buildTemplateMessage, mergeValues } from './template-message'
import { waBridge } from '../wa-bridge'
import { notify, toast } from './notify'
import { suppressedPhones } from './optout'
import {
  applyDevicePolicy,
  effectiveCap,
  isParkingError,
  isStaleDay,
  quietWindow,
  readSendingDefaults,
} from './sending-policy'
import { emitWebhook } from './webhooks'

export interface CampaignCounters {
  total: number
  sent: number
  failed: number
  pending: number
}

/** Retryable failures are transient; terminal ones will fail identically forever. */
function isRetryable(message: string): boolean {
  const terminal = [
    'not on whatsapp',
    'invalid number',
    'blocked',
    'forbidden',
    'not-authorized',
  ]
  const lower = message.toLowerCase()
  return !terminal.some((t) => lower.includes(t))
}

/**
 * Claim the next pending recipient for a device.
 *
 * Deliberately raw SQL: this must be one statement so SQLite's write lock makes
 * it atomic. Prisma would issue a SELECT then an UPDATE, leaving a window in
 * which two workers could claim the same row and send twice.
 */
export function claimNext(
  campaignId: string,
  deviceId: string,
): {
  id: string
  contactId: string
  phone: string
  attempts: number
} | null {
  const db = new Database(databasePath())
  try {
    db.pragma('busy_timeout = 5000')
    const row = db
      .prepare(
        `UPDATE CampaignRecipient
            SET status = 'sending', claimedAt = CURRENT_TIMESTAMP
          WHERE id = (
            SELECT id FROM CampaignRecipient
             WHERE campaignId = ? AND deviceId = ? AND status = 'pending'
             ORDER BY rowid
             LIMIT 1
          )
        RETURNING id, contactId, phone, attempts`,
      )
      .get(campaignId, deviceId) as
      { id: string; contactId: string; phone: string; attempts: number } | undefined
    return row ?? null
  } finally {
    db.close()
  }
}

export async function counters(campaignId: string): Promise<CampaignCounters> {
  const grouped = await getPrisma().campaignRecipient.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  })

  const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]))
  const sent = byStatus.get('sent') ?? 0
  const failed = byStatus.get('failed') ?? 0
  const skipped = byStatus.get('skipped') ?? 0
  const pending = (byStatus.get('pending') ?? 0) + (byStatus.get('sending') ?? 0)

  return { total: sent + failed + skipped + pending, sent, failed, pending }
}

type ProgressListener = (
  campaignId: string,
  counters: CampaignCounters,
  status: CampaignStatus,
) => void

/**
 * Device health breaker (D89).
 *
 * WhatsApp rarely announces a restriction; it shows up as sends that start
 * failing. A device whose recent sends fail at a ban-like rate is paused for an
 * hour rather than allowed to keep hammering — continuing is the surest way to
 * turn a temporary restriction into a permanent ban.
 *
 * Recipient-shaped failures ("not on WhatsApp", "invalid number") say nothing
 * about the account and are not counted.
 */
const HEALTH_WINDOW = 20
const HEALTH_MIN_SAMPLES = 10
const HEALTH_FAIL_RATIO = 0.5
const HEALTH_BLOCK_LIMIT = 3
const HEALTH_PAUSE_MS = 60 * 60_000

const RECIPIENT_FAILURE = /not on whatsapp|invalid number/i
const ACCOUNT_BLOCK = /blocked|forbidden|not-authorized|rate-overlimit|\b429\b/i

class HealthMonitor {
  private readonly outcomes = new Map<string, Array<{ ok: boolean; blocked: boolean }>>()

  /** Record a send outcome; returns a reason when the device should pause. */
  record(deviceId: string, ok: boolean, error?: string): string | null {
    if (!ok && error && RECIPIENT_FAILURE.test(error)) return null
    const list = this.outcomes.get(deviceId) ?? []
    list.push({ ok, blocked: !ok && Boolean(error && ACCOUNT_BLOCK.test(error)) })
    if (list.length > HEALTH_WINDOW) list.shift()
    this.outcomes.set(deviceId, list)

    const blocked = list.filter((o) => o.blocked).length
    if (blocked >= HEALTH_BLOCK_LIMIT) {
      return `${blocked} recent sends were refused as blocked or unauthorized`
    }
    const failed = list.filter((o) => !o.ok).length
    if (list.length >= HEALTH_MIN_SAMPLES && failed / list.length >= HEALTH_FAIL_RATIO) {
      return `${failed} of the last ${list.length} sends failed`
    }
    return null
  }

  reset(deviceId: string): void {
    this.outcomes.delete(deviceId)
  }
}

/**
 * Global cap on how many devices send at once (sending.maxConcurrentDevices).
 * A device already sending for one campaign takes no extra slot for another —
 * its throttle serializes them anyway.
 */
class DeviceSlots {
  private readonly active = new Map<string, number>()
  private waiters: Array<() => void> = []

  async acquire(deviceId: string, signal: AbortSignal): Promise<boolean> {
    for (;;) {
      if (signal.aborted) return false
      const { maxConcurrentDevices } = await readSendingDefaults()
      if (this.active.has(deviceId) || this.active.size < maxConcurrentDevices) {
        this.active.set(deviceId, (this.active.get(deviceId) ?? 0) + 1)
        return true
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve)
        signal.addEventListener('abort', () => resolve(), { once: true })
      })
    }
  }

  release(deviceId: string): void {
    const count = (this.active.get(deviceId) ?? 1) - 1
    if (count <= 0) this.active.delete(deviceId)
    else this.active.set(deviceId, count)
    const woken = this.waiters
    this.waiters = []
    for (const wake of woken) wake()
  }
}

const VERIFY_BATCH = 50

export class CampaignEngine {
  private readonly running = new Map<string, AbortController>()
  private readonly health = new HealthMonitor()
  private readonly slots = new DeviceSlots()
  private progress: ProgressListener | undefined

  onProgress(listener: ProgressListener): void {
    this.progress = listener
  }

  isRunning(campaignId: string): boolean {
    return this.running.has(campaignId)
  }

  /**
   * Expand a campaign's audience into queue rows.
   *
   * Audience = contacts in the selected lists ∪ contacts carrying an included
   * tag, minus contacts carrying an excluded tag (D89).
   *
   * Batched and de-duplicated by phone number. The same person imported into
   * two selected lists is two `Contact` rows with different ids, so the
   * unique(campaignId, contactId) constraint does not catch it — and messaging
   * one number twice in a single campaign is exactly what gets accounts
   * reported. The first contact the number appears on wins.
   *
   * Numbers on the opt-out list — and, when the campaign checks numbers, ones
   * already known not to be on WhatsApp — are queued as `skipped` with the
   * reason, so the report shows why they were not messaged.
   */
  async expand(campaignId: string): Promise<number> {
    const prisma = getPrisma()

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { devices: true, lists: true, tags: true },
    })
    if (!campaign) throw new Error(`campaign ${campaignId} not found`)

    const deviceIds = campaign.devices.map((d) => d.deviceId)
    if (deviceIds.length === 0) throw new Error('campaign has no devices')

    const existing = await prisma.campaignRecipient.count({ where: { campaignId } })
    if (existing > 0) return existing

    const listIds = campaign.lists.map((l) => l.listId)
    const include = campaign.tags.filter((t) => t.mode === 'include').map((t) => t.tagId)
    const exclude = campaign.tags.filter((t) => t.mode === 'exclude').map((t) => t.tagId)
    const sources = [
      ...(listIds.length > 0 ? [{ listId: { in: listIds } }] : []),
      ...(include.length > 0 ? [{ tags: { some: { tagId: { in: include } } } }] : []),
    ]
    if (sources.length === 0) return 0
    const where = {
      isValid: true,
      OR: sources,
      ...(exclude.length > 0
        ? { NOT: { tags: { some: { tagId: { in: exclude } } } } }
        : {}),
    }

    let created = 0
    let cursor: string | undefined
    let index = 0
    // NOTE: spans every batch. Phones are E.164-normalized on import, so string
    // equality is number equality. ~50k strings is a few MB, well within budget.
    const seenPhones = new Set<string>()

    for (;;) {
      const contacts = await prisma.contact.findMany({
        where,
        orderBy: { id: 'asc' },
        take: 1_000,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })
      if (contacts.length === 0) break

      const fresh = contacts.filter((contact) => {
        if (seenPhones.has(contact.phone)) return false
        seenPhones.add(contact.phone)
        return true
      })
      const suppressed = await suppressedPhones(fresh.map((c) => c.phone))

      // Round-robin across devices so no single account carries the run.
      // Assigned after de-duplication so dropped rows do not skew the split.
      const rows = fresh.map((contact) => {
        const skipReason = suppressed.has(contact.phone)
          ? 'Opted out'
          : campaign.checkNumbers && contact.waStatus === 'invalid'
            ? 'Not on WhatsApp'
            : null
        return {
          campaignId,
          contactId: contact.id,
          deviceId: deviceIds[index++ % deviceIds.length]!,
          phone: contact.phone,
          ...(skipReason ? { status: 'skipped', error: skipReason } : {}),
        }
      })

      if (rows.length > 0) {
        const result = await prisma.campaignRecipient.createMany({ data: rows })
        created += result.count
      }
      cursor = contacts[contacts.length - 1]?.id
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { totalCount: created },
    })
    return created
  }

  async start(campaignId: string): Promise<void> {
    if (this.running.has(campaignId)) return

    // NOTE: the slot is claimed before the first await. Boot recovery,
    // wa-service recovery and the scheduler tick can all call start() for the
    // same campaign; claiming it only after setup let two of them through the
    // guard and launch a second set of workers.
    const controller = new AbortController()
    this.running.set(campaignId, controller)

    const prisma = getPrisma()
    let campaign
    try {
      await this.expand(campaignId)

      campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { devices: true, template: true },
      })
      if (!campaign) throw new Error(`campaign ${campaignId} not found`)
    } catch (err) {
      this.running.delete(campaignId)
      throw err
    }

    // Paused or stopped while being set up: leave the status they wrote.
    if (controller.signal.aborted) return

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'running', startedAt: campaign.startedAt ?? new Date() },
    })

    // Pacing is per device and comes from the campaign, layered on the base
    // policy (cap, warmup, quiet hours, typing), before any worker starts.
    for (const link of campaign.devices) {
      await applyDevicePolicy(link.deviceId, campaign)
    }

    // One worker per device, running concurrently. Pacing inside wa-service
    // keeps each individual account sequential.
    const workers = campaign.devices.map((link) =>
      this.work(campaignId, link.deviceId, campaign.retryAttempts, controller.signal),
    )

    void Promise.all(workers)
      .then(() => this.finish(campaignId))
      .catch((err: unknown) => {
        console.error(`campaign ${campaignId} worker failed`, err)
        return this.finish(campaignId)
      })
  }

  private async work(
    campaignId: string,
    deviceId: string,
    retryAttempts: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (!(await this.slots.acquire(deviceId, signal))) return
    try {
      await this.drain(campaignId, deviceId, retryAttempts, signal)
    } finally {
      this.slots.release(deviceId)
    }
  }

  /** True when the device's health breaker has it paused right now. */
  private async healthPaused(deviceId: string): Promise<boolean> {
    const device = await getPrisma().device.findUnique({
      where: { id: deviceId },
      select: { healthPausedUntil: true },
    })
    return Boolean(device?.healthPausedUntil && device.healthPausedUntil > new Date())
  }

  private async tripHealth(deviceId: string, reason: string): Promise<void> {
    const { healthBreaker } = await readSendingDefaults()
    if (!healthBreaker) return
    const until = new Date(Date.now() + HEALTH_PAUSE_MS)
    const device = await getPrisma().device.update({
      where: { id: deviceId },
      data: { healthPausedUntil: until, healthReason: reason },
    })
    this.health.reset(deviceId)
    console.warn(
      `health breaker: paused ${deviceId} until ${until.toISOString()} — ${reason}`,
    )
    toast(
      'warning',
      `Paused "${device.name}" for an hour to protect the account: ${reason}. Its campaigns resume automatically.`,
    )
    notify('device:updated', { deviceId })
  }

  /**
   * Check the next batch of this device's pending recipients whose number has
   * never been checked, and skip the ones not on WhatsApp. Done in batches of 50
   * just ahead of sending, so a large campaign never does one big up-front scan.
   */
  private async verifyAhead(campaignId: string, deviceId: string): Promise<void> {
    const prisma = getPrisma()
    const batch = await prisma.campaignRecipient.findMany({
      where: {
        campaignId,
        deviceId,
        status: 'pending',
        contact: { waStatus: 'unknown' },
      },
      select: { id: true, phone: true, contactId: true },
      orderBy: { id: 'asc' },
      take: VERIFY_BATCH,
    })
    if (batch.length === 0) return

    const { results } = await waBridge.request('number:check', {
      deviceId,
      phones: batch.map((r) => r.phone),
    })
    const exists = new Map(results.map((r) => [r.phone, r.exists]))
    const now = new Date()
    const valid = batch.filter((r) => exists.get(r.phone) === true)
    const invalid = batch.filter((r) => exists.get(r.phone) === false)

    await prisma.$transaction([
      prisma.contact.updateMany({
        where: { id: { in: valid.map((r) => r.contactId) } },
        data: { waStatus: 'valid', waCheckedAt: now },
      }),
      prisma.contact.updateMany({
        where: { id: { in: invalid.map((r) => r.contactId) } },
        data: { waStatus: 'invalid', waCheckedAt: now },
      }),
      prisma.campaignRecipient.updateMany({
        where: { id: { in: invalid.map((r) => r.id) }, status: 'pending' },
        data: { status: 'skipped', error: 'Not on WhatsApp' },
      }),
    ])
  }

  private async drain(
    campaignId: string,
    deviceId: string,
    retryAttempts: number,
    signal: AbortSignal,
  ): Promise<void> {
    const prisma = getPrisma()
    let sinceEmit = 0
    let lastVerify = 0

    if (await this.healthPaused(deviceId)) return

    while (!signal.aborted) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { template: true },
      })
      if (!campaign) return

      if (campaign.checkNumbers && Date.now() - lastVerify > 1_000) {
        lastVerify = Date.now()
        try {
          await this.verifyAhead(campaignId, deviceId)
        } catch (err) {
          // A failed check is not a reason to stop sending: the number stays
          // "unknown" and is tried normally.
          console.warn(`number check failed on ${deviceId}`, err)
        }
      }

      const claimed = claimNext(campaignId, deviceId)
      if (!claimed) return

      // Opt-outs can arrive mid-campaign, after the queue was built.
      if ((await suppressedPhones([claimed.phone])).size > 0) {
        await prisma.campaignRecipient.update({
          where: { id: claimed.id },
          data: { status: 'skipped', error: 'Opted out' },
        })
        continue
      }

      const contact = await prisma.contact.findUnique({
        where: { id: claimed.contactId },
      })
      const values = contact ? mergeValues(contact) : {}

      try {
        const { messageId } = await waBridge.request('message:send', {
          deviceId,
          to: claimed.phone,
          message: buildTemplateMessage(campaign.template, values),
        })

        await prisma.campaignRecipient.update({
          where: { id: claimed.id },
          data: { status: 'sent', messageId, sentAt: new Date(), error: null },
        })
        this.health.record(deviceId, true)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)

        if (isParkingError(message)) {
          // WHY no attempt is charged: the message never reached WhatsApp.
          // Counting it as a failure meant a recipient that met the cap on three
          // consecutive days was marked failed without ever being tried.
          await prisma.campaignRecipient.update({
            where: { id: claimed.id },
            data: { status: 'pending', claimedAt: null },
          })
          // Parked until the cap resets or quiet hours end. `runScheduled`
          // restarts the campaign once the device can send again.
          return
        }

        const attempts = claimed.attempts + 1
        const canRetry = attempts <= retryAttempts && isRetryable(message)

        await prisma.campaignRecipient.update({
          where: { id: claimed.id },
          data: {
            // Back to pending so another pass picks it up; the attempt counter
            // is what stops it looping forever.
            status: canRetry ? 'pending' : 'failed',
            attempts,
            error: message,
            ...(canRetry ? {} : { sentAt: new Date() }),
          },
        })

        const trip = this.health.record(deviceId, false, message)
        if (trip) {
          await this.tripHealth(deviceId, trip)
          if (await this.healthPaused(deviceId)) return
        }
      }

      // Batched so a 100k-recipient run cannot flood the renderer.
      sinceEmit += 1
      if (sinceEmit >= 25) {
        sinceEmit = 0
        void this.emit(campaignId)
      }
    }
  }

  private async emit(campaignId: string): Promise<void> {
    const c = await counters(campaignId)
    const row = await getPrisma().campaign.update({
      where: { id: campaignId },
      data: { sentCount: c.sent, failedCount: c.failed, totalCount: c.total },
    })
    this.progress?.(campaignId, c, row.status as CampaignStatus)
  }

  /**
   * Push current counters for a campaign that is not necessarily running —
   * e.g. a delivery or read receipt arriving after it finished, so the card's
   * engagement numbers update without the renderer polling.
   */
  async publish(campaignId: string): Promise<void> {
    const row = await getPrisma().campaign.findUnique({ where: { id: campaignId } })
    if (!row) return
    this.progress?.(campaignId, await counters(campaignId), row.status as CampaignStatus)
  }

  private async finish(campaignId: string): Promise<void> {
    this.running.delete(campaignId)
    const c = await counters(campaignId)

    const current = await getPrisma().campaign.findUnique({ where: { id: campaignId } })
    // Pause and stop set their own status; only a genuinely drained queue
    // completes.
    const status =
      current?.status === 'running' && c.pending === 0 ? 'completed' : current?.status

    await getPrisma().campaign.update({
      where: { id: campaignId },
      data: {
        sentCount: c.sent,
        failedCount: c.failed,
        totalCount: c.total,
        ...(status ? { status } : {}),
        ...(status === 'completed' ? { completedAt: new Date() } : {}),
      },
    })
    this.progress?.(campaignId, c, (status ?? 'running') as CampaignStatus)

    if (status === 'completed' && current?.status === 'running') {
      await emitWebhook('campaign.completed', {
        campaignId,
        name: current.name,
        total: c.total,
        sent: c.sent,
        failed: c.failed,
      }).catch((err: unknown) => console.error('campaign.completed webhook failed', err))
    }
  }

  async pause(campaignId: string): Promise<void> {
    this.running.get(campaignId)?.abort()
    this.running.delete(campaignId)
    await getPrisma().campaign.update({
      where: { id: campaignId },
      data: { status: 'paused' },
    })
    // A message already claimed but not yet answered would otherwise stay
    // 'sending' forever.
    await this.releaseClaimed(campaignId)
    await this.emit(campaignId)
  }

  async stop(campaignId: string): Promise<void> {
    this.running.get(campaignId)?.abort()
    this.running.delete(campaignId)
    await this.releaseClaimed(campaignId)
    await getPrisma().campaign.update({
      where: { id: campaignId },
      data: { status: 'completed', completedAt: new Date() },
    })
    await this.emit(campaignId)
  }

  /** Return in-flight claims to the queue. */
  private async releaseClaimed(campaignId: string): Promise<void> {
    await getPrisma().campaignRecipient.updateMany({
      where: { campaignId, status: 'sending' },
      data: { status: 'pending', claimedAt: null },
    })
  }

  /**
   * Crash recovery (SPRINTS.md §6.4). Runs before any worker starts.
   *
   * Anything claimed when the process died is returned to the queue. A message
   * that WhatsApp accepted but whose acknowledgement was never recorded will be
   * sent twice — bounded at one per device per crash, and documented in
   * SPRINTS §6.4 as accepted, because WhatsApp offers no deduplication
   * primitive that would let us do better.
   */
  async recover(): Promise<{ requeued: number; resumed: string[] }> {
    const prisma = getPrisma()

    const requeued = await prisma.campaignRecipient.updateMany({
      where: { status: 'sending' },
      data: { status: 'pending', claimedAt: null },
    })

    const running = await prisma.campaign.findMany({ where: { status: 'running' } })
    for (const campaign of running) {
      const c = await counters(campaign.id)
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { sentCount: c.sent, failedCount: c.failed, totalCount: c.total },
      })
    }

    // Scheduled campaigns whose time passed while the app was closed.
    const due = await prisma.campaign.findMany({
      where: { status: 'scheduled', scheduledAt: { lte: new Date() } },
    })

    const resumed: string[] = []
    for (const campaign of [...running, ...due]) {
      try {
        await this.start(campaign.id)
        resumed.push(campaign.id)
      } catch (err) {
        console.error(`recovery: could not resume campaign ${campaign.id}`, err)
      }
    }

    // Campaigns already running in this process are skipped by `start()`, so
    // their pacing would never be re-sent. See `reconfigureRunning`.
    await this.reconfigureRunning()

    return { requeued: requeued.count, resumed }
  }

  /**
   * Re-send pacing for every campaign this process still considers running.
   *
   * WHY this is separate from `start()`: recovery runs after wa-service is
   * restarted, but wa-service crashing does not stop the *main* process, so
   * `this.running` still holds those campaigns and `start()` returns at its
   * already-running guard before reaching the throttle setup. Meanwhile the
   * restarted wa-service built a brand-new scheduler whose devices fall back to
   * `DEFAULT_THROTTLE` — no daily cap and generic delays. The anti-ban pacing
   * the user configured would silently disappear for the rest of the run, on
   * the single most likely production event.
   */
  async reconfigureRunning(): Promise<void> {
    const prisma = getPrisma()
    for (const campaignId of this.running.keys()) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { devices: true },
      })
      if (!campaign) continue
      for (const link of campaign.devices) {
        await applyDevicePolicy(link.deviceId, campaign)
      }
    }
  }

  /**
   * Move a disconnected device's pending recipients to devices that are still
   * connected (SPRINTS.md §11.1 T3.4).
   *
   * Without this, one dropped account strands its whole slice of the queue
   * until it reconnects — a 10k campaign with five devices would silently stall
   * at 80% and look finished. Only `pending` rows move: anything already sent
   * or in flight belongs to the device that handled it.
   *
   * If no device remains, the campaign pauses with a reason rather than
   * spinning against sockets that cannot send.
   */
  async reassignFrom(deviceId: string): Promise<{ moved: number; paused: string[] }> {
    const prisma = getPrisma()

    const affected = await prisma.campaign.findMany({
      where: { status: 'running', devices: { some: { deviceId } } },
      include: { devices: true },
    })

    let moved = 0
    const paused: string[] = []

    for (const campaign of affected) {
      const others = await prisma.device.findMany({
        where: {
          id: { in: campaign.devices.map((d) => d.deviceId), not: deviceId },
          status: 'connected',
        },
      })

      const pending = await prisma.campaignRecipient.count({
        where: { campaignId: campaign.id, deviceId, status: 'pending' },
      })
      if (pending === 0) continue

      if (others.length === 0) {
        await this.pause(campaign.id)
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { lastError: 'Paused: no connected device is available to send.' },
        })
        paused.push(campaign.id)
        continue
      }

      // Spread the orphaned rows evenly rather than dumping them on one device.
      const rows = await prisma.campaignRecipient.findMany({
        where: { campaignId: campaign.id, deviceId, status: 'pending' },
        select: { id: true },
      })

      await prisma.$transaction(
        rows.map((row, i) =>
          prisma.campaignRecipient.update({
            where: { id: row.id },
            data: { deviceId: others[i % others.length]!.id },
          }),
        ),
      )
      moved += rows.length
    }

    return { moved, paused }
  }

  /**
   * Start any scheduled campaign whose time has arrived.
   *
   * Compares against the wall clock rather than a monotonic timer, so a laptop
   * that slept through a scheduled time still fires on wake instead of silently
   * skipping it.
   */
  async runScheduled(): Promise<string[]> {
    const due = await getPrisma().campaign.findMany({
      where: { status: 'scheduled', scheduledAt: { lte: new Date() } },
    })
    const parked = await this.parkedWithHeadroom()

    const started: string[] = []
    for (const campaign of [...due, ...parked]) {
      if (this.running.has(campaign.id)) continue
      try {
        await this.start(campaign.id)
        started.push(campaign.id)
      } catch (err) {
        console.error(`scheduler: could not start campaign ${campaign.id}`, err)
        await getPrisma().campaign.update({
          where: { id: campaign.id },
          data: { status: 'failed', lastError: String(err) },
        })
      }
    }
    return started
  }

  /**
   * Parked campaigns whose devices can send again.
   *
   * A campaign is parked when it is `running` in the database, has no workers
   * in this process, and still has pending rows — every worker returned because
   * its device hit the cap, quiet hours began, or the health breaker paused it. WHY this is derived from SQLite rather than tracked
   * in memory: it survives a restart for free, and pause/stop need no extra
   * bookkeeping because they change the status.
   *
   * Without this, a capped campaign sat at `running` forever and only resumed
   * if the user happened to restart the app.
   */
  private async parkedWithHeadroom(): Promise<Array<{ id: string }>> {
    const prisma = getPrisma()
    const candidates = await prisma.campaign.findMany({
      where: { status: 'running', id: { notIn: [...this.running.keys()] } },
      select: { id: true },
      take: 100,
    })
    if (candidates.length === 0) return []

    const defaults = await readSendingDefaults()
    // Nothing automated can send in quiet hours; restarting now would only park
    // again on the first claim.
    if (inQuietHours(quietWindow(defaults))) return []

    const now = new Date()
    const ready: Array<{ id: string }> = []
    for (const campaign of candidates) {
      const waiting = await prisma.campaignRecipient.findMany({
        where: { campaignId: campaign.id, status: 'pending' },
        distinct: ['deviceId'],
        select: {
          device: {
            select: {
              dailySentCount: true,
              dailyCountResetAt: true,
              warmupEnabled: true,
              warmupStartedAt: true,
              healthPausedUntil: true,
            },
          },
        },
        take: 20,
      })
      const hasHeadroom = waiting.some(({ device }) => {
        if (device.healthPausedUntil && device.healthPausedUntil > now) return false
        const cap = effectiveCap(defaults.dailyCapPerDevice, device)
        return (
          cap === 0 || isStaleDay(device.dailyCountResetAt) || device.dailySentCount < cap
        )
      })
      if (hasHeadroom) ready.push(campaign)
    }
    return ready
  }

  async shutdown(): Promise<void> {
    for (const controller of this.running.values()) controller.abort()
    this.running.clear()
  }
}

export const campaignEngine = new CampaignEngine()
