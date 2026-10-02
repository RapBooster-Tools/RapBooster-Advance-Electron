/**
 * Sending one due drip-sequence step (D89).
 *
 * Split from sequences.ts, which decides *what* is due; this file owns the
 * claim → send → advance cycle of a single enrollment.
 */
import { getPrisma } from '../db/client'
import { waBridge } from '../wa-bridge'
import { isSuppressed } from './optout'
import { isParkingError, isStaleDay } from './sending-policy'
import { buildTemplateMessage, type TemplateRow } from './template-message'
import { emitWebhook } from './webhooks'

/** Errors that mean the message never left this machine: retry, do not fail. */
function notSent(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('not connected') || lower.includes('wa-service is not running')
}

/** Contact fields as merge-tag values, so `{{Name}}` and custom columns resolve. */
function mergeValues(contact: {
  data: string
  name: string
  phone: string
}): Record<string, string> {
  const values: Record<string, string> = { Name: contact.name, Mobile: contact.phone }
  try {
    const parsed: unknown = JSON.parse(contact.data)
    if (parsed && typeof parsed === 'object') {
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        values[key] = String(value ?? '')
      }
    }
  } catch (err) {
    // The promoted columns still carry the two fields every template uses.
    console.debug('sequences: unreadable contact data, using name and phone', err)
  }
  return values
}

/**
 * Persist the device's daily counter so a restart seeds the throttle with the
 * real number of sends today; otherwise sequence sends would not count toward
 * the cap after a relaunch.
 */
async function bumpDailyCount(deviceId: string): Promise<void> {
  const prisma = getPrisma()
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { dailyCountResetAt: true },
  })
  if (!device) return
  await prisma.device.update({
    where: { id: deviceId },
    data: isStaleDay(device.dailyCountResetAt)
      ? { dailySentCount: 1, dailyCountResetAt: new Date() }
      : { dailySentCount: { increment: 1 } },
  })
}

export interface LoadedSequence {
  id: string
  name: string
  steps: Array<{ delayMinutes: number; template: TemplateRow }>
}

export interface DueRow {
  id: string
  sequenceId: string
  contactId: string
  phone: string
  deviceId: string
  nextStep: number
  nextRunAt: Date | null
}

export type Outcome = 'done' | 'parked'

/** Put a claimed row back exactly as it was, unless something else changed it. */
async function release(row: DueRow): Promise<void> {
  await getPrisma().sequenceEnrollment.updateMany({
    where: { id: row.id, status: 'sending' },
    data: { status: 'active', nextRunAt: row.nextRunAt ?? new Date() },
  })
}

export async function sendOne(row: DueRow, sequence: LoadedSequence): Promise<Outcome> {
  const prisma = getPrisma()

  // NOTE: nextRunAt doubles as the claim time while a row is `sending` — it is
  // what the stuck-row recovery measures against.
  const claimed = await prisma.sequenceEnrollment.updateMany({
    where: { id: row.id, status: 'active', sequence: { status: 'active' } },
    data: { status: 'sending', nextRunAt: new Date() },
  })
  if (claimed.count === 0) return 'done'

  if (await isSuppressed(row.phone)) {
    await prisma.sequenceEnrollment.update({
      where: { id: row.id },
      data: { status: 'stopped', stoppedReason: 'Opted out', nextRunAt: null },
    })
    return 'done'
  }

  const device = await prisma.device.findUnique({
    where: { id: row.deviceId },
    select: { status: true },
  })
  if (device?.status !== 'connected') {
    await release(row)
    return 'parked'
  }

  const step = sequence.steps[row.nextStep]
  if (!step) {
    // The sequence was edited down to fewer steps than this contact had left.
    await prisma.sequenceEnrollment.updateMany({
      where: { id: row.id, status: 'sending' },
      data: { status: 'completed', nextRunAt: null },
    })
    return 'done'
  }

  const contact = await prisma.contact.findUnique({
    where: { id: row.contactId },
    select: { data: true, name: true, phone: true },
  })
  if (!contact) {
    await prisma.sequenceEnrollment.updateMany({
      where: { id: row.id, status: 'sending' },
      data: { status: 'stopped', stoppedReason: 'Contact deleted', nextRunAt: null },
    })
    return 'done'
  }

  try {
    await waBridge.request('message:send', {
      deviceId: row.deviceId,
      to: row.phone,
      message: buildTemplateMessage(step.template, mergeValues(contact)),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isParkingError(message) || notSent(message)) {
      // Daily cap, quiet hours or a dropped device: the message never reached
      // WhatsApp. The same step is retried on a later tick.
      await release(row)
      return 'parked'
    }
    console.warn(`sequences: step ${row.nextStep} failed for ${row.id}`, message)
    await prisma.sequenceEnrollment.updateMany({
      where: { id: row.id, status: 'sending' },
      data: { status: 'failed', stoppedReason: message.slice(0, 500), nextRunAt: null },
    })
    return 'done'
  }

  await bumpDailyCount(row.deviceId)

  const sentAt = new Date()
  const following = sequence.steps[row.nextStep + 1]
  const advanced = await prisma.sequenceEnrollment.updateMany({
    where: { id: row.id, status: 'sending' },
    data: following
      ? {
          status: 'active',
          nextStep: row.nextStep + 1,
          lastSentAt: sentAt,
          nextRunAt: new Date(sentAt.getTime() + following.delayMinutes * 60_000),
        }
      : {
          status: 'completed',
          nextStep: row.nextStep + 1,
          lastSentAt: sentAt,
          nextRunAt: null,
        },
  })

  if (advanced.count === 0) {
    // A reply or unenroll stopped it while the message was in flight. The
    // stop stands; only record that this step did go out.
    await prisma.sequenceEnrollment.update({
      where: { id: row.id },
      data: { nextStep: row.nextStep + 1, lastSentAt: sentAt },
    })
  } else if (!following) {
    await emitWebhook('sequence.completed', {
      sequenceId: sequence.id,
      sequenceName: sequence.name,
      enrollmentId: row.id,
      contactId: row.contactId,
      phone: row.phone,
    })
  }
  return 'done'
}
