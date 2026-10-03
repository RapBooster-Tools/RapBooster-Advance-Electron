/**
 * AI replies that did not go straight out (D89):
 *
 *   - `pending_approval` — approve-before-send is on; a person approves, edits
 *     or discards it in the inbox.
 *   - `held` — the throttle parked the send (the daily cap; quiet hours no
 *     longer hold bot replies, D152);
 *     `heldDraftTick` sends it once the condition lifts.
 *
 * Drafts live in SQLite, so a restart loses none of them (CLAUDE.md §2.6).
 */
import { AppError } from '../../../../shared/errors'
import type { IpcResponse } from '../../../../shared/ipc'
import { getPrisma } from '../../db/client'
import { chatE164 } from '../../ipc/chat.ipc'
import { notify } from '../notify'
import { isSuppressed } from '../optout'
import { isParkingError } from '../sending-policy'
import { sendBotText } from './bot-send'

type DraftView = IpcResponse<'aiDraft:list'>[number]

const OPEN = ['pending_approval', 'held']

/**
 * A held reply older than this is stale: the customer has moved on, and an
 * answer to yesterday's question arriving out of nowhere reads as spam.
 */
const HELD_EXPIRY_MS = 24 * 60 * 60 * 1_000

/** Drafts being sent right now — guards a double-click and a concurrent tick. */
const inFlight = new Set<string>()

export async function createDraft(entry: {
  chatId: string
  deviceId: string
  text: string
  status: 'pending_approval' | 'held'
  reason: string | null
}): Promise<void> {
  await getPrisma().aiDraft.create({ data: entry })
  notify('chat:updated', { chatId: entry.chatId })
}

export async function listDrafts(chatId?: string): Promise<DraftView[]> {
  const rows = await getPrisma().aiDraft.findMany({
    where: { status: { in: OPEN }, ...(chatId ? { chatId } : {}) },
    orderBy: { createdAt: 'asc' },
    include: { chat: { select: { name: true } } },
    take: 200,
  })
  return rows.map((r) => ({
    id: r.id,
    chatId: r.chatId,
    chatName: r.chat.name,
    deviceId: r.deviceId,
    text: r.text,
    status: r.status as DraftView['status'],
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }))
}

async function openDraft(id: string) {
  const draft = await getPrisma().aiDraft.findUnique({ where: { id } })
  if (!draft)
    throw new AppError('NOT_FOUND', { userMessage: 'That draft no longer exists.' })
  if (!OPEN.includes(draft.status)) {
    throw new AppError('VALIDATION_FAILED', {
      userMessage: 'That draft was already sent or discarded.',
    })
  }
  return draft
}

async function close(
  id: string,
  chatId: string,
  status: 'sent' | 'discarded',
  extra: { reason?: string; text?: string } = {},
): Promise<void> {
  await getPrisma().aiDraft.update({
    where: { id },
    data: { status, decidedAt: new Date(), ...extra },
  })
  notify('chat:updated', { chatId })
}

/** A person approved it (optionally edited): it goes out as their reply. */
export async function approveDraft(id: string, edited?: string): Promise<void> {
  if (inFlight.has(id)) {
    throw new AppError('VALIDATION_FAILED', {
      userMessage: 'That draft is already sending.',
    })
  }
  inFlight.add(id)
  try {
    const draft = await openDraft(id)
    try {
      await sendBotText(draft.deviceId, draft.chatId, edited ?? draft.text, {
        manual: true,
      })
    } catch (err) {
      throw new AppError('SEND_FAILED', {
        detail: err instanceof Error ? err.message : String(err),
      })
    }
    // Keep what was actually sent, not what the model proposed.
    await close(id, draft.chatId, 'sent', edited ? { text: edited } : {})
  } finally {
    inFlight.delete(id)
  }
}

export async function discardDraft(id: string): Promise<void> {
  if (inFlight.has(id)) {
    throw new AppError('VALIDATION_FAILED', {
      userMessage: 'That draft is already sending.',
    })
  }
  const draft = await openDraft(id)
  await close(id, draft.chatId, 'discarded')
}

/**
 * Why a held reply must not go out any more, or null when it still should.
 * Checked at send time because hours may have passed since it was written.
 */
async function staleReason(draft: {
  chatId: string
  createdAt: Date
}): Promise<string | null> {
  if (Date.now() - draft.createdAt.getTime() > HELD_EXPIRY_MS) return 'expired'

  const prisma = getPrisma()
  const chat = await prisma.chat.findUnique({ where: { id: draft.chatId } })
  if (!chat) return 'chat removed'
  if (chat.isEscalated) return 'chat escalated to a human'
  if (chat.autoReplyOptOut) return 'chat opted out of auto-reply'
  if (!chat.isGroup && (await isSuppressed(chatE164(chat.phone))))
    return 'number opted out'

  // Someone already answered by hand while the bot's reply was parked.
  const answered = await prisma.message.count({
    where: {
      chatId: draft.chatId,
      direction: 'out',
      isAiReply: false,
      timestamp: { gt: draft.createdAt },
    },
  })
  return answered > 0 ? 'answered by a person' : null
}

/**
 * Send replies held by the daily cap, once it resets.
 *
 * These are automated sends — no `manual` — so the throttle re-checks the
 * window. A device still parked keeps its drafts held and is skipped for the
 * rest of the tick; the next tick tries again.
 */
export async function heldDraftTick(): Promise<void> {
  const held = await getPrisma().aiDraft.findMany({
    where: { status: 'held' },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })
  const parkedDevices = new Set<string>()

  for (const draft of held) {
    if (parkedDevices.has(draft.deviceId) || inFlight.has(draft.id)) continue

    const stale = await staleReason(draft)
    if (stale) {
      await close(draft.id, draft.chatId, 'discarded', { reason: stale })
      continue
    }

    inFlight.add(draft.id)
    try {
      await sendBotText(draft.deviceId, draft.chatId, draft.text)
      await close(draft.id, draft.chatId, 'sent')
    } catch (err) {
      // Either way this device cannot send right now; its other drafts wait
      // for the next tick rather than each failing the same way.
      parkedDevices.add(draft.deviceId)
      const message = err instanceof Error ? err.message : String(err)
      if (!isParkingError(message)) {
        // Usually a disconnected device. The draft stays held and is retried
        // until it expires.
        console.warn(`ai: held reply ${draft.id} could not be sent yet`, message)
      }
    } finally {
      inFlight.delete(draft.id)
    }
  }
}
