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
 *   5. Keyword rules — deterministic answers, before any model is called.
 *   6. The AI bot — last, and only if nothing above answered.
 *
 * Each step is isolated: a failure is logged and the next step still runs,
 * because one broken integration must not silence the inbox.
 */
import type { MessageType } from '../../../shared/types'
import { maybeReply } from './ai/responder'
import { attributeReply } from './attribution'
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

export async function handleInbound(ctx: InboundContext): Promise<void> {
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
