/**
 * Enrolling an audience into a drip sequence.
 *
 * The audience is a union of lists, tags and hand-picked contacts, so the same
 * number can arrive several times (one person in two lists is two contacts).
 * Each number is enrolled once: a person must never receive the same
 * follow-up twice because they happen to be in two lists.
 */
import { AppError } from '../../../shared/errors'
import { getPrisma } from '../db/client'
import { suppressedPhones } from './optout'
import { parseDeviceIds } from './sequences'

const BATCH = 1_000

export interface Audience {
  listIds: string[]
  tagIds: string[]
  contactIds: string[]
}

export async function enrollAudience(
  sequenceId: string,
  audience: Audience,
): Promise<{ enrolled: number; skipped: number }> {
  const prisma = getPrisma()
  const sequence = await prisma.sequence.findUnique({
    where: { id: sequenceId },
    select: {
      status: true,
      deviceIds: true,
      steps: { orderBy: { position: 'asc' }, take: 1, select: { delayMinutes: true } },
    },
  })
  if (!sequence) throw new AppError('NOT_FOUND', { detail: `sequence ${sequenceId}` })
  if (sequence.status === 'archived') {
    throw new AppError('CONFLICT', {
      userMessage: 'This sequence is archived. Restore it before enrolling contacts.',
    })
  }

  const deviceIds = parseDeviceIds(sequence.deviceIds)
  const firstStep = sequence.steps[0]
  if (deviceIds.length === 0 || !firstStep) {
    throw new AppError('VALIDATION_FAILED', {
      userMessage: 'Give the sequence at least one device and one step first.',
    })
  }

  const { listIds, tagIds, contactIds } = audience
  const sources = [
    ...(listIds.length > 0 ? [{ listId: { in: listIds } }] : []),
    ...(tagIds.length > 0 ? [{ tags: { some: { tagId: { in: tagIds } } } }] : []),
    ...(contactIds.length > 0 ? [{ id: { in: contactIds } }] : []),
  ]
  if (sources.length === 0) {
    throw new AppError('VALIDATION_FAILED', {
      userMessage: 'Pick at least one list, tag or contact to enroll.',
    })
  }
  const where = { isValid: true, OR: sources }

  const nextRunAt = new Date(Date.now() + firstStep.delayMinutes * 60_000)
  // Continue the rotation from where earlier enrollments left off, so several
  // small enrollments still spread across every device.
  let turn = await prisma.sequenceEnrollment.count({ where: { sequenceId } })
  const seen = new Set<string>()
  let enrolled = 0
  let skipped = 0
  let cursor: string | undefined

  for (;;) {
    const page = await prisma.contact.findMany({
      where,
      select: { id: true, phone: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (page.length === 0) break
    cursor = page[page.length - 1]?.id

    const fresh = page.filter((c) => {
      if (seen.has(c.phone)) return false
      seen.add(c.phone)
      return true
    })
    const phones = fresh.map((c) => c.phone)
    const [suppressed, already] = await Promise.all([
      suppressedPhones(phones),
      prisma.sequenceEnrollment.findMany({
        // By contact as well as by phone: a contact whose number was edited
        // since it was enrolled would otherwise hit the unique constraint.
        where: {
          sequenceId,
          OR: [{ phone: { in: phones } }, { contactId: { in: fresh.map((c) => c.id) } }],
        },
        select: { phone: true, contactId: true },
        take: BATCH * 2,
      }),
    ])
    const enrolledPhones = new Set(already.map((e) => e.phone))
    const enrolledContacts = new Set(already.map((e) => e.contactId))
    const rows = fresh
      .filter(
        (c) =>
          !suppressed.has(c.phone) &&
          !enrolledPhones.has(c.phone) &&
          !enrolledContacts.has(c.id),
      )
      .map((c) => ({
        sequenceId,
        contactId: c.id,
        phone: c.phone,
        deviceId: deviceIds[turn++ % deviceIds.length] ?? null,
        nextStep: 0,
        nextRunAt,
        status: 'active',
      }))

    if (rows.length > 0) {
      await prisma.$transaction([prisma.sequenceEnrollment.createMany({ data: rows })])
    }
    enrolled += rows.length
    skipped += page.length - rows.length
    if (page.length < BATCH) break
  }

  return { enrolled, skipped }
}
