/**
 * What automated replies need to know about an inbound chat: its merge-tag
 * values, and whether this is the customer's first message. Shared by the flow
 * engine and welcome/away messages so both answer the same way.
 */
import { getPrisma } from '../../db/client'
import { mergeValues } from '../template-message'

/** Chats store the number with or without "+"; contacts always carry it. */
export function chatPhone(phone: string): string {
  return phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`
}

/**
 * Merge-tag values: the matching contact's fields when the number is in a
 * contact list, otherwise the chat's own name and number.
 */
export async function chatMergeValues(chat: {
  name: string
  phone: string
}): Promise<Record<string, string>> {
  const phone = chatPhone(chat.phone)
  const contact = await getPrisma().contact.findFirst({
    where: { phone },
    orderBy: { updatedAt: 'desc' },
    select: { name: true, phone: true, data: true },
  })
  const base = { Name: chat.name, Mobile: phone }
  if (!contact) return base
  const fields = mergeValues(contact)
  return { ...base, ...fields, ...(contact.name ? { Name: contact.name } : {}) }
}

/** True for the chat's first inbound message — it is already stored when this runs. */
export async function isFirstInbound(chatId: string): Promise<boolean> {
  const inbound = await getPrisma().message.findMany({
    where: { chatId, direction: 'in' },
    select: { id: true },
    take: 2,
  })
  return inbound.length <= 1
}
