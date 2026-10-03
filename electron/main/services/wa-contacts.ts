/**
 * The numbers each linked phone knows (Wave 3 contacts grabber): its address
 * book and its one-to-one chats.
 *
 * wa-service reports them as WhatsApp syncs them — the initial history sync,
 * then incremental upserts — and main adds every inbound chat the inbox sees.
 * Main persists them so the grabber can export them into a contact list long
 * after the sync event has passed.
 */
import type { WaSyncedContact } from '../../../shared/wa-protocol'
import { getPrisma } from '../db/client'

const BATCH = 500

export async function persistWaContacts(
  deviceId: string,
  contacts: WaSyncedContact[],
): Promise<void> {
  const prisma = getPrisma()
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { id: true },
  })
  if (!device) return

  for (let i = 0; i < contacts.length; i += BATCH) {
    const slice = contacts.slice(i, i + BATCH)
    await prisma.$transaction(
      slice.flatMap((c) => {
        const key = { deviceId_jid: { deviceId, jid: c.jid } }
        if (c.source === 'addressBook') {
          return [
            prisma.waContact.upsert({
              where: key,
              create: { deviceId, jid: c.jid, phone: c.phone, name: c.name },
              // A partial update without a name must not erase the saved one.
              update: {
                phone: c.phone,
                inAddressBook: true,
                ...(c.name ? { name: c.name } : {}),
              },
            }),
          ]
        }
        const lastChatAt = c.lastChatAt ? new Date(c.lastChatAt) : null
        return [
          prisma.waContact.upsert({
            where: key,
            create: {
              deviceId,
              jid: c.jid,
              phone: c.phone,
              name: c.name,
              inAddressBook: false,
              hasChat: true,
              lastChatAt,
            },
            update: { hasChat: true, ...(lastChatAt ? { lastChatAt } : {}) },
          }),
          // WHY only when empty: the address-book name is the one the user
          // chose; a chat's push name only fills the gap.
          ...(c.name
            ? [
                prisma.waContact.updateMany({
                  where: { deviceId, jid: c.jid, name: null },
                  data: { name: c.name },
                }),
              ]
            : []),
        ]
      }),
    )
  }
}

/** Record an inbound one-to-one chat, so the grabber covers inbox leads too. */
export async function recordChatContact(
  deviceId: string,
  phone: string,
  name: string | null,
  at: Date,
): Promise<void> {
  // Only a real number can be exported and messaged later.
  if (!/^\+\d{7,15}$/.test(phone)) return
  await persistWaContacts(deviceId, [
    {
      jid: `${phone.slice(1)}@s.whatsapp.net`,
      phone,
      name,
      source: 'chat',
      lastChatAt: at.toISOString(),
    },
  ])
}
