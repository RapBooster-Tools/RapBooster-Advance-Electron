/**
 * The member grabber: export the members of chosen groups into a new contact
 * list (D89).
 */
import { AppError } from '../../../../shared/errors'
import { getPrisma } from '../../db/client'
import { applyMetadata, phoneDigits } from '../../services/group-meta'
import { normalizePhone } from '../../services/phone'
import { registerHandler } from '../router'
import { requireConnectedDevice, waCall } from './shared'

const INSERT_BATCH = 1_000
/** Past this many "Name (n)" collisions something else is wrong. */
const MAX_NAME_ATTEMPTS = 500

/** `name`, or `name (2)`, `name (3)`… — whichever is free. */
async function freeListName(name: string): Promise<string> {
  const prisma = getPrisma()
  for (let n = 1; n <= MAX_NAME_ATTEMPTS; n += 1) {
    const candidate = n === 1 ? name : `${name} (${n})`
    const taken = await prisma.contactList.findUnique({
      where: { name: candidate },
      select: { id: true },
    })
    if (!taken) return candidate
  }
  throw new AppError('CONFLICT', {
    userMessage: 'Too many lists share that name. Choose a different list name.',
  })
}

export function registerGroupExportHandlers(): void {
  registerHandler('group:exportMembers', async ({ groupIds, listName }) => {
    const prisma = getPrisma()
    const groups = await prisma.group.findMany({
      where: { id: { in: groupIds } },
      take: groupIds.length,
    })
    if (groups.length !== new Set(groupIds).size) {
      throw new AppError('NOT_FOUND', {
        userMessage:
          'Some selected groups are no longer in the list. Sync and try again.',
      })
    }

    // Collect first, write once: a WhatsApp failure part way through leaves
    // no half-filled list behind.
    const phones: string[] = []
    const seen = new Set<string>()
    let skipped = 0
    for (const group of groups) {
      const device = await requireConnectedDevice(group.deviceId)
      const own = device.phone ? phoneDigits(device.phone) : null
      const metadata = await waCall(
        'group:metadata',
        { deviceId: device.id, groupId: group.id },
        `read the members of "${group.name}"`,
      )
      await applyMetadata(device.id, metadata, device.phone)

      for (const participant of metadata.participants) {
        const digits = phoneDigits(participant.phone)
        // A LID participant without a phone number reports the LID itself;
        // that is not a number anyone can message.
        const hidden =
          participant.jid.endsWith('@lid') && digits === phoneDigits(participant.jid)
        const e164 = hidden ? null : normalizePhone(`+${digits}`).e164
        if (!e164 || digits === own || seen.has(digits)) {
          skipped += 1
          continue
        }
        seen.add(digits)
        phones.push(e164)
      }
    }

    const name = await freeListName(listName.trim())
    const listId = await prisma.$transaction(
      async (tx) => {
        const list = await tx.contactList.create({
          data: { name, fields: JSON.stringify(['Name', 'Mobile']) },
        })
        for (let i = 0; i < phones.length; i += INSERT_BATCH) {
          await tx.contact.createMany({
            data: phones.slice(i, i + INSERT_BATCH).map((phone) => ({
              listId: list.id,
              // WhatsApp does not give us member names; the number is the
              // only label we have, and the user can rename later.
              name: phone,
              phone,
              data: JSON.stringify({ Name: phone, Mobile: phone }),
            })),
          })
        }
        await tx.contactList.update({
          where: { id: list.id },
          data: { contactCount: await tx.contact.count({ where: { listId: list.id } }) },
        })
        return list.id
      },
      // A 50k-member export is many batches; the default 5 s would cut it off.
      { timeout: 120_000 },
    )

    return { listId, imported: phones.length, skipped }
  })
}
