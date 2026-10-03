/**
 * Quick replies: saved answers a person inserts into the inbox composer by
 * typing "/" and their shortcut (Wave 3).
 *
 * Inserting one never sends anything — the rendered text lands in the composer
 * and the person still presses Send, so it goes out as an ordinary typed reply.
 */
import { AppError } from '../../../shared/errors'
import { renderTemplate } from '../../../shared/merge-tags'
import { getPrisma } from '../db/client'
import { chatE164 } from '../ipc/chat.ipc'
import { mergeValues } from './template-message'

/** Far more than anyone keeps; the picker filters client-side. */
const MAX_LISTED = 500

interface QuickReplyRow {
  id: string
  shortcut: string
  title: string
  body: string
  useCount: number
}

function serialize(row: QuickReplyRow) {
  return {
    id: row.id,
    shortcut: row.shortcut,
    title: row.title,
    body: row.body,
    useCount: row.useCount,
  }
}

function duplicateShortcut(shortcut: string): AppError {
  return new AppError('CONFLICT', {
    userMessage: `You already have a quick reply called /${shortcut}. Pick a different shortcut.`,
  })
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | undefined)?.code === 'P2002'
}

/** Most used first, so the picker opens on the answers this team actually sends. */
export async function listQuickReplies() {
  const rows = await getPrisma().quickReply.findMany({
    orderBy: [{ useCount: 'desc' }, { shortcut: 'asc' }],
    take: MAX_LISTED,
  })
  return rows.map(serialize)
}

export async function createQuickReply(input: {
  shortcut: string
  title: string
  body: string
}) {
  const prisma = getPrisma()
  const clash = await prisma.quickReply.findUnique({
    where: { shortcut: input.shortcut },
    select: { id: true },
  })
  if (clash) throw duplicateShortcut(input.shortcut)
  try {
    return serialize(await prisma.quickReply.create({ data: input }))
  } catch (err) {
    // The pre-check races with a second window saving the same shortcut; the
    // unique index is the real guarantee.
    if (isUniqueViolation(err)) throw duplicateShortcut(input.shortcut)
    throw err
  }
}

export async function updateQuickReply(input: {
  id: string
  shortcut?: string
  title?: string
  body?: string
}) {
  const prisma = getPrisma()
  const { id, ...changes } = input
  const existing = await prisma.quickReply.findUnique({ where: { id } })
  if (!existing) {
    throw new AppError('NOT_FOUND', { userMessage: 'That quick reply no longer exists.' })
  }
  if (changes.shortcut && changes.shortcut !== existing.shortcut) {
    const clash = await prisma.quickReply.findUnique({
      where: { shortcut: changes.shortcut },
      select: { id: true },
    })
    if (clash) throw duplicateShortcut(changes.shortcut)
  }
  try {
    return serialize(await prisma.quickReply.update({ where: { id }, data: changes }))
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateShortcut(changes.shortcut ?? '')
    throw err
  }
}

export async function deleteQuickReply(id: string): Promise<void> {
  await getPrisma().quickReply.deleteMany({ where: { id } })
}

/**
 * Merge-tag values for a chat: the newest contact record with this number,
 * falling back to the chat's own name and number so {{Name}} is never blank
 * for someone who is not in any list yet.
 */
export async function chatMergeValues(chat: {
  name: string
  phone: string
  isGroup: boolean
}): Promise<Record<string, string>> {
  const phone = chat.isGroup ? chat.phone : chatE164(chat.phone)
  const fallback = { Name: chat.name, Mobile: phone, Phone: phone }
  if (chat.isGroup) return fallback

  const contact = await getPrisma().contact.findFirst({
    where: { phone },
    orderBy: { updatedAt: 'desc' },
    select: { data: true, name: true, phone: true },
  })
  if (!contact) return fallback

  const values = mergeValues(contact)
  for (const [key, value] of Object.entries(fallback)) {
    const present = Object.keys(values).some(
      (k) => k.toLowerCase() === key.toLowerCase() && values[k] !== '',
    )
    if (!present) values[key] = value
  }
  return values
}

/** Render a quick reply for one chat and count the use. */
export async function applyQuickReply(id: string, chatId: string): Promise<string> {
  const prisma = getPrisma()
  const [reply, chat] = await Promise.all([
    prisma.quickReply.findUnique({ where: { id } }),
    prisma.chat.findUnique({
      where: { id: chatId },
      select: { name: true, phone: true, isGroup: true },
    }),
  ])
  if (!reply) {
    throw new AppError('NOT_FOUND', { userMessage: 'That quick reply no longer exists.' })
  }
  if (!chat) {
    throw new AppError('NOT_FOUND', { userMessage: 'That chat no longer exists.' })
  }

  const { text } = renderTemplate(reply.body, await chatMergeValues(chat))
  await prisma.quickReply.update({
    where: { id },
    data: { useCount: { increment: 1 } },
  })
  return text
}
