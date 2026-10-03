/**
 * Campaign channels.
 *
 * Counters returned here always come from `CampaignRecipient` rows rather than
 * the denormalized columns, so the UI cannot show a stale total after a crash.
 */
import { createWriteStream, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '../../../shared/errors'
import { getPrisma } from '../db/client'
import { userDataDir } from '../db/paths'
import { campaignEngine, counters } from '../services/campaign-engine'
import { toCsvValue as csv } from '../services/csv'
import { registerHandler } from './router'
import {
  effectiveCap,
  isStaleDay,
  readSendingDefaults,
  warmupCap,
  warmupDay,
} from '../services/sending-policy'

/** Delivery, read and reply counts — SQL aggregates, never in-memory counters. */
async function engagement(campaignId: string) {
  const prisma = getPrisma()
  const [skipped, delivered, read, replied] = await Promise.all([
    prisma.campaignRecipient.count({ where: { campaignId, status: 'skipped' } }),
    // Read implies delivered: a receipt for "read" can arrive without the
    // "delivered" one before it.
    prisma.campaignRecipient.count({
      where: {
        campaignId,
        OR: [{ deliveredAt: { not: null } }, { readAt: { not: null } }],
      },
    }),
    prisma.campaignRecipient.count({ where: { campaignId, readAt: { not: null } } }),
    prisma.campaignRecipient.count({ where: { campaignId, repliedAt: { not: null } } }),
  ])
  return { skipped, delivered, read, replied }
}

async function serialize(id: string) {
  const campaign = await getPrisma().campaign.findUnique({
    where: { id },
    include: { devices: true, lists: true, tags: true, template: true },
  })
  if (!campaign)
    throw new AppError('NOT_FOUND', { userMessage: 'That campaign no longer exists.' })

  const c = await counters(id)
  const e = await engagement(id)

  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status as
      'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed',
    templateId: campaign.templateId,
    templateName: campaign.template.name,
    deviceIds: campaign.devices.map((d) => d.deviceId),
    listIds: campaign.lists.map((l) => l.listId),
    scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
    delayFrom: campaign.delayFrom,
    delayTo: campaign.delayTo,
    sleepDuration: campaign.sleepDuration,
    sleepAfter: campaign.sleepAfter,
    totalCount: c.total || campaign.totalCount,
    sentCount: c.sent,
    failedCount: c.failed,
    createdAt: campaign.createdAt.toISOString(),
    includeTagIds: campaign.tags.filter((t) => t.mode === 'include').map((t) => t.tagId),
    excludeTagIds: campaign.tags.filter((t) => t.mode === 'exclude').map((t) => t.tagId),
    checkNumbers: campaign.checkNumbers,
    skippedCount: e.skipped,
    deliveredCount: e.delivered,
    readCount: e.read,
    repliedCount: e.replied,
  }
}

/** Local-midnight boundaries for the last `days` days, oldest first. */
function dayRanges(days: number): Array<{ date: string; from: Date; to: Date }> {
  const out: Array<{ date: string; from: Date; to: Date }> = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i -= 1) {
    const from = new Date(today)
    from.setDate(today.getDate() - i)
    const to = new Date(from)
    to.setDate(from.getDate() + 1)
    const date = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(
      from.getDate(),
    ).padStart(2, '0')}`
    out.push({ date, from, to })
  }
  return out
}

export function registerCampaignHandlers(): void {
  // Seven days of campaign outcomes, from recipient rows (D89, Phase 3).
  registerHandler('system:analytics', async () => {
    const prisma = getPrisma()
    const days = await Promise.all(
      dayRanges(7).map(async ({ date, from, to }) => {
        const inDay = { gte: from, lt: to }
        const [sent, failed, delivered, read, replied] = await Promise.all([
          prisma.campaignRecipient.count({ where: { status: 'sent', sentAt: inDay } }),
          prisma.campaignRecipient.count({ where: { status: 'failed', sentAt: inDay } }),
          prisma.campaignRecipient.count({ where: { deliveredAt: inDay } }),
          prisma.campaignRecipient.count({ where: { readAt: inDay } }),
          prisma.campaignRecipient.count({ where: { repliedAt: inDay } }),
        ])
        return { date, sent, failed, delivered, read, replied }
      }),
    )

    const defaults = await readSendingDefaults()
    const now = new Date()
    const deviceRows = await prisma.device.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 50,
    })
    const devices = deviceRows.map((d) => ({
      deviceId: d.id,
      name: d.name,
      sentToday: isStaleDay(d.dailyCountResetAt) ? 0 : d.dailySentCount,
      cap: effectiveCap(defaults.dailyCapPerDevice, d),
      warmupCap: warmupCap(warmupDay(d)),
      healthPausedUntil:
        d.healthPausedUntil && d.healthPausedUntil > now
          ? d.healthPausedUntil.toISOString()
          : null,
    }))

    const [repliesAwaiting, escalated] = await Promise.all([
      prisma.aiDraft.count({ where: { status: { in: ['pending_approval', 'held'] } } }),
      prisma.chat.count({ where: { isEscalated: true } }),
    ])

    return { days, devices, repliesAwaiting, escalated }
  })

  registerHandler('campaign:list', async () => {
    const rows = await getPrisma().campaign.findMany({ orderBy: { createdAt: 'desc' } })
    return Promise.all(rows.map((r) => serialize(r.id)))
  })

  registerHandler('campaign:get', async ({ id }) => serialize(id))

  registerHandler('campaign:create', async (input) => {
    const name = input.name.trim()
    if (name === '') {
      throw new AppError('VALIDATION_FAILED', { userMessage: 'Fill all required fields' })
    }

    // Mirrors the prototype's validation message. An audience can now come from
    // lists, included tags, or both (D89).
    if (
      input.deviceIds.length === 0 ||
      (input.listIds.length === 0 && input.includeTagIds.length === 0)
    ) {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'Select at least one device and contact list',
      })
    }
    if (input.includeTagIds.some((t) => input.excludeTagIds.includes(t))) {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'A tag cannot be both included and excluded.',
      })
    }

    const template = await getPrisma().template.findUnique({
      where: { id: input.templateId },
    })
    if (!template) {
      throw new AppError('NOT_FOUND', { userMessage: 'That template no longer exists.' })
    }

    const created = await getPrisma().campaign.create({
      data: {
        name,
        templateId: input.templateId,
        status: input.scheduledAt ? 'scheduled' : 'draft',
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        delayFrom: input.delayFrom,
        delayTo: input.delayTo,
        sleepDuration: input.sleepDuration,
        sleepAfter: input.sleepAfter,
        checkNumbers: input.checkNumbers,
        devices: { create: input.deviceIds.map((deviceId) => ({ deviceId })) },
        lists: { create: input.listIds.map((listId) => ({ listId })) },
        tags: {
          create: [
            ...input.includeTagIds.map((tagId) => ({ tagId, mode: 'include' })),
            ...input.excludeTagIds.map((tagId) => ({ tagId, mode: 'exclude' })),
          ],
        },
      },
    })

    return serialize(created.id)
  })

  // Same audience, template and pacing; a fresh draft with no recipients yet.
  registerHandler('campaign:duplicate', async ({ id, name }) => {
    const source = await getPrisma().campaign.findUnique({
      where: { id },
      include: { devices: true, lists: true, tags: true },
    })
    if (!source) {
      throw new AppError('NOT_FOUND', { userMessage: 'That campaign no longer exists.' })
    }
    const copy = await getPrisma().campaign.create({
      data: {
        name: name ?? `${source.name} (copy)`,
        templateId: source.templateId,
        status: 'draft',
        delayFrom: source.delayFrom,
        delayTo: source.delayTo,
        sleepDuration: source.sleepDuration,
        sleepAfter: source.sleepAfter,
        retryAttempts: source.retryAttempts,
        checkNumbers: source.checkNumbers,
        devices: { create: source.devices.map((d) => ({ deviceId: d.deviceId })) },
        lists: { create: source.lists.map((l) => ({ listId: l.listId })) },
        tags: { create: source.tags.map((t) => ({ tagId: t.tagId, mode: t.mode })) },
      },
    })
    return { id: copy.id }
  })

  registerHandler('campaign:start', async ({ id }) => {
    await campaignEngine.start(id)
    return { ok: true as const }
  })

  registerHandler('campaign:pause', async ({ id }) => {
    await campaignEngine.pause(id)
    return { ok: true as const }
  })

  registerHandler('campaign:resume', async ({ id }) => {
    await campaignEngine.start(id)
    return { ok: true as const }
  })

  registerHandler('campaign:stop', async ({ id }) => {
    await campaignEngine.stop(id)
    return { ok: true as const }
  })

  registerHandler('campaign:delete', async ({ id }) => {
    // Stopping first prevents a worker from writing rows back after deletion.
    await campaignEngine.stop(id).catch(() => {
      // A campaign that was never started has nothing to stop.
    })
    await getPrisma().campaign.delete({ where: { id } })
    return { ok: true as const }
  })

  registerHandler('campaign:report', async ({ id }) => {
    const campaign = await getPrisma().campaign.findUnique({
      where: { id },
      include: { template: true },
    })
    if (!campaign) {
      throw new AppError('NOT_FOUND', { userMessage: 'That campaign no longer exists.' })
    }

    const exportsDir = join(userDataDir(), 'exports')
    mkdirSync(exportsDir, { recursive: true })
    const filePath = join(
      exportsDir,
      `${campaign.name.replace(/[^\w\-. ]+/g, '_')}-report-${Date.now()}.csv`,
    )

    const c = await counters(id)
    const e = await engagement(id)

    // One row per recipient (REQUIREMENTS §7.2, assumption A9) rather than the
    // prototype's plain-text summary: a summary cannot tell the user *which*
    // numbers failed, which is the only actionable part of a report.
    const stream = createWriteStream(filePath, { encoding: 'utf8' })
    let rows = 0

    try {
      stream.write(`# Campaign,${csv(campaign.name)}\n`)
      stream.write(`# Status,${csv(campaign.status)}\n`)
      stream.write(`# Template,${csv(campaign.template.name)}\n`)
      stream.write(`# Total,${c.total}\n`)
      stream.write(`# Sent,${c.sent}\n`)
      stream.write(`# Failed,${c.failed}\n`)
      stream.write(`# Skipped,${e.skipped}\n`)
      stream.write(`# Delivered,${e.delivered}\n`)
      stream.write(`# Read,${e.read}\n`)
      stream.write(`# Replied,${e.replied}\n`)
      stream.write(`# Generated,${new Date().toISOString()}\n`)
      stream.write(
        'phone,name,device,status,attempts,sentAt,deliveredAt,readAt,repliedAt,error\n',
      )

      let cursor: string | undefined
      for (;;) {
        const page = await getPrisma().campaignRecipient.findMany({
          where: { campaignId: id },
          orderBy: { id: 'asc' },
          take: 1_001,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          include: {
            contact: { select: { name: true } },
            device: { select: { name: true } },
          },
        })
        if (page.length === 0) break

        const hasMore = page.length > 1_000
        const slice = hasMore ? page.slice(0, 1_000) : page

        for (const r of slice) {
          stream.write(
            [
              csv(r.phone),
              csv(r.contact?.name ?? ''),
              csv(r.device?.name ?? ''),
              csv(r.status),
              String(r.attempts),
              csv(r.sentAt?.toISOString() ?? ''),
              csv(r.deliveredAt?.toISOString() ?? ''),
              csv(r.readAt?.toISOString() ?? ''),
              csv(r.repliedAt?.toISOString() ?? ''),
              csv(r.error ?? ''),
            ].join(',') + '\n',
          )
          rows += 1
        }

        if (!hasMore) break
        cursor = slice[slice.length - 1]?.id
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        stream.on('error', reject)
        stream.on('finish', () => resolve())
        stream.end()
      })
    }

    return { filePath, rows }
  })

  registerHandler('campaign:recipients', async ({ id, status, cursor, limit }) => {
    const where = { campaignId: id, ...(status ? { status } : {}) }

    const [rows, total] = await Promise.all([
      getPrisma().campaignRecipient.findMany({
        where,
        orderBy: { id: 'asc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { contact: { select: { name: true } } },
      }),
      getPrisma().campaignRecipient.count({ where }),
    ])

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    return {
      items: page.map((r) => ({
        id: r.id,
        phone: r.phone,
        contactName: r.contact?.name ?? '',
        deviceId: r.deviceId,
        status: r.status as 'pending' | 'sending' | 'sent' | 'failed' | 'skipped',
        attempts: r.attempts,
        error: r.error,
        sentAt: r.sentAt?.toISOString() ?? null,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
        readAt: r.readAt?.toISOString() ?? null,
        repliedAt: r.repliedAt?.toISOString() ?? null,
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      total,
    }
  })
}
