/**
 * The AI auto-responder (SPRINTS.md §12.1 T4.2, extended by D89).
 *
 * Hard rules, enforced here rather than trusted to configuration:
 *   - never reply in a group
 *   - never reply to a chat the user opted out of, or a number on the opt-out list
 *   - never reply to our own outbound message
 *   - never reply to a chat escalated to a human, until the user hands it back
 *   - never exceed the daily AI caps
 *   - never reply when the key is missing — and say why, loudly
 *
 * Every failure mode is distinct and surfaced. A silent no-op would leave the
 * user believing auto-reply is working when it is not, which is worse than an
 * error they can act on.
 */
import { AppError } from '../../../../shared/errors'
import type { AiProvider } from '../../../../shared/types'
import { getPrisma } from '../../db/client'
import { chatE164 } from '../../ipc/chat.ipc'
import { isSuppressed } from '../optout'
import { isParkingError } from '../sending-policy'
import {
  DEFAULT_MODEL,
  PROVIDER_LABEL,
  getAiConfig,
  loadBotSettings,
  readKey,
  type AiConfig,
} from './ai-config'
import { sendBotText } from './bot-send'
import { release, takeTicket, waitForQuiet } from './coalesce'
import { createDraft } from './drafts'
import { escalate, escalationTrigger } from './escalation'
import { buildSystemPrompt, type HistoryMessage } from './prompt'
import { complete, probeKey } from './providers'
import { capReached, recordUsage, toastCapOnce } from './usage'

export { DEFAULT_MODEL }

export async function testKey(
  candidate?: string,
  provider?: AiProvider,
): Promise<{ valid: boolean; detail: string | null }> {
  const config = await getAiConfig()
  const which = provider ?? config.provider
  const key = candidate?.trim() || (await readKey(which))
  // A local OpenAI-compatible server may legitimately run without a key.
  if (!key && which !== 'compatible') {
    return {
      valid: false,
      detail: `No API key is configured for ${PROVIDER_LABEL[which]}.`,
    }
  }
  if (which === 'compatible' && !config.baseUrl) {
    return { valid: false, detail: 'Save a base URL for the compatible endpoint first.' }
  }

  try {
    await probeKey(which, key, config.baseUrl)
    return { valid: true, detail: null }
  } catch (err) {
    return {
      valid: false,
      detail: err instanceof AppError ? err.userMessage : 'The key could not be checked.',
    }
  }
}

export type ReplyOutcome =
  | { kind: 'replied'; text: string }
  | { kind: 'drafted'; status: 'pending_approval' | 'held' }
  | { kind: 'escalated' }
  | { kind: 'skipped'; reason: string }
  | { kind: 'failed'; code: string; message: string }

/** Why the bot must stay out of this chat right now, or null. */
async function blockedReason(chatId: string): Promise<string | null> {
  const chat = await getPrisma().chat.findUnique({ where: { id: chatId } })
  if (!chat) return 'chat not found'
  if (chat.autoReplyOptOut) return 'chat opted out'
  // WHY escalation is sticky: it means "a human owns this conversation now".
  // `chat:resumeBot` clears it.
  if (chat.isEscalated) return 'chat is escalated to a human'
  if (!chat.isGroup && (await isSuppressed(chatE164(chat.phone)))) {
    return 'number is on the opt-out list'
  }
  return null
}

/**
 * The conversation for the model: recent history in order, the customer's
 * burst at the end, and the burst's bodies on their own for the keyword check.
 */
async function conversation(chatId: string, depth: number) {
  // +1 so a depth of N still includes N messages besides the newest.
  const recent = await getPrisma().message.findMany({
    where: { chatId },
    orderBy: { timestamp: 'desc' },
    select: { direction: true, body: true },
    take: Math.max(1, depth + 1),
  })
  const burst: string[] = []
  for (const m of recent) {
    if (m.direction === 'out') break
    if (m.body && m.body.trim() !== '') burst.push(m.body)
  }
  const turns: HistoryMessage[] = recent
    .reverse()
    .filter((m) => m.body && m.body.trim() !== '')
    .map((m) => ({
      role: m.direction === 'out' ? ('assistant' as const) : ('user' as const),
      content: m.body!,
    }))
  return { turns, burst: burst.reverse() }
}

async function deliver(
  deviceId: string,
  chatId: string,
  text: string,
  config: AiConfig,
): Promise<ReplyOutcome> {
  if (config.approveBeforeSend) {
    await createDraft({
      chatId,
      deviceId,
      text,
      status: 'pending_approval',
      reason: null,
    })
    return { kind: 'drafted', status: 'pending_approval' }
  }
  try {
    await sendBotText(deviceId, chatId, text)
    return { kind: 'replied', text }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isParkingError(message)) {
      // The daily cap: not a failure. The reply waits and `heldDraftTick`
      // sends it once the cap resets. (Quiet hours never hold a bot reply,
      // D152; the check stays for drafts held before that decision.)
      const reason = message.includes('quiet hours') ? 'quiet hours' : 'daily cap reached'
      await createDraft({ chatId, deviceId, text, status: 'held', reason })
      return { kind: 'drafted', status: 'held' }
    }
    return { kind: 'failed', code: 'SEND_FAILED', message }
  }
}

/**
 * Consider replying to one inbound message.
 *
 * Returns an outcome rather than throwing, so the caller can log every branch —
 * "why did it not reply" is the question users actually ask.
 */
export async function maybeReply(
  deviceId: string,
  chatId: string,
  incoming: { id: string; body: string | null; isGroup: boolean },
): Promise<ReplyOutcome> {
  if (!incoming.body || incoming.body.trim() === '') {
    return { kind: 'skipped', reason: 'message has no text' }
  }
  // A bot replying into a group is disruptive and gets accounts reported.
  if (incoming.isGroup) return { kind: 'skipped', reason: 'group chat' }

  const settings = await loadBotSettings()
  if (!settings || !settings.enabled) {
    return { kind: 'skipped', reason: 'auto-reply is disabled' }
  }

  const blocked = await blockedReason(chatId)
  if (blocked) return { kind: 'skipped', reason: blocked }

  const config = await getAiConfig()
  const ticket = takeTicket(chatId)
  try {
    if (!(await waitForQuiet(ticket, config.coalesceSeconds))) {
      return { kind: 'skipped', reason: 'coalesced' }
    }
    // The chat may have been escalated, opted out or answered during the wait.
    const stillBlocked = await blockedReason(chatId)
    if (stillBlocked) return { kind: 'skipped', reason: stillBlocked }

    const { turns, burst } = await conversation(chatId, config.historyDepth)
    // A person replied by hand while the bot was waiting.
    if (burst.length === 0) return { kind: 'skipped', reason: 'already answered' }
    const chat = await getPrisma().chat.findUnique({
      where: { id: chatId },
      select: { id: true, escalatedAt: true },
    })
    if (!chat) return { kind: 'skipped', reason: 'chat not found' }

    const trigger = await escalationTrigger(chat, burst, settings)
    if (trigger) {
      const result = await escalate(deviceId, chatId, settings)
      return result.ok
        ? { kind: 'escalated' }
        : { kind: 'failed', code: 'SEND_FAILED', message: result.message }
    }

    const cap = await capReached(deviceId, chatId, config)
    if (cap) {
      toastCapOnce(deviceId, cap)
      return { kind: 'skipped', reason: `AI daily cap reached (${cap})` }
    }

    const key = await readKey(config.provider)
    if (!key && config.provider !== 'compatible') {
      // Deliberately an error, not a skip: the user configured auto-reply and
      // it is not happening, and they need to know exactly why.
      return {
        kind: 'failed',
        code: 'AI_KEY_MISSING',
        message: `No ${PROVIDER_LABEL[config.provider]} API key is configured. Add one on the AI Bot screen to enable auto-replies.`,
      }
    }

    let text: string
    try {
      const result = await complete({
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl,
        apiKey: key,
        system: buildSystemPrompt(settings),
        turns,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      })
      await recordUsage({
        deviceId,
        chatId,
        provider: config.provider,
        model: config.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      })
      text = result.text
    } catch (err) {
      // `complete` maps every provider failure onto the taxonomy.
      const mapped =
        err instanceof AppError
          ? err
          : new AppError('UNKNOWN', { userMessage: 'The AI request failed.' })
      return { kind: 'failed', code: mapped.code, message: mapped.userMessage }
    }

    // A newer message arrived while the model was thinking: that call will
    // answer with the fuller conversation, so this answer is dropped.
    if (!(await waitForQuiet(ticket, 0))) return { kind: 'skipped', reason: 'coalesced' }
    if (text === '') return { kind: 'skipped', reason: 'model returned nothing' }

    // Human-like pause before replying, as configured.
    if (settings.responseDelay > 0) {
      await new Promise((r) => setTimeout(r, settings.responseDelay * 1_000))
    }
    return await deliver(deviceId, chatId, text, config)
  } finally {
    release(ticket)
  }
}
