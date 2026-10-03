/**
 * Quick replies, chat notes, the contact profile panel and scheduled messages (Wave 3).
 *
 * The handlers only wire requests to services/quick-replies.ts,
 * services/chat-profile.ts and services/scheduled-messages.ts; the one piece of
 * logic kept here is accepting a new scheduled message.
 */
import { AppError } from '../../../shared/errors'
import { getPrisma } from '../db/client'
import { addNote, chatProfile, deleteNote, listNotes } from '../services/chat-profile'
import { notify } from '../services/notify'
import {
  applyQuickReply,
  createQuickReply,
  deleteQuickReply,
  listQuickReplies,
  updateQuickReply,
} from '../services/quick-replies'
import { storeScheduledAttachment } from '../services/scheduled-media'
import {
  discardAttachment,
  listScheduled,
  serializeScheduled,
} from '../services/scheduled-messages'
import { registerHandler } from './router'

/** Far enough ahead for any real follow-up; further is almost always a typo. */
const MAX_AHEAD_MS = 366 * 86_400_000

const OK = { ok: true as const }

export function registerInboxToolHandlers(): void {
  registerHandler('quickReply:list', () => listQuickReplies())
  registerHandler('quickReply:create', (input) => createQuickReply(input))
  registerHandler('quickReply:update', (input) => updateQuickReply(input))
  registerHandler('quickReply:delete', async ({ id }) => {
    await deleteQuickReply(id)
    return OK
  })
  registerHandler('quickReply:use', async ({ id, chatId }) => ({
    text: await applyQuickReply(id, chatId),
  }))

  registerHandler('chat:profile', ({ chatId }) => chatProfile(chatId))
  registerHandler('chat:notes', ({ chatId }) => listNotes(chatId))
  registerHandler('chat:addNote', ({ chatId, body }) => addNote(chatId, body))
  registerHandler('chat:deleteNote', async ({ id }) => {
    await deleteNote(id)
    return OK
  })

  registerHandler('scheduledMessage:list', ({ chatId }) => listScheduled(chatId))

  registerHandler(
    'scheduledMessage:create',
    async ({ chatId, body, mediaSourcePath, sendAt }) => {
      const chat = await getPrisma().chat.findUnique({
        where: { id: chatId },
        select: { id: true },
      })
      if (!chat) {
        throw new AppError('NOT_FOUND', { userMessage: 'That chat no longer exists.' })
      }
      const text = body.trim()
      if (text === '' && !mediaSourcePath) {
        throw new AppError('VALIDATION_FAILED', {
          userMessage: 'Type a message or choose a file to schedule.',
        })
      }
      const at = new Date(sendAt)
      if (at.getTime() <= Date.now()) {
        throw new AppError('VALIDATION_FAILED', {
          userMessage: 'Pick a time in the future.',
        })
      }
      if (at.getTime() - Date.now() > MAX_AHEAD_MS) {
        throw new AppError('VALIDATION_FAILED', {
          userMessage: 'Pick a time within the next year.',
        })
      }

      const mediaPath = mediaSourcePath
        ? storeScheduledAttachment(chatId, mediaSourcePath)
        : null
      try {
        const row = await getPrisma().scheduledMessage.create({
          data: { chatId, body: text, mediaPath, sendAt: at },
        })
        notify('scheduledMessage:changed', { chatId })
        return serializeScheduled(row)
      } catch (err) {
        // Nothing will ever reference the copy of a message that was not saved.
        discardAttachment(mediaPath)
        throw err
      }
    },
  )

  registerHandler('scheduledMessage:cancel', async ({ id }) => {
    const prisma = getPrisma()
    const row = await prisma.scheduledMessage.findUnique({ where: { id } })
    if (!row) {
      throw new AppError('NOT_FOUND', {
        userMessage: 'That scheduled message no longer exists.',
      })
    }
    // Conditional, so a tick that claimed the row a moment ago wins cleanly.
    const { count } = await prisma.scheduledMessage.updateMany({
      where: { id, status: { in: ['scheduled', 'failed'] } },
      data: { status: 'cancelled' },
    })
    if (count === 0) {
      throw new AppError('CONFLICT', {
        userMessage:
          row.status === 'sending'
            ? 'This message is being sent right now and can no longer be cancelled.'
            : 'This message has already been sent or cancelled.',
      })
    }
    discardAttachment(row.mediaPath)
    notify('scheduledMessage:changed', { chatId: row.chatId })
    return OK
  })
}
