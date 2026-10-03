/**
 * Drip sequences (D89).
 *
 * Steps are replaced wholesale on every edit rather than diffed: a sequence
 * has at most 20 of them, and positions 0..n-1 stay contiguous by
 * construction, which is what the sender indexes enrollments by.
 */
import { AppError } from '../../../shared/errors'
import type { EnrollmentStatus, SequenceStatus } from '../../../shared/types'
import { getPrisma } from '../db/client'
import { enrollAudience } from '../services/sequence-enroll'
import { parseDeviceIds, reassignOrphans } from '../services/sequences'
import { notify } from '../services/notify'
import { registerHandler } from './router'

const UNENROLL_BATCH = 1_000

const WITH_STEPS = {
  steps: {
    orderBy: { position: 'asc' as const },
    include: { template: { select: { name: true } } },
  },
}

interface SequenceRow {
  id: string
  name: string
  status: string
  deviceIds: string
  stopOnReply: boolean
  createdAt: Date
  steps: Array<{
    id: string
    position: number
    templateId: string
    delayMinutes: number
    template: { name: string }
  }>
}

type Counts = { active: number; completed: number; stopped: number; failed: number }

/** Enrollment counts per sequence, aggregated in SQL rather than loaded. */
async function countsFor(ids: string[]): Promise<Map<string, Counts>> {
  const out = new Map<string, Counts>()
  if (ids.length === 0) return out
  const grouped = await getPrisma().sequenceEnrollment.groupBy({
    by: ['sequenceId', 'status'],
    where: { sequenceId: { in: ids } },
    _count: { _all: true },
  })
  for (const g of grouped) {
    const counts = out.get(g.sequenceId) ?? {
      active: 0,
      completed: 0,
      stopped: 0,
      failed: 0,
    }
    // `sending` is a moment inside `active`, not a state the user manages.
    const key = g.status === 'sending' ? 'active' : g.status
    if (key in counts) counts[key as keyof Counts] += g._count._all
    out.set(g.sequenceId, counts)
  }
  return out
}

function serialize(row: SequenceRow, counts: Counts | undefined) {
  return {
    id: row.id,
    name: row.name,
    status: row.status as SequenceStatus,
    deviceIds: parseDeviceIds(row.deviceIds),
    stopOnReply: row.stopOnReply,
    steps: row.steps.map((s) => ({
      id: s.id,
      position: s.position,
      templateId: s.templateId,
      templateName: s.template.name,
      delayMinutes: s.delayMinutes,
    })),
    counts: counts ?? { active: 0, completed: 0, stopped: 0, failed: 0 },
    createdAt: row.createdAt.toISOString(),
  }
}

async function load(id: string) {
  const row = await getPrisma().sequence.findUnique({
    where: { id },
    include: WITH_STEPS,
  })
  if (!row) throw new AppError('NOT_FOUND', { detail: `sequence ${id}` })
  return serialize(row, (await countsFor([id])).get(id))
}

async function assertDevices(deviceIds: string[]): Promise<void> {
  if (deviceIds.length === 0) {
    throw new AppError('VALIDATION_FAILED', {
      userMessage: 'Pick at least one device to send the sequence from.',
    })
  }
  const found = await getPrisma().device.count({
    where: { id: { in: deviceIds }, archivedAt: null },
  })
  if (found !== new Set(deviceIds).size) {
    throw new AppError('NOT_FOUND', {
      userMessage: 'One of the selected devices no longer exists.',
    })
  }
}

async function assertTemplates(templateIds: string[]): Promise<void> {
  const unique = [...new Set(templateIds)]
  const found = await getPrisma().template.count({ where: { id: { in: unique } } })
  if (found !== unique.length) {
    throw new AppError('NOT_FOUND', {
      userMessage: 'One of the selected templates no longer exists.',
    })
  }
}

function stepRows(steps: Array<{ templateId: string; delayMinutes: number }>) {
  return steps.map((s, position) => ({
    position,
    templateId: s.templateId,
    delayMinutes: s.delayMinutes,
  }))
}

export function registerSequenceHandlers(): void {
  registerHandler('sequence:list', async () => {
    const rows = await getPrisma().sequence.findMany({
      include: WITH_STEPS,
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    const counts = await countsFor(rows.map((r) => r.id))
    return rows.map((r) => serialize(r, counts.get(r.id)))
  })

  registerHandler('sequence:create', async ({ name, deviceIds, stopOnReply, steps }) => {
    await assertDevices(deviceIds)
    await assertTemplates(steps.map((s) => s.templateId))
    const row = await getPrisma().sequence.create({
      data: {
        name,
        deviceIds: JSON.stringify([...new Set(deviceIds)]),
        stopOnReply,
        steps: { create: stepRows(steps) },
      },
    })
    return load(row.id)
  })

  registerHandler(
    'sequence:update',
    async ({ id, name, status, deviceIds, stopOnReply, steps }) => {
      const prisma = getPrisma()
      const existing = await prisma.sequence.findUnique({
        where: { id },
        select: { id: true },
      })
      if (!existing) throw new AppError('NOT_FOUND', { detail: `sequence ${id}` })
      if (deviceIds) await assertDevices(deviceIds)
      if (steps) await assertTemplates(steps.map((s) => s.templateId))

      const devices = deviceIds ? [...new Set(deviceIds)] : undefined
      await prisma.$transaction([
        prisma.sequence.update({
          where: { id },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(status !== undefined ? { status } : {}),
            ...(stopOnReply !== undefined ? { stopOnReply } : {}),
            ...(devices ? { deviceIds: JSON.stringify(devices) } : {}),
          },
        }),
        ...(steps
          ? [
              prisma.sequenceStep.deleteMany({ where: { sequenceId: id } }),
              prisma.sequenceStep.createMany({
                data: stepRows(steps).map((s) => ({ ...s, sequenceId: id })),
              }),
            ]
          : []),
      ])
      if (devices) await reassignOrphans(id, devices)
      return load(id)
    },
  )

  registerHandler('sequence:delete', async ({ id }) => {
    // Enrollments and steps cascade with the sequence.
    const { count } = await getPrisma().sequence.deleteMany({ where: { id } })
    if (count === 0) throw new AppError('NOT_FOUND', { detail: `sequence ${id}` })
    return { ok: true as const }
  })

  registerHandler('sequence:enroll', async ({ id, listIds, tagIds, contactIds }) => {
    const result = await enrollAudience(id, { listIds, tagIds, contactIds })
    notify('sequence:changed', { sequenceId: id })
    return result
  })

  registerHandler('sequence:enrollments', async ({ id, status, cursor, limit }) => {
    const prisma = getPrisma()
    // A filter on `active` includes the rows mid-send, as the counts do.
    const where = {
      sequenceId: id,
      ...(status === 'active'
        ? { status: { in: ['active', 'sending'] } }
        : status
          ? { status }
          : {}),
    }
    const [rows, total] = await Promise.all([
      prisma.sequenceEnrollment.findMany({
        where,
        include: { contact: { select: { name: true } } },
        orderBy: { id: 'asc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.sequenceEnrollment.count({ where }),
    ])
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    return {
      items: page.map((r) => ({
        id: r.id,
        contactId: r.contactId,
        contactName: r.contact.name,
        phone: r.phone,
        nextStep: r.nextStep,
        nextRunAt: r.nextRunAt?.toISOString() ?? null,
        status: r.status as EnrollmentStatus,
        stoppedReason: r.stoppedReason,
        lastSentAt: r.lastSentAt?.toISOString() ?? null,
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      total,
    }
  })

  registerHandler('sequence:unenroll', async ({ enrollmentIds }) => {
    const prisma = getPrisma()
    const batches = []
    for (let i = 0; i < enrollmentIds.length; i += UNENROLL_BATCH) {
      batches.push(
        prisma.sequenceEnrollment.updateMany({
          // Finished rows keep their real outcome; only waiting ones are stopped.
          where: {
            id: { in: enrollmentIds.slice(i, i + UNENROLL_BATCH) },
            status: { in: ['active', 'sending'] },
          },
          data: { status: 'stopped', stoppedReason: 'Removed', nextRunAt: null },
        }),
      )
    }
    await prisma.$transaction(batches)
    const touched = await prisma.sequenceEnrollment.findMany({
      where: { id: { in: enrollmentIds.slice(0, 1_000) } },
      select: { sequenceId: true },
      distinct: ['sequenceId'],
    })
    for (const { sequenceId } of touched) notify('sequence:changed', { sequenceId })
    return { ok: true as const }
  })
}
