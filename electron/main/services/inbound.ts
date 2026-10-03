/**
 * What happens to every inbound message after it is stored (D89).
 *
 * The order matters and is fixed here, in one place:
 *
 *   1. Opt-out keywords — a STOP must win over everything, including a bot
 *      that would otherwise answer it.
 *   2. Reply attribution — credit the campaign that prompted the message.
 *   3. Drip sequences — a reply stops the sequence for that number.
 *   4. Webhooks — `message.received` for integrations.
 *   5. Welcome / away messages — sent alongside, never instead of, what follows.
 *   6. Chatbot flows — a customer mid-menu must get the menu's next step.
 *   7. Keyword rules — deterministic answers, before any model is called.
 *   8. The AI bot — last, and only if nothing above answered.
 *
 * Each step is isolated: a failure is logged and the next step still runs,
 * because one broken integration must not silence the inbox.
 */
import type { MessageType } from '../../../shared/types'
import { getPrisma } from '../db/client'
import { maybeReply } from './ai/responder'
import { attributeReply } from './attribution'
import { sendWelcomeOrAway } from './auto-replies'
import { tryFlow } from './flows/engine'
import { tryKeywordReply } from './keyword-rules'
import { notify, toast } from './notify'
import { handleOptOut } from './optout'
import { stopOnReply } from './sequences'
import { emitWebhook } from './webhooks'

export interface InboundContext {
  deviceId: string
  chatId: string
  /** E.164 when WhatsApp told us the number; otherwise the raw JID user. */
  phone: string
  isGroup: boolean
  messageId: string
  type: MessageType
  text: string | null
  at: Date
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    console.error(`inbound: ${name} failed`, err)
    return undefined
  }
}

/**
 * True when the sender is one of our own linked numbers. WHY: warmup sends
 * real messages between the user's devices, and the receiving device sees them
 * as ordinary inbound traffic. Without this, the bot and keyword rules would
 * answer our own warmup chatter — two devices replying to each other forever —
 * and the messages would be attributed as campaign replies.
 */
async function isOwnDevice(phone: string): Promise<boolean> {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return false
  const devices = await getPrisma().device.findMany({
    where: { phone: { not: null } },
    select: { phone: true },
    take: 100,
  })
  return devices.some((d) => (d.phone ?? '').replace(/\D/g, '') === digits)
}

export async function handleInbound(ctx: InboundContext): Promise<void> {
  // Stored and shown already; nothing automated reacts to our own numbers.
  if (!ctx.isGroup && (await step('own-device check', () => isOwnDevice(ctx.phone))))
    return

  if (!ctx.isGroup) {
    const optedOut = await step('opt-out', () => handleOptOut(ctx))
    if (optedOut) return

    const campaignId = await step('attribution', () => attributeReply(ctx.phone, ctx.at))
    if (campaignId) {
      await step('webhook reply.attributed', () =>
        emitWebhook('reply.attributed', {
          campaignId,
          phone: ctx.phone,
          chatId: ctx.chatId,
        }),
      )
    }

    await step('sequences', () => stopOnReply(ctx.phone))
  }

  await step('webhook message.received', () =>
    emitWebhook('message.received', {
      deviceId: ctx.deviceId,
      chatId: ctx.chatId,
      phone: ctx.phone,
      isGroup: ctx.isGroup,
      type: ctx.type,
      text: ctx.text,
      at: ctx.at.toISOString(),
    }),
  )

  if (ctx.isGroup) return

  await step('welcome/away', () => sendWelcomeOrAway(ctx))

  const inFlow = await step('chatbot flow', () => tryFlow(ctx))
  if (inFlow) return

  const answered = await step('keyword rules', () => tryKeywordReply(ctx))
  if (answered) return

  const outcome = await step('auto-reply', () =>
    maybeReply(ctx.deviceId, ctx.chatId, {
      id: ctx.messageId,
      body: ctx.text,
      isGroup: ctx.isGroup,
    }),
  )
  if (!outcome) return
  if (outcome.kind === 'failed') {
    // Never a silent no-op: the user configured auto-reply, and if it is not
    // happening they need to know exactly why.
    console.error(`auto-reply failed [${outcome.code}] ${outcome.message}`)
    toast('error', outcome.message)
  } else if (outcome.kind === 'escalated') {
    toast('warning', 'A conversation was escalated for a human reply.')
    notify('chat:updated', { chatId: ctx.chatId })
    await step('webhook chat.escalated', () =>
      emitWebhook('chat.escalated', { chatId: ctx.chatId, phone: ctx.phone }),
    )
  }
}
