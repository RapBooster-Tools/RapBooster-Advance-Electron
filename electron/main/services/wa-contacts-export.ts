/**
 * The WhatsApp contacts grabber: browsing what each linked phone knows (its
 * address book and its chats) and copying it into a contact list.
 *
 * Storing those numbers is wa-contacts.ts; this file only reads them.
 */
import type { Prisma } from '../../../generated/prisma/client'
import { getPrisma } from '../db/client'
import { suppressedPhones } from './optout'
import { normalizePhone } from './phone'

export type WaContactSource = 'all' | 'addressBook' | 'chats'

export interface WaContactFilter {
  deviceIds?: string[]
  source: WaContactSource
  search?: string
  onlyNamed: boolean
  /** Applies to `source: 'chats'` only — the address book has no activity time. */
  chattedSince?: Date
}

export function waContactWhere(f: WaContactFilter): Prisma.WaContactWhereInput {
  const search = f.search?.trim() ?? ''
  // Typing "98765 43210" or "+91 98765…" should still find the number.
  const digits = search.replace(/[\s()+-]/g, '')
  const and: Prisma.WaContactWhereInput[] = []
  if (f.deviceIds) and.push({ deviceId: { in: f.deviceIds } })
  if (f.source === 'addressBook') and.push({ inAddressBook: true })
  if (f.source === 'chats') {
    and.push({ hasChat: true })
    if (f.chattedSince) and.push({ lastChatAt: { gte: f.chattedSince } })
  }
  if (f.onlyNamed) and.push({ name: { not: null } }, { NOT: { name: '' } })
  if (search !== '') {
    and.push({
      OR: [
        { name: { contains: search } },
        ...(/^\d+$/.test(digits) ? [{ phone: { contains: digits } }] : []),
      ],
    })
  }
  return { AND: and }
}

/** Cursor for the composite (deviceId, jid) key; neither part contains a NUL. */
export function encodeWaCursor(deviceId: string, jid: string): string {
  return `${deviceId}\u0000${jid}`
}

export function decodeWaCursor(cursor: string): { deviceId: string; jid: string } | null {
  const [deviceId, jid] = cursor.split('\u0000')
  return deviceId && jid ? { deviceId, jid } : null
}

export interface WaExportResult {
  listId: string
  imported: number
  skipped: number
  /** Imported numbers that are on the opt-out list (skipped at send time). */
  suppressed: number
}

const PAGE = 1_000

interface Row {
  phone: string
  name: string
}

/**
 * Copy the matching numbers of the chosen devices into a new contact list.
 *
 * Read in phone order so the same number synced by two phones arrives as
 * adjacent rows: one copy is kept (with the first name any copy has) and the
 * rest count as skipped, without holding every number in memory to dedupe.
 *
 * NOTE: opted-out numbers are imported, not dropped. The opt-out list is
 * enforced at send time for every list, so dropping them here would add
 * nothing — and the user would lose sight of who they are.
 */
export async function exportWaContacts(
  filter: WaContactFilter & { deviceIds: string[] },
  listName: string,
): Promise<WaExportResult> {
  const prisma = getPrisma()
  const where = waContactWhere(filter)
  const list = await prisma.contactList.create({
    data: { name: listName, fields: JSON.stringify(['Name', 'Mobile']) },
  })

  let imported = 0
  let skipped = 0
  let suppressed = 0
  let pending: Row | null = null
  let batch: Row[] = []

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return
    const rows = batch
    batch = []
    suppressed += (await suppressedPhones(rows.map((r) => r.phone))).size
    await prisma.$transaction([
      prisma.contact.createMany({
        data: rows.map((r) => ({
          listId: list.id,
          name: r.name,
          phone: r.phone,
          data: JSON.stringify({ Name: r.name, Mobile: r.phone }),
        })),
      }),
    ])
    imported += rows.length
  }

  const keep = async (row: Row): Promise<void> => {
    batch.push(row)
    if (batch.length >= PAGE) await flush()
  }

  try {
    let cursor: { deviceId: string; jid: string } | undefined
    for (;;) {
      const page = await prisma.waContact.findMany({
        where,
        orderBy: [{ phone: 'asc' }, { deviceId: 'asc' }, { jid: 'asc' }],
        select: { deviceId: true, jid: true, phone: true, name: true },
        take: PAGE,
        ...(cursor ? { cursor: { deviceId_jid: cursor }, skip: 1 } : {}),
      })
      for (const row of page) {
        const normalized = normalizePhone(row.phone)
        if (!normalized.valid || !normalized.e164) {
          skipped += 1
          continue
        }
        const name = row.name?.trim() ?? ''
        if (pending && pending.phone === normalized.e164) {
          skipped += 1
          if (!pending.name && name) pending.name = name
          continue
        }
        if (pending) await keep(pending)
        pending = { phone: normalized.e164, name }
      }
      const last = page[page.length - 1]
      if (page.length < PAGE || !last) break
      cursor = { deviceId: last.deviceId, jid: last.jid }
    }
    if (pending) await keep(pending)
    await flush()
  } catch (err) {
    // A half-filled list would look like a finished import; remove it so the
    // user can simply try again with the same name.
    await prisma.contactList.delete({ where: { id: list.id } })
    throw err
  }

  await prisma.contactList.update({
    where: { id: list.id },
    data: { contactCount: imported },
  })
  return { listId: list.id, imported, skipped, suppressed }
}
