/**
 * The WhatsApp address book of each linked phone (Wave 3 contacts grabber).
 *
 * wa-service reports contacts as WhatsApp syncs them — the initial history
 * sync, then incremental upserts. Main persists them so the grabber can export
 * them into a contact list long after the sync event has passed.
 */
import { getPrisma } from '../db/client'

const BATCH = 500

export async function persistWaContacts(
  deviceId: string,
  contacts: Array<{ jid: string; phone: string; name: string | null }>,
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
      slice.map((c) =>
        prisma.waContact.upsert({
          where: { deviceId_jid: { deviceId, jid: c.jid } },
          create: { deviceId, jid: c.jid, phone: c.phone, name: c.name },
          // An update without a name (a common partial event) must not erase
          // the name an earlier event supplied.
          update: { phone: c.phone, ...(c.name ? { name: c.name } : {}) },
        }),
      ),
    )
  }
}
