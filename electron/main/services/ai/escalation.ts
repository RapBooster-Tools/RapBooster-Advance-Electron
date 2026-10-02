/**
 * Handing a conversation from the bot to a person (D89).
 *
 * Three triggers are enforced:
 *   - keywords — the customer said something only a person should handle
 *   - messages — the bot has answered N times and the chat is still going
 *   - time     — the conversation has run for N minutes
 * The prototype's confidence threshold is not: no provider returns a
 * confidence score (REQUIREMENTS §5, assumption A13).
 *
 * WHY counts start at `escalatedAt`: `chat:resumeBot` hands a chat back without
 * erasing its history. Counting from the very first message would re-escalate
 * it on the next message, so after a hand-back the bot gets a fresh window.
 */
import { getPrisma } from '../../db/client'
import { isParkingError } from '../sending-policy'
import type { BotSettings } from './ai-config'
import { sendBotText } from './bot-send'
import { shouldEscalate } from './prompt'

export type EscalationTrigger = 'keywords' | 'messages' | 'time'

export async function escalationTrigger(
  chat: { id: string; escalatedAt: Date | null },
  bodies: string[],
  settings: BotSettings,
): Promise<EscalationTrigger | null> {
  if (bodies.some((b) => shouldEscalate(b, settings))) return 'keywords'

  const since = chat.escalatedAt ? { gt: chat.escalatedAt } : undefined
  const prisma = getPrisma()

  if (settings.escalationTrigger === 'messages' && settings.escalateAfterMessages > 0) {
    const botReplies = await prisma.message.count({
      where: { chatId: chat.id, isAiReply: true, ...(since ? { timestamp: since } : {}) },
    })
    if (botReplies >= settings.escalateAfterMessages) return 'messages'
  }

  if (settings.escalationTrigger === 'time' && settings.escalateAfterMinutes > 0) {
    const first = await prisma.message.findFirst({
      where: { chatId: chat.id, ...(since ? { timestamp: since } : {}) },
      orderBy: { timestamp: 'asc' },
      select: { timestamp: true },
    })
    const ageMs = first ? Date.now() - first.timestamp.getTime() : 0
    if (ageMs >= settings.escalateAfterMinutes * 60_000) return 'time'
  }

  return null
}

export type EscalationResult = { ok: true } | { ok: false; message: string }

/**
 * Mark the chat as owned by a person and, when configured, tell the customer.
 *
 * The notice shares `escalatedAt` as its timestamp so the "messages" trigger,
 * which counts bot replies strictly after that instant, does not count it.
 */
export async function escalate(
  deviceId: string,
  chatId: string,
  settings: BotSettings,
): Promise<EscalationResult> {
  const at = new Date()
  await getPrisma().chat.update({
    where: { id: chatId },
    data: { isEscalated: true, escalatedAt: at },
  })

  const notice = settings.escalationMessage?.trim()
  if (!notice) return { ok: true }

  try {
    await sendBotText(deviceId, chatId, notice, { at })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isParkingError(message)) {
      // Not held for later: a held reply is discarded once its chat is
      // escalated, and by morning a person owns the conversation anyway.
      console.info('ai: escalation notice not sent, the device is parked')
      return { ok: true }
    }
    return {
      ok: false,
      message: `Escalated for a human reply, but the escalation message could not be sent: ${message}`,
    }
  }
}
