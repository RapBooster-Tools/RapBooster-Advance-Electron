/**
 * The one way an AI-authored message leaves the app: through wa-service, so the
 * throttle applies (CLAUDE.md §2.5), then stored, shown and acknowledged.
 */
import type { IpcEventPayload } from '../../../../shared/ipc'
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
  const { messageId } = await waBridge.request('message:send', {
    deviceId,
    to: chatId,
    message: { kind: 'text', body: text },
    ...(options.manual ? { manual: true } : {}),
  })

  const at = options.at ?? new Date()
  const prisma = getPrisma()
  const saved = await prisma.message.create({
    data: {
      id: messageId,
      chatId,
      direction: 'out',
      type: 'text',
      body: text,
      status: 'sent',
      isAiReply: true,
      timestamp: at,
    },
  })
  await prisma.chat.update({
    where: { id: chatId },
    data: { lastMessage: text, lastMessageAt: at },
  })

  const message: InboxMessage = {
    id: saved.id,
    chatId,
    direction: 'out',
    type: 'text',
    body: text,
    mediaPath: null,
    fileName: null,
    fileSize: null,
    buttons: null,
    status: 'sent',
    isAiReply: true,
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
