/**
 * Rule-based auto-replies, evaluated before the AI bot (D89).
 *
 * Matching, on the message text trimmed, lower-cased and with runs of
 * whitespace collapsed to one space:
 *
 *   - exact        the whole message equals a keyword, ignoring punctuation
 *                  around it — "Price?" matches "price".
 *   - starts_with  the message begins with a keyword followed by a word
 *                  boundary — "price list" matches "price", "priceless" does not.
 *   - contains     a keyword appears as a whole word or phrase anywhere —
 *                  "what is the price?" matches "price", "spices" does not
 *                  match "price".
 *
 * NOTE: whole-word matching for `contains` and `starts_with` is deliberate. A
 * plain substring test answers "I despise this" with a rule for "spi", and an
 * automated reply that obviously misread the customer is worse than none. A
 * boundary is any character that is not a Unicode letter or digit, so the rule
 * works the same for Hindi, Arabic or Latin text.
 *
 * WHY a matched rule that does not send still returns true (cooldown, a
 * suppressed number, quiet hours, a failed send): the user wrote a fixed answer
 * for this question, and an AI improvising a different one in its place is
 * exactly what a keyword rule exists to prevent.
 */
import type { WaOutgoing } from '../../../shared/wa-protocol'
import type { MessageType } from '../../../shared/types'
import { getPrisma } from '../db/client'
import { waBridge } from '../wa-bridge'
import type { InboundContext } from './inbound'
import { notify, toast } from './notify'
import { isSuppressed } from './optout'
import { isParkingError, readSendingDefaults } from './sending-policy'
import { buildTemplateMessage } from './template-message'

/** Enough for any real rule set; bounds the query (CLAUDE.md §5.3). */
const MAX_RULES = 500

export interface MatchableRule {
  id: string
  keywords: string
  matchType: string
  deviceIds: string
}

export function parseStringArray(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : []
  } catch (err) {
    // A corrupt column degrades to "no values" rather than breaking the inbox.
    console.debug('keyword-rules: unreadable JSON array column', err)
    return []
  }
}

export function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/gu, ' ')
}

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu
const BOUNDARY = '[^\\p{L}\\p{N}]'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Does `text` (already normalized) trigger `keyword` under `matchType`? */
export function keywordMatches(
  text: string,
  keyword: string,
  matchType: string,
): boolean {
  const key = normalizeText(keyword)
  if (key === '') return false
  if (matchType === 'exact') {
    return text === key || text.replace(EDGE_PUNCTUATION, '') === key
  }
  const escaped = escapeRegExp(key)
  const pattern =
    matchType === 'starts_with'
      ? `^${escaped}(?=$|${BOUNDARY})`
      : `(?:^|${BOUNDARY})${escaped}(?=$|${BOUNDARY})`
  return new RegExp(pattern, 'u').test(text)
}

/** The first rule, in the given order, that answers `text` on `deviceId`. */
export function findMatchingRule<R extends MatchableRule>(
  rules: R[],
  text: string,
  deviceId: string | undefined,
): R | null {
  const normalized = normalizeText(text)
  if (normalized === '') return null
  for (const rule of rules) {
    const devices = parseStringArray(rule.deviceIds)
    if (deviceId && devices.length > 0 && !devices.includes(deviceId)) continue
    const keywords = parseStringArray(rule.keywords)
    if (keywords.some((k) => keywordMatches(normalized, k, rule.matchType))) return rule
  }
  return null
}

/** Enabled rules in evaluation order: priority high to low, then oldest first. */
export function loadActiveRules() {
  return getPrisma().keywordRule.findMany({
    where: { enabled: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: MAX_RULES,
    include: { template: true },
  })
}

type ActiveRule = Awaited<ReturnType<typeof loadActiveRules>>[number]

/** The wire message a rule sends, or null when it has nothing to send. */
export function ruleMessage(
  rule: ActiveRule,
  values: Record<string, string>,
): WaOutgoing | null {
  const text = rule.replyText?.trim()
  if (text) return { kind: 'text', body: text }
  if (rule.template) return buildTemplateMessage(rule.template, values)
  return null
}

/** The text a rule's reply shows, for previews and the inbox. */
export function messagePreview(message: WaOutgoing): string | null {
  if ('body' in message && typeof message.body === 'string') return message.body
  if ('caption' in message) return message.caption ?? null
  return null
}

function storedType(message: WaOutgoing): MessageType {
  if (message.kind === 'media') return 'media'
  if (message.kind === 'buttons') return 'buttons'
  if (message.kind === 'list') return 'interactive'
  return 'text'
}

/**
 * Record the reply as an outbound message and show it in an open inbox — a
 * conversation must show everything the account said, automated or not.
 */
async function recordReply(
  chatId: string,
  messageId: string,
  message: WaOutgoing,
  buttons: string | null,
): Promise<void> {
  const body = messagePreview(message)
  const now = new Date()
  const prisma = getPrisma()
  const [saved] = await prisma.$transaction([
    prisma.message.create({
      data: {
        id: messageId,
        chatId,
        direction: 'out',
        type: storedType(message),
        body,
        mediaPath: message.kind === 'media' ? message.path : null,
        buttons: message.kind === 'buttons' ? buttons : null,
        status: 'sent',
        timestamp: now,
      },
    }),
    prisma.chat.update({
      where: { id: chatId },
      data: { lastMessage: body ?? '[media]', lastMessageAt: now },
    }),
  ])
  notify('message:received', {
    chatId,
    message: {
      id: saved.id,
      chatId: saved.chatId,
      direction: 'out',
      type: saved.type as MessageType,
      body: saved.body,
      mediaPath: saved.mediaPath,
      fileName: null,
      fileSize: null,
      // The inbox renders buttons from chat:messages; the push only needs to
      // show that a reply went out.
      buttons: null,
      status: 'sent',
      isAiReply: false,
      timestamp: saved.timestamp.toISOString(),
    },
  })
}

/**
 * Rule+chat pairs being answered right now. Two messages from one chat can
 * arrive together; both would pass the cooldown check before either recorded a
 * hit, and the customer would get the same answer twice.
 */
const inFlight = new Set<string>()

/** Answer the message if a rule matches. Returns true when a rule replied. */
export async function tryKeywordReply(ctx: InboundContext): Promise<boolean> {
  if (ctx.isGroup || !ctx.text || ctx.text.trim() === '') return false

  const prisma = getPrisma()
  const chat = await prisma.chat.findUnique({ where: { id: ctx.chatId } })
  // A human owns these conversations; neither a rule nor the bot speaks.
  if (!chat || chat.autoReplyOptOut || chat.isEscalated) return false

  const rule = findMatchingRule(await loadActiveRules(), ctx.text, ctx.deviceId)
  if (!rule) return false

  const key = `${rule.id}:${ctx.chatId}`
  if (inFlight.has(key)) return true
  inFlight.add(key)
  try {
    const hit = await prisma.keywordRuleHit.findUnique({
      where: { ruleId_chatId: { ruleId: rule.id, chatId: ctx.chatId } },
    })
    const cooldownMs = rule.cooldownMinutes * 60_000
    if (hit && cooldownMs > 0 && Date.now() - hit.lastAt.getTime() < cooldownMs) {
      console.log(`keyword-rules: rule ${rule.id} is cooling down for this chat`)
      return true
    }

    const phone = ctx.phone.startsWith('+') ? ctx.phone : `+${ctx.phone}`
    if (await isSuppressed(phone)) {
      console.log(`keyword-rules: rule ${rule.id} matched an opted-out number; not sent`)
      return true
    }

    const message = ruleMessage(rule, { Name: chat.name, Mobile: phone })
    if (!message) {
      console.warn(`keyword-rules: rule ${rule.id} has no reply text or template`)
      return true
    }

    let messageId: string
    try {
      // Automated, so no `manual` flag: the throttle paces it and quiet hours
      // and the daily cap apply.
      const sent = await waBridge.request('message:send', {
        deviceId: ctx.deviceId,
        to: ctx.chatId,
        message,
      })
      messageId = sent.messageId
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      if (isParkingError(detail)) {
        // Not a failure and not a hit: the next matching message may answer.
        console.log(`keyword-rules: rule ${rule.id} reply held — ${detail}`)
      } else {
        console.error(`keyword-rules: rule ${rule.id} reply failed`, detail)
        toast(
          'error',
          `Keyword rule "${rule.name}" matched but its reply could not be sent.`,
        )
      }
      return true
    }

    const now = new Date()
    await prisma.$transaction([
      prisma.keywordRuleHit.upsert({
        where: { ruleId_chatId: { ruleId: rule.id, chatId: ctx.chatId } },
        create: { ruleId: rule.id, chatId: ctx.chatId, lastAt: now },
        update: { lastAt: now },
      }),
      prisma.keywordRule.update({
        where: { id: rule.id },
        data: { hitCount: { increment: 1 }, lastHitAt: now },
      }),
    ])
    await recordReply(ctx.chatId, messageId, message, rule.template?.buttons ?? null)

    if ((await readSendingDefaults()).markReadOnReply) {
      await waBridge
        .request('message:read', {
          deviceId: ctx.deviceId,
          chatJid: ctx.chatId,
          messageIds: [ctx.messageId],
        })
        .catch((err: unknown) =>
          // A missing blue tick is cosmetic; the reply itself went out.
          console.warn('keyword-rules: could not mark the message read', err),
        )
    }
    return true
  } finally {
    inFlight.delete(key)
  }
}
