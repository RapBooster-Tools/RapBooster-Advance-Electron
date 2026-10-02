/**
 * Contact tags: CRUD and bulk assignment.
 *
 * Tags cut across lists, so a contact can be "VIP" whichever list it came
 * from, and a campaign can target a tag instead of a whole list.
 */
import { AppError } from '../../../../shared/errors'
import type { TagSource } from '../../../../shared/types'
import { getPrisma } from '../../db/client'
import { IMPORT_BATCH_SIZE } from '../../services/csv'
import { registerHandler } from '../router'

/** Distinct, readable on white and on the dark theme's surface. */
const PALETTE = [
  '#0078d4',
  '#107c10',
  '#d83b01',
  '#8764b8',
  '#c239b3',
  '#038387',
  '#ca5010',
]

/** A sane upper bound: a tag picker with more than this is unusable anyway. */
const MAX_TAGS = 1_000

function serializeTag(row: {
  id: string
  name: string
  color: string
  source: string
  createdAt: Date
  _count: { contacts: number }
}) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    source: row.source as TagSource,
    contactCount: row._count.contacts,
    createdAt: row.createdAt.toISOString(),
  }
}

const WITH_COUNT = { _count: { select: { contacts: true } } } as const

async function requireTag(id: string) {
  const tag = await getPrisma().tag.findUnique({ where: { id } })
  if (!tag) throw new AppError('NOT_FOUND', { userMessage: 'That tag no longer exists.' })
  return tag
}

async function assertNameFree(name: string, exceptId?: string): Promise<void> {
  const clash = await getPrisma().tag.findUnique({ where: { name } })
  if (clash && clash.id !== exceptId) {
    throw new AppError('CONFLICT', {
      userMessage: `A tag named "${name}" already exists.`,
    })
  }
}

/**
 * Link one batch of contact ids to a tag, skipping pairs that already exist
 * and ids that no longer resolve to a contact. Returns how many were linked.
 */
async function linkBatch(tagId: string, contactIds: string[]): Promise<number> {
  const prisma = getPrisma()
  return prisma.$transaction(async (tx) => {
    // SQLite has no skipDuplicates, so existing pairs are filtered first.
    const contacts = await tx.contact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true },
      // NOTE: no `take` — the IN list bounds the result, and Prisma can only split
      // an IN list past SQLite's parameter limit when the query has no `take`.
    })
    const linked = await tx.contactTag.findMany({
      where: { tagId, contactId: { in: contactIds } },
      select: { contactId: true },
      // NOTE: no `take` — the IN list bounds the result, and Prisma can only split
      // an IN list past SQLite's parameter limit when the query has no `take`.
    })
    const already = new Set(linked.map((l) => l.contactId))
    const fresh = contacts.map((c) => c.id).filter((id) => !already.has(id))
    if (fresh.length === 0) return 0
    const result = await tx.contactTag.createMany({
      data: fresh.map((contactId) => ({ contactId, tagId })),
    })
    return result.count
  })
}

export function registerTagHandlers(): void {
  registerHandler('tag:list', async () => {
    const rows = await getPrisma().tag.findMany({
      include: WITH_COUNT,
      orderBy: { name: 'asc' },
      take: MAX_TAGS,
    })
    return rows.map(serializeTag)
  })

  registerHandler('tag:create', async ({ name, color }) => {
    await assertNameFree(name)
    const count = await getPrisma().tag.count()
    const created = await getPrisma().tag.create({
      data: { name, color: color ?? PALETTE[count % PALETTE.length]!, source: 'manual' },
      include: WITH_COUNT,
    })
    return serializeTag(created)
  })

  registerHandler('tag:update', async ({ id, name, color }) => {
    await requireTag(id)
    if (name !== undefined) await assertNameFree(name, id)
    const updated = await getPrisma().tag.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(color !== undefined ? { color } : {}),
      },
      include: WITH_COUNT,
    })
    return serializeTag(updated)
  })

  registerHandler('tag:delete', async ({ id }) => {
    await requireTag(id)
    // ContactTag and CampaignTag rows cascade via the schema relation.
    await getPrisma().tag.delete({ where: { id } })
    return { ok: true as const }
  })

  registerHandler('tag:assign', async ({ tagId, contactIds, listId }) => {
    await requireTag(tagId)
    if (contactIds.length === 0 && !listId) {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'Choose the contacts or the list to tag.',
      })
    }

    let assigned = 0
    const unique = Array.from(new Set(contactIds))
    for (let i = 0; i < unique.length; i += IMPORT_BATCH_SIZE) {
      assigned += await linkBatch(tagId, unique.slice(i, i + IMPORT_BATCH_SIZE))
    }

    if (listId) {
      // Paged by id so a 50,000-contact list never sits in memory at once.
      let lastId: string | undefined
      for (;;) {
        const page = await getPrisma().contact.findMany({
          where: { listId, ...(lastId ? { id: { gt: lastId } } : {}) },
          orderBy: { id: 'asc' },
          select: { id: true },
          take: IMPORT_BATCH_SIZE,
        })
        if (page.length === 0) break
        lastId = page[page.length - 1]?.id
        assigned += await linkBatch(
          tagId,
          page.map((c) => c.id),
        )
        if (page.length < IMPORT_BATCH_SIZE) break
      }
    }
    return { assigned }
  })

  registerHandler('tag:unassign', async ({ tagId, contactIds }) => {
    await requireTag(tagId)
    const prisma = getPrisma()
    let removed = 0
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < contactIds.length; i += IMPORT_BATCH_SIZE) {
        const result = await tx.contactTag.deleteMany({
          where: { tagId, contactId: { in: contactIds.slice(i, i + IMPORT_BATCH_SIZE) } },
        })
        removed += result.count
      }
    })
    return { removed }
  })
}
