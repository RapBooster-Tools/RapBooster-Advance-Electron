/**
 * The one way an automated reply leaves the app — the AI bot's, a chatbot
 * flow's, a welcome message: through wa-service, so the throttle applies
 * (CLAUDE.md §2.5), then stored, shown and acknowledged.
 */
import type { IpcEventPayload } from '../../../../shared/ipc'
import type { MessageType } from '../../../../shared/types'
import type { WaOutgoing } from '../../../../shared/wa-protocol'
import { getPrisma } from '../../db/client'
import { waBridge } from '../../wa-bridge'
import { notify } from '../notify'
import { readSendingDefaults } from '../sending-policy'

type InboxMessage = IpcEventPayload<'message:received'>['message']

/**
 * Send a bot-authored text and record it as an AI message.
 *
 * `manual` is true only when a person approved the text in the inbox: that is
 * a human decision, exempt from quiet hours like any typed reply. Everything
 * the bot sends on its own is automated and may be parked by the throttle —
 * the error propagates so the caller can hold the reply instead.
 *
 * `at` lets the escalation notice share its chat's `escalatedAt` instant, so
 * the "after N replies" trigger can count bot replies strictly after it.
 */
export async function sendBotText(
  deviceId: string,
  chatId: string,
  text: string,
  options: { manual?: boolean; at?: Date } = {},
): Promise<InboxMessage> {
  return sendBotMessage(
    deviceId,
    chatId,
    { kind: 'text', body: text },
    { ...options, isAiReply: true },
  )
}

/** The inbox's view of an outgoing message: its stored type, text and buttons. */
function storedForm(message: WaOutgoing): {
  type: MessageType
  body: string
  buttons: string | null
} {
  if (message.kind === 'buttons') {
    return {
      type: 'buttons',
      body: message.body,
      buttons: JSON.stringify(
        message.buttons.map((b) => ({ type: b.type, label: b.label })),
      ),
    }
  }
  if (message.kind === 'list') {
    // A list has no column of its own; its rows are kept readable in the body.
    const rows = message.rows.map((r, i) => `${i + 1}. ${r.title}`).join('\n')
    return { type: 'interactive', body: `${message.body}\n\n${rows}`, buttons: null }
  }
  const body = 'body' in message && typeof message.body === 'string' ? message.body : ''
  return { type: 'text', body, buttons: null }
}

/**
 * The general form of `sendBotText`, for automation other than the AI: a
 * chatbot flow's menu, a welcome or away message. Same path — throttled,
 * stored, pushed to an open inbox, answered messages blue-ticked.
 *
 * NOTE: `isAiReply` defaults to false here. The "escalate after N bot replies"
 * trigger counts AI answers, and a scripted menu step is not one.
 */
export async function sendBotMessage(
  deviceId: string,
  chatId: string,
  outgoing: WaOutgoing,
  options: { manual?: boolean; at?: Date; isAiReply?: boolean } = {},
): Promise<InboxMessage> {
  const { messageId } = await waBridge.request('message:send', {
    deviceId,
    to: chatId,
    message: outgoing,
    ...(options.manual ? { manual: true } : {}),
  })

  const at = options.at ?? new Date()
  const isAiReply = options.isAiReply ?? false
  const stored = storedForm(outgoing)
  const prisma = getPrisma()
  const saved = await prisma.message.create({
    data: {
      id: messageId,
      chatId,
      direction: 'out',
      type: stored.type,
      body: stored.body,
      buttons: stored.buttons,
      status: 'sent',
      isAiReply,
      timestamp: at,
    },
  })
  await prisma.chat.update({
    where: { id: chatId },
    data: { lastMessage: stored.body, lastMessageAt: at },
  })

  const message: InboxMessage = {
    id: saved.id,
    chatId,
    direction: 'out',
    type: stored.type,
    body: stored.body,
    mediaPath: null,
    fileName: null,
    fileSize: null,
    // The inbox renders buttons from chat:messages; the push only needs to
    // show that a reply went out.
    buttons: null,
    status: 'sent',
    isAiReply,
    timestamp: at.toISOString(),
  }
  // Tracker K10: without this an open inbox never showed the bot's reply until
  // the chat was reopened.
  notify('message:received', { chatId, message })
  await markAnswered(deviceId, chatId, saved.id)
  return message
}

/**
 * Blue-tick the customer messages this reply answered, when the user wants
 * that (`sending.markReadOnReply`). A reply that leaves the question "unread"
 * looks automated.
 */
async function markAnswered(deviceId: string, chatId: string, replyId: string) {
  if (!(await readSendingDefaults()).markReadOnReply) return

  const recent = await getPrisma().message.findMany({
    where: { chatId, id: { not: replyId } },
    orderBy: { timestamp: 'desc' },
    select: { id: true, direction: true },
    take: 20,
  })
  const answered: string[] = []
  for (const m of recent) {
    if (m.direction === 'out') break
    answered.push(m.id)
  }
  if (answered.length === 0) return

  try {
    await waBridge.request('message:read', {
      deviceId,
      chatJid: chatId,
      messageIds: answered,
    })
  } catch (err) {
    // A missing read receipt is cosmetic; the reply itself already went out.
    console.warn('ai: could not mark answered messages read', err)
  }
}
