/**
 * One-off messages written in the inbox and sent later (Wave 3).
 *
 * The rules mirror sequences.ts, for the same reasons:
 *
 *   1. State lives in `ScheduledMessage` rows; a restart rebuilds from SQLite.
 *   2. A row is claimed with one conditional UPDATE (`scheduled` → `sending`)
 *      immediately before it is sent, so a Cancel that lands first wins.
 *   3. The send is automated, not typed: it goes through `message:send` without
 *      `manual`, so it obeys the delay, the daily cap and quiet hours. A parked
 *      send returns to `scheduled` and is retried on a later tick.
 */
import { rmSync } from 'node:fs'
import type { WaOutgoing } from '../../../shared/wa-protocol'
import { getPrisma } from '../db/client'
import { chatE164, persistOutgoing } from '../ipc/chat.ipc'
import { waBridge } from '../wa-bridge'
import { notify } from './notify'
import { isSuppressed } from './optout'
import { scheduledAttachment } from './scheduled-media'
import { isParkingError } from './sending-policy'

/** Rows claimed per tick, so a backlog after a long sleep paces out over ticks. */
const CLAIM_BATCH = 50

/** Failed rows stay visible above the composer this long, so the reason is seen. */
const SHOW_FAILED_FOR_MS = 7 * 86_400_000

const MAX_LISTED = 200

export const OPTED_OUT_REASON =
  'Not sent: this contact has opted out of messages from you.'

interface ScheduledRow {
  id: string
  chatId: string
  body: string
  mediaPath: string | null
  sendAt: Date
  status: string
  error: string | null
  sentAt: Date | null
}

export function serializeScheduled(row: ScheduledRow) {
  return {
    id: row.id,
    chatId: row.chatId,
    body: row.body,
    mediaPath: row.mediaPath,
    sendAt: row.sendAt.toISOString(),
    status: row.status as 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled',
    error: row.error,
    sentAt: row.sentAt?.toISOString() ?? null,
  }
}

/** Waiting and in-flight rows, plus recent failures so their reason is seen. */
export async function listScheduled(chatId?: string) {
  const rows = await getPrisma().scheduledMessage.findMany({
    where: {
      ...(chatId ? { chatId } : {}),
      OR: [
        { status: { in: ['scheduled', 'sending'] } },
        {
          status: 'failed',
          sendAt: { gte: new Date(Date.now() - SHOW_FAILED_FOR_MS) },
        },
      ],
    },
    orderBy: { sendAt: 'asc' },
    take: MAX_LISTED,
  })
  return rows.map(serializeScheduled)
}

/** Errors that mean the message never left this machine: retry, do not fail. */
function notSent(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('not connected') || lower.includes('wa-service is not running')
}

type Outcome = 'done' | 'parked'

interface DueRow extends ScheduledRow {
  chat: { deviceId: string; phone: string; isGroup: boolean }
}

async function finish(
  row: DueRow,
  data: { status: 'scheduled' | 'failed'; error?: string },
): Promise<void> {
  await getPrisma().scheduledMessage.updateMany({
    where: { id: row.id, status: 'sending' },
    data: { status: data.status, error: data.error ?? null },
  })
  notify('scheduledMessage:changed', { chatId: row.chatId })
}

function outgoing(row: DueRow): WaOutgoing {
  if (!row.mediaPath) return { kind: 'text', body: row.body }
  const caption = row.body === '' ? undefined : row.body
  const attachment = scheduledAttachment(row.mediaPath)
  return attachment.kind === 'document'
    ? { kind: 'document', path: row.mediaPath, fileName: attachment.fileName, caption }
    : { kind: 'media', path: row.mediaPath, mediaType: attachment.kind, caption }
}

async function sendOne(row: DueRow): Promise<Outcome> {
  const prisma = getPrisma()
  const claimed = await prisma.scheduledMessage.updateMany({
    where: { id: row.id, status: 'scheduled' },
    data: { status: 'sending' },
  })
  if (claimed.count === 0) return 'done'
  notify('scheduledMessage:changed', { chatId: row.chatId })

  if (!row.chat.isGroup && (await isSuppressed(chatE164(row.chat.phone)))) {
    await finish(row, { status: 'failed', error: OPTED_OUT_REASON })
    return 'done'
  }

  const message = outgoing(row)
  let messageId: string
  try {
    // The user chose this time, so quiet hours do not move it (D152); the
    // daily cap and opt-outs still apply.
    const result = await waBridge.request('message:send', {
      deviceId: row.chat.deviceId,
      to: row.chatId,
      message,
      quietHoursExempt: true,
    })
    messageId = result.messageId
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    if (isParkingError(detail) || notSent(detail)) {
      // Daily cap, quiet hours or a dropped device: nothing reached WhatsApp.
      await finish(row, { status: 'scheduled' })
      return 'parked'
    }
    console.warn(`scheduled: message ${row.id} failed`, detail)
    await finish(row, { status: 'failed', error: `Not sent: ${detail.slice(0, 300)}` })
    return 'done'
  }

  // Marked sent before anything else: if a later step throws, the row must not
  // stay `sending`, or the next start would send it a second time.
  await prisma.scheduledMessage.updateMany({
    where: { id: row.id, status: 'sending' },
    data: { status: 'sent', messageId, sentAt: new Date(), error: null },
  })
  notify('scheduledMessage:changed', { chatId: row.chatId })

  const attachment = row.mediaPath ? scheduledAttachment(row.mediaPath) : null
  try {
    const saved = await persistOutgoing(row.chatId, {
      id: messageId,
      type: !attachment
        ? 'text'
        : attachment.kind === 'document'
          ? 'attachment'
          : 'media',
      body: row.body === '' ? null : row.body,
      mediaPath: row.mediaPath,
      fileName: attachment?.fileName ?? null,
      preview: row.body !== '' ? row.body : (attachment?.preview ?? ''),
    })
    notify('message:received', { chatId: row.chatId, message: saved })
  } catch (err) {
    // The message did go out; only the inbox copy is missing.
    console.error(`scheduled: sent ${row.id} but could not store it in the chat`, err)
  }
  return 'done'
}

let recovered = false

async function runDue(): Promise<void> {
  const prisma = getPrisma()

  if (!recovered) {
    // NOTE: only the previous process can have left a row `sending`, so this
    // runs once, before this process claims anything. If WhatsApp accepted the
    // message just before a crash it goes out again — the same bounded
    // duplicate-per-crash the campaign engine accepts (SPRINTS.md §6.4).
    const { count } = await prisma.scheduledMessage.updateMany({
      where: { status: 'sending' },
      data: { status: 'scheduled' },
    })
    recovered = true
    if (count > 0) console.warn(`scheduled: ${count} interrupted message(s) requeued`)
  }

  const devices = await prisma.device.findMany({
    where: { status: 'connected' },
    select: { id: true },
    take: 100,
  })
  if (devices.length === 0) return

  // Rows on offline devices stay `scheduled` and due, so they go out on the
  // first tick after their device reconnects.
  const due: DueRow[] = await prisma.scheduledMessage.findMany({
    where: {
      status: 'scheduled',
      sendAt: { lte: new Date() },
      chat: { deviceId: { in: devices.map((d) => d.id) } },
    },
    orderBy: { sendAt: 'asc' },
    take: CLAIM_BATCH,
    include: { chat: { select: { deviceId: true, phone: true, isGroup: true } } },
  })
  if (due.length === 0) return

  const byDevice = new Map<string, DueRow[]>()
  for (const row of due) {
    const list = byDevice.get(row.chat.deviceId) ?? []
    list.push(row)
    byDevice.set(row.chat.deviceId, list)
  }

  // Devices side by side; one message at a time per device, which is all the
  // throttle allows anyway.
  await Promise.all(
    [...byDevice.values()].map(async (rows) => {
      for (const row of rows) {
        if ((await sendOne(row)) === 'parked') return
      }
    }),
  )
}

let inFlight: Promise<void> | undefined

/**
 * Send scheduled messages whose time has come. Called by the scheduler.
 *
 * WHY it does not await the sends: the throttle may pace a batch over minutes,
 * and the scheduler runs its jobs one after another. The guard keeps a single
 * run at a time, so a slow batch is never claimed twice.
 */
export async function scheduledMessageTick(): Promise<void> {
  if (inFlight) return
  inFlight = runDue()
    .catch((err: unknown) => console.error('scheduled: tick failed', err))
    .finally(() => {
      inFlight = undefined
    })
}

/** Remove a cancelled message's stored copy of its attachment. */
export function discardAttachment(path: string | null): void {
  if (path) rmSync(path, { force: true })
}
