/**
 * The opt-out (suppression) list (IMPROVEMENT-PLAN.md Phase 2).
 *
 * A contact who replies with an opt-out keyword is suppressed across every
 * list, sequence and bot. That reply is the single most important inbound
 * message this app handles: ignoring it is how a WhatsApp number collects the
 * spam reports that get it banned.
 */
import { getPrisma } from '../db/client'
import { waBridge } from '../wa-bridge'
import type { InboundContext } from './inbound'
import { notify } from './notify'
import { emitWebhook } from './webhooks'
import { isHiddenPhone } from '../../../shared/phone-display'

/** Which of these E.164 numbers are suppressed. One query, any batch size ≤ 1,000. */
export async function suppressedPhones(phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set()
  const rows = await getPrisma().suppression.findMany({
    where: { phone: { in: phones } },
    select: { phone: true },
    // NOTE: no `take` — the IN list bounds the result, and Prisma can only split
    // an IN list past SQLite's parameter limit when the query has no `take`.
  })
  return new Set(rows.map((r) => r.phone))
}

export async function isSuppressed(phone: string): Promise<boolean> {
  return (await suppressedPhones([phone])).size > 0
}

// ── configuration ──

export interface OptOutConfig {
  keywords: string[]
  confirmationEnabled: boolean
  confirmationText: string
}

const KEYS = {
  keywords: 'optout.keywords',
  confirmationEnabled: 'optout.confirmationEnabled',
  confirmationText: 'optout.confirmationText',
} as const

export const DEFAULT_OPTOUT_CONFIG: OptOutConfig = {
  // Hindi "बंद" (band, "stop") because a large share of users message in Hindi.
  keywords: ['STOP', 'UNSUBSCRIBE', 'बंद'],
  confirmationEnabled: true,
  confirmationText:
    "You've been unsubscribed and won't receive further messages. Reply START to opt back in.",
}

const RESUBSCRIBE_KEYWORD = 'START'
const RESUBSCRIBED_TEXT = "You're subscribed again."

function parseKeywords(value: string | undefined): string[] {
  if (value === undefined) return DEFAULT_OPTOUT_CONFIG.keywords
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed)) {
      const words = parsed.filter((w): w is string => typeof w === 'string' && w !== '')
      if (words.length > 0) return words
    }
  } catch (err) {
    // NOTE: a corrupt value falls back to the defaults rather than disabling
    // opt-outs — failing open here would mean ignoring STOP replies.
    console.warn('opt-out keywords setting is unreadable; using defaults', err)
  }
  return DEFAULT_OPTOUT_CONFIG.keywords
}

export async function readOptOutConfig(): Promise<OptOutConfig> {
  const rows = await getPrisma().setting.findMany({
    where: { key: { in: Object.values(KEYS) } },
    take: 3,
  })
  const byKey = new Map(rows.map((r) => [r.key, r.value]))
  const enabled = byKey.get(KEYS.confirmationEnabled)
  const text = byKey.get(KEYS.confirmationText)
  return {
    keywords: parseKeywords(byKey.get(KEYS.keywords)),
    confirmationEnabled:
      enabled === undefined
        ? DEFAULT_OPTOUT_CONFIG.confirmationEnabled
        : enabled === 'true',
    confirmationText:
      text && text.trim() !== '' ? text : DEFAULT_OPTOUT_CONFIG.confirmationText,
  }
}

export async function writeOptOutConfig(config: OptOutConfig): Promise<void> {
  const keywords = Array.from(new Set(config.keywords.map((k) => k.trim()))).filter(
    (k) => k !== '',
  )
  const values: Array<[string, string]> = [
    [KEYS.keywords, JSON.stringify(keywords)],
    [KEYS.confirmationEnabled, String(config.confirmationEnabled)],
    [KEYS.confirmationText, config.confirmationText.trim()],
  ]
  const prisma = getPrisma()
  await prisma.$transaction(
    values.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      }),
    ),
  )
}

// ── inbound keywords ──

const E164 = /^\+[1-9]\d{6,14}$/

/**
 * Send a compliance reply and record it in the inbox.
 *
 * WHY `manual: true`: this answers the contact's own request, seconds after
 * they made it. Parking it behind quiet hours or the daily cap would leave
 * someone who asked to stop with no acknowledgement until tomorrow — which is
 * exactly when they report the number. It still goes through the throttle.
 *
 * Failure is logged, not thrown: the suppression has already been recorded,
 * and that is what matters. Throwing would let the inbound pipeline carry on
 * to the bot, which must never answer a STOP.
 */
async function sendComplianceReply(ctx: InboundContext, body: string): Promise<void> {
  try {
    const { messageId } = await waBridge.request('message:send', {
      deviceId: ctx.deviceId,
      to: ctx.chatId,
      message: { kind: 'text', body },
      manual: true,
    })
    const now = new Date()
    const prisma = getPrisma()
    await prisma.$transaction([
      prisma.message.create({
        data: {
          id: messageId,
          chatId: ctx.chatId,
          direction: 'out',
          type: 'text',
          body,
          status: 'sent',
          timestamp: now,
        },
      }),
      prisma.chat.update({
        where: { id: ctx.chatId },
        data: { lastMessage: body, lastMessageAt: now },
      }),
    ])
    notify('message:received', {
      chatId: ctx.chatId,
      message: {
        id: messageId,
        chatId: ctx.chatId,
        direction: 'out',
        type: 'text',
        body,
        mediaPath: null,
        fileName: null,
        fileSize: null,
        buttons: null,
        status: 'sent',
        isAiReply: false,
        timestamp: now.toISOString(),
      },
    })
  } catch (err) {
    console.error(
      'opt-out: the confirmation reply could not be sent',
      err instanceof Error ? err.message : String(err),
    )
  }
}

async function optOut(ctx: InboundContext, keyword: string, config: OptOutConfig) {
  const prisma = getPrisma()
  await prisma.$transaction([
    // An existing manual or imported entry is kept as it is: its source decides
    // whether a later START may lift it.
    prisma.suppression.upsert({
      where: { phone: ctx.phone },
      create: {
        phone: ctx.phone,
        source: 'stop_keyword',
        reason: `Replied ${keyword.toUpperCase()}`,
      },
      update: {},
    }),
    prisma.chat.update({ where: { id: ctx.chatId }, data: { autoReplyOptOut: true } }),
  ])
  console.info('opt-out: number suppressed by keyword reply')

  await emitWebhook('optout.added', {
    phone: ctx.phone,
    chatId: ctx.chatId,
    deviceId: ctx.deviceId,
    source: 'stop_keyword',
  })
  notify('chat:updated', { chatId: ctx.chatId })

  if (config.confirmationEnabled) await sendComplianceReply(ctx, config.confirmationText)
}

/**
 * START lifts only a suppression the contact created themselves. A number the
 * user suppressed by hand or imported from a do-not-contact file stays
 * suppressed — that decision was not the contact's to reverse.
 */
async function optIn(ctx: InboundContext): Promise<boolean> {
  const prisma = getPrisma()
  const row = await prisma.suppression.findUnique({ where: { phone: ctx.phone } })
  if (!row || row.source !== 'stop_keyword') return false

  await prisma.$transaction([
    prisma.suppression.delete({ where: { phone: ctx.phone } }),
    prisma.chat.update({ where: { id: ctx.chatId }, data: { autoReplyOptOut: false } }),
  ])
  console.info('opt-out: number re-subscribed by keyword reply')
  notify('chat:updated', { chatId: ctx.chatId })
  await sendComplianceReply(ctx, RESUBSCRIBED_TEXT)
  return true
}

/**
 * Handle an inbound opt-out keyword. Returns true when the message was an
 * opt-out and nothing else should answer it.
 *
 * Only an exact, whole-message keyword counts: "please don't stop sending" is
 * not an opt-out, and treating it as one would silently drop a customer.
 */
export async function handleOptOut(ctx: InboundContext): Promise<boolean> {
  // WHY hidden numbers too: a STOP must be honoured even before WhatsApp has
  // shown us the number. It is stored against the LID stand-in and moves to
  // the real number when the mapping arrives (services/lid-repair.ts).
  if (ctx.isGroup || !ctx.text) return false
  if (!E164.test(ctx.phone) && !isHiddenPhone(ctx.phone)) return false
  const text = ctx.text.trim().toLowerCase()
  if (text === '') return false

  const config = await readOptOutConfig()
  const keyword = config.keywords.find((k) => k.trim().toLowerCase() === text)
  if (keyword) {
    await optOut(ctx, keyword, config)
    return true
  }

  if (text === RESUBSCRIBE_KEYWORD.toLowerCase()) return optIn(ctx)
  return false
}
