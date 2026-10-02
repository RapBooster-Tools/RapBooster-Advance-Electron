/**
 * Drip sequences: timed follow-ups that stop when the contact replies (D89).
 *
 * The rules mirror the campaign engine's, for the same reasons:
 *
 *   1. Progress lives in `SequenceEnrollment` rows. A restart rebuilds
 *      everything from the database — there is no in-memory queue to lose.
 *   2. A row is claimed with one conditional UPDATE (`active` → `sending`)
 *      immediately before it is sent, so a reply, an unenroll or a pause that
 *      lands between selecting and sending is honoured rather than overwritten.
 *   3. Every send goes through `message:send`, i.e. the wa-service throttle, as
 *      an automated send: it obeys the delay, the daily cap and quiet hours.
 */
import { getPrisma } from '../db/client'
import { sendOne, type DueRow } from './sequence-step'

/** Enrollments claimed per tick. Bounded so one tick never builds a huge backlog. */
const CLAIM_BATCH = 50

/**
 * A row still `sending` after this long was orphaned by a crash.
 *
 * NOTE: at-most-once is not achievable here (SPRINTS.md §6.4, tracker K1). If
 * the process died after WhatsApp accepted the message but before the row was
 * updated, returning it to `active` sends that step again. Each device sends
 * one enrollment at a time, so the exposure is bounded at one duplicate per
 * device per crash — the same accepted limit as campaigns.
 */
const STUCK_AFTER_MS = 10 * 60_000

const E164 = /^\+[1-9]\d{6,14}$/

export function parseDeviceIds(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : []
  } catch (err) {
    // A corrupt column must not stop every other sequence; it reads as "no
    // devices", which the screen shows and the user can fix by editing.
    console.warn('sequences: unreadable deviceIds column', err)
    return []
  }
}

/**
 * Give every waiting enrollment whose device is gone (removed from the
 * sequence, or deleted) one of the sequence's devices. Without this those
 * contacts would wait forever for a device that will never connect.
 */
export async function reassignOrphans(
  sequenceId: string,
  deviceIds: string[],
): Promise<void> {
  const [first] = deviceIds
  if (!first) return
  await getPrisma().sequenceEnrollment.updateMany({
    where: {
      sequenceId,
      status: 'active',
      OR: [{ deviceId: null }, { deviceId: { notIn: deviceIds } }],
    },
    data: { deviceId: first },
  })
}

/** A reply from this number stops every active enrollment with stopOnReply. */
export async function stopOnReply(phone: string): Promise<void> {
  // A LID or other non-phone sender cannot be matched to a contact reliably.
  if (!E164.test(phone)) return
  const { count } = await getPrisma().sequenceEnrollment.updateMany({
    where: {
      phone,
      status: { in: ['active', 'sending'] },
      sequence: { stopOnReply: true },
    },
    data: { status: 'stopped', stoppedReason: 'Replied', nextRunAt: null },
  })
  if (count > 0) console.log(`sequences: ${count} enrollment(s) stopped by a reply`)
}

async function runDue(): Promise<void> {
  const prisma = getPrisma()
  const now = new Date()

  await prisma.sequenceEnrollment.updateMany({
    where: {
      status: 'sending',
      nextRunAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) },
    },
    data: { status: 'active' },
  })

  const sequences = await prisma.sequence.findMany({
    where: { status: 'active' },
    select: {
      id: true,
      name: true,
      deviceIds: true,
      steps: {
        orderBy: { position: 'asc' },
        select: { delayMinutes: true, template: true },
      },
    },
    take: 200,
  })
  if (sequences.length === 0) return

  const devices = await prisma.device.findMany({
    select: { id: true, status: true },
    take: 100,
  })
  const existing = new Set(devices.map((d) => d.id))
  const connected = devices.filter((d) => d.status === 'connected').map((d) => d.id)

  // A deleted device leaves its id behind in the sequence; drop it and move its
  // contacts to a device that still exists.
  for (const sequence of sequences) {
    const ids = parseDeviceIds(sequence.deviceIds)
    const valid = ids.filter((id) => existing.has(id))
    if (valid.length === ids.length || valid.length === 0) continue
    await prisma.sequence.update({
      where: { id: sequence.id },
      data: { deviceIds: JSON.stringify(valid) },
    })
    await reassignOrphans(sequence.id, valid)
  }

  if (connected.length === 0) return

  // Rows on offline devices are left untouched — still `active` and due — so
  // they go out on the first tick after their device reconnects.
  const due = await prisma.sequenceEnrollment.findMany({
    where: {
      status: 'active',
      nextRunAt: { lte: now },
      sequenceId: { in: sequences.map((s) => s.id) },
      deviceId: { in: connected },
    },
    orderBy: { nextRunAt: 'asc' },
    take: CLAIM_BATCH,
    select: {
      id: true,
      sequenceId: true,
      contactId: true,
      phone: true,
      deviceId: true,
      nextStep: true,
      nextRunAt: true,
    },
  })
  if (due.length === 0) return

  const byId = new Map(sequences.map((s) => [s.id, s]))
  const byDevice = new Map<string, DueRow[]>()
  for (const row of due) {
    if (!row.deviceId) continue
    const list = byDevice.get(row.deviceId) ?? []
    list.push({ ...row, deviceId: row.deviceId })
    byDevice.set(row.deviceId, list)
  }

  // Devices run side by side; within a device the rows go one at a time, which
  // is all the throttle would allow anyway (one in-flight message per device).
  await Promise.all(
    [...byDevice.values()].map(async (rows) => {
      for (const row of rows) {
        const sequence = byId.get(row.sequenceId)
        if (!sequence) continue
        // A parked device (cap, quiet hours, offline) will park every later row
        // too — leave them for the next tick instead of trying each one.
        if ((await sendOne(row, sequence)) === 'parked') return
      }
    }),
  )
}

let inFlight: Promise<void> | undefined

/**
 * Send every enrollment step that is due. Called by the scheduler.
 *
 * WHY it does not await the sends: a batch can take minutes to pace out, and
 * the scheduler runs its jobs one after another — awaiting here would hold up
 * scheduled campaigns, posts and webhook retries for that long. The guard
 * keeps a single run at a time, so a slow batch is never claimed twice.
 */
export async function sequenceTick(): Promise<void> {
  if (inFlight) return
  inFlight = runDue()
    .catch((err: unknown) => console.error('sequences: tick failed', err))
    .finally(() => {
      inFlight = undefined
    })
}
