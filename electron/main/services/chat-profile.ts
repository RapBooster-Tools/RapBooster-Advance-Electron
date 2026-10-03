/**
 * The inbox's contact side panel: who this person is across every list, what
 * campaigns and sequences reached them, and the team's private notes (Wave 3).
 *
 * Every query is bounded — a number that has been in years of campaigns must
 * not turn opening a chat into a full table scan.
 */
import { AppError } from '../../../shared/errors'
import type { EnrollmentStatus, RecipientStatus } from '../../../shared/types'
import { getPrisma } from '../db/client'
import { chatE164 } from '../ipc/chat.ipc'
import { isSuppressed } from './optout'
import { mergeValues } from './template-message'

/** Contact records shown per number; one per list in practice. */
const MAX_CONTACTS = 20
const MAX_CAMPAIGNS = 20
const MAX_SEQUENCES = 20
const MAX_NOTES = 200

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null)

async function requireChat(chatId: string) {
  const chat = await getPrisma().chat.findUnique({
    where: { id: chatId },
    select: { id: true, name: true, phone: true, isGroup: true },
  })
  if (!chat) {
    throw new AppError('NOT_FOUND', { userMessage: 'That chat no longer exists.' })
  }
  return chat
}

export async function chatProfile(chatId: string) {
  const chat = await requireChat(chatId)
  const base = {
    chatId: chat.id,
    name: chat.name,
    phone: chat.isGroup ? chat.phone : chatE164(chat.phone),
  }
  // A group is not a person: there is no contact record, campaign or opt-out.
  if (chat.isGroup) {
    return { ...base, optedOut: false, contacts: [], campaigns: [], sequences: [] }
  }

  const prisma = getPrisma()
  const phone = base.phone
  const [optedOut, contacts, recipients, enrollments] = await Promise.all([
    isSuppressed(phone),
    prisma.contact.findMany({
      where: { phone },
      orderBy: { updatedAt: 'desc' },
      take: MAX_CONTACTS,
      select: {
        id: true,
        listId: true,
        name: true,
        phone: true,
        data: true,
        list: { select: { name: true } },
        tags: { select: { tagId: true }, take: 50 },
      },
    }),
    // Uses the (phone, sentAt) index; recipients are E.164 snapshots.
    prisma.campaignRecipient.findMany({
      where: { phone },
      orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
      take: MAX_CAMPAIGNS,
      select: {
        campaignId: true,
        status: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        repliedAt: true,
        campaign: { select: { name: true } },
      },
    }),
    prisma.sequenceEnrollment.findMany({
      where: { phone },
      orderBy: { createdAt: 'desc' },
      take: MAX_SEQUENCES,
      select: {
        id: true,
        sequenceId: true,
        status: true,
        nextStep: true,
        sequence: { select: { name: true } },
      },
    }),
  ])

  return {
    ...base,
    optedOut,
    contacts: contacts.map((c) => ({
      id: c.id,
      listId: c.listId,
      listName: c.list.name,
      data: mergeValues(c),
      tagIds: c.tags.map((t) => t.tagId),
    })),
    campaigns: recipients.map((r) => ({
      campaignId: r.campaignId,
      name: r.campaign.name,
      status: r.status as RecipientStatus,
      sentAt: iso(r.sentAt),
      deliveredAt: iso(r.deliveredAt),
      readAt: iso(r.readAt),
      repliedAt: iso(r.repliedAt),
    })),
    sequences: enrollments.map((e) => ({
      enrollmentId: e.id,
      sequenceId: e.sequenceId,
      name: e.sequence.name,
      status: e.status as EnrollmentStatus,
      nextStep: e.nextStep,
    })),
  }
}

function serializeNote(row: {
  id: string
  chatId: string
  body: string
  createdAt: Date
}) {
  return {
    id: row.id,
    chatId: row.chatId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Newest first: the latest note is the one a teammate needs to read. */
export async function listNotes(chatId: string) {
  const rows = await getPrisma().chatNote.findMany({
    where: { chatId },
    orderBy: { createdAt: 'desc' },
    take: MAX_NOTES,
  })
  return rows.map(serializeNote)
}

export async function addNote(chatId: string, body: string) {
  await requireChat(chatId)
  return serializeNote(await getPrisma().chatNote.create({ data: { chatId, body } }))
}

export async function deleteNote(id: string): Promise<void> {
  await getPrisma().chatNote.deleteMany({ where: { id } })
}
