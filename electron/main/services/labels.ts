/**
 * WhatsApp Business labels mirrored as tags, and business-account detection.
 *
 * WHY mirror rather than read live: a label only exists on the phone that made
 * it, and a campaign audience is built from tags. Mirroring a label into a tag
 * (source 'wa_label') lets the user target "everyone labelled VIP on WhatsApp"
 * with the same filter they use for their own tags.
 */
import { getPrisma } from '../db/client'
import { waBridge } from '../wa-bridge'
import { notify } from './notify'

/**
 * WhatsApp Business's label colours, by the index the protocol sends. The app
 * shows them as tag colours, so they are approximations of the phone's
 * palette rather than an exact match.
 */
const LABEL_PALETTE = [
  '#ff9485',
  '#64c4ff',
  '#ffd429',
  '#dfaef0',
  '#99b6c1',
  '#55ccb3',
  '#ff9dff',
  '#d3a91d',
  '#6d7cce',
  '#d7e752',
  '#00d0e2',
  '#ffc5c7',
  '#93ceac',
  '#f74848',
  '#00a0f2',
  '#83e422',
  '#ffaf04',
  '#b5ebff',
  '#9ba6ff',
  '#9368cf',
] as const

const BATCH = 1_000

export function labelColour(index: number): string {
  const safe = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0
  return LABEL_PALETTE[safe % LABEL_PALETTE.length] ?? LABEL_PALETTE[0]
}

const waLabelKey = (deviceId: string, labelId: string): string => `${deviceId}:${labelId}`

/**
 * A tag name no other tag uses. Tag names are unique, and a user's own tag
 * must never be taken over by a label that happens to share its name, so the
 * label gets a "(WA)" suffix instead.
 */
async function freeTagName(base: string, ownId: string | null): Promise<string> {
  const prisma = getPrisma()
  const candidates = [base, `${base} (WA)`]
  for (let n = 2; n <= 20; n += 1) candidates.push(`${base} (WA ${n})`)
  for (const name of candidates) {
    const taken = await prisma.tag.findUnique({ where: { name }, select: { id: true } })
    if (!taken || taken.id === ownId) return name
  }
  return `${base} (WA ${Date.now().toString(36)})`
}

async function labelTag(deviceId: string, labelId: string) {
  return getPrisma().tag.findFirst({
    where: { source: 'wa_label', waLabelId: waLabelKey(deviceId, labelId) },
  })
}

export async function handleLabel(
  deviceId: string,
  label: { labelId: string; name: string; color: number; deleted: boolean },
): Promise<void> {
  const prisma = getPrisma()
  const existing = await labelTag(deviceId, label.labelId)

  if (label.deleted) {
    // ContactTag rows cascade, so the label disappears from every contact too.
    if (existing) await prisma.tag.delete({ where: { id: existing.id } })
    return
  }

  const base = label.name.trim() || `WhatsApp label ${label.labelId}`
  const name =
    existing && existing.name === base
      ? base
      : await freeTagName(base, existing?.id ?? null)
  const color = labelColour(label.color)

  if (existing) {
    await prisma.tag.update({ where: { id: existing.id }, data: { name, color } })
  } else {
    await prisma.tag.create({
      data: {
        name,
        color,
        source: 'wa_label',
        waLabelId: waLabelKey(deviceId, label.labelId),
      },
    })
  }
}

/** "9198…@s.whatsapp.net" or "9198…:12@s.whatsapp.net" -> "+9198…"; null otherwise. */
export function phoneFromChatJid(jid: string): string | null {
  const [user, server] = jid.split('@')
  // Groups, broadcasts and LID-addressed chats carry no phone number.
  if (server !== 's.whatsapp.net' && server !== 'c.us') return null
  const digits = (user ?? '').split(':')[0]?.replace(/\D/g, '') ?? ''
  return digits.length >= 6 ? `+${digits}` : null
}

export async function handleLabelAssociation(
  deviceId: string,
  association: { labelId: string; chatJid: string; action: 'add' | 'remove' },
): Promise<void> {
  const phone = phoneFromChatJid(association.chatJid)
  if (!phone) {
    console.debug('labels: association on a chat without a phone number, skipped')
    return
  }

  const prisma = getPrisma()
  let tag = await labelTag(deviceId, association.labelId)
  if (!tag) {
    if (association.action === 'remove') return
    // NOTE: WhatsApp does not promise to deliver the label before its first
    // association. A placeholder keeps the association; the label event that
    // follows renames and recolours it.
    tag = await prisma.tag.create({
      data: {
        name: await freeTagName(`WhatsApp label ${association.labelId}`, null),
        source: 'wa_label',
        waLabelId: waLabelKey(deviceId, association.labelId),
      },
    })
  }
  const tagId = tag.id

  // The same number can sit in several lists; the label belongs to the person,
  // so every copy of them gets it.
  let cursor: string | undefined
  for (;;) {
    const contacts = await prisma.contact.findMany({
      where: { phone },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })
    if (contacts.length === 0) break
    const ids = contacts.map((c) => c.id)

    if (association.action === 'remove') {
      await prisma.contactTag.deleteMany({ where: { tagId, contactId: { in: ids } } })
    } else {
      // Prisma's skipDuplicates is unavailable on SQLite, so filter first.
      await prisma.$transaction(async (tx) => {
        const have = await tx.contactTag.findMany({
          where: { tagId, contactId: { in: ids } },
          select: { contactId: true },
          take: BATCH,
        })
        const already = new Set(have.map((h) => h.contactId))
        const missing = ids.filter((id) => !already.has(id))
        if (missing.length > 0) {
          await tx.contactTag.createMany({
            data: missing.map((contactId) => ({ contactId, tagId })),
          })
        }
      })
    }

    if (contacts.length < BATCH) break
    cursor = ids[ids.length - 1]
  }
}

/** Ask WhatsApp whether the device is a Business account and store the answer. */
export async function refreshBusinessStatus(deviceId: string): Promise<void> {
  const { isBusiness } = await waBridge.request('business:profile', { deviceId })
  const prisma = getPrisma()
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { isBusiness: true },
  })
  if (!device || device.isBusiness === isBusiness) return
  await prisma.device.update({ where: { id: deviceId }, data: { isBusiness } })
  notify('device:updated', { deviceId })
}
