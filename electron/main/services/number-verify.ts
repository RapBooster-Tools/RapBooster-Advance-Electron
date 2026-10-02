/**
 * "Is this number on WhatsApp?" checks for a contact list (D89).
 *
 * Sending to numbers that are not on WhatsApp is wasted throughput at best and
 * a ban signal at worst — a high rate of undeliverable sends is one of the
 * patterns WhatsApp flags. Checking first lets campaigns skip them.
 *
 * The check runs in the background and reports through
 * `contacts:verifyProgress`; the renderer never polls (CLAUDE.md §2.7). The
 * lookups themselves are rate-limited inside wa-service, so this module only
 * batches and persists.
 */
import { AppError } from '../../../shared/errors'
import { getPrisma } from '../db/client'
import { waBridge } from '../wa-bridge'
import { notify } from './notify'

/** Small batches keep each lookup short and the progress bar moving. */
const CHECK_BATCH = 50

/** One job per list: two concurrent checks would double the lookups for nothing. */
const running = new Set<string>()

interface Job {
  listId: string
  deviceId: string
  recheck: boolean
  total: number
}

export function isVerifying(listId: string): boolean {
  return running.has(listId)
}

export async function startVerification(req: {
  listId: string
  deviceId: string
  recheck: boolean
}): Promise<{ total: number }> {
  const prisma = getPrisma()
  if (running.has(req.listId)) {
    throw new AppError('CONFLICT', {
      userMessage: 'Numbers in this list are already being checked.',
    })
  }

  const list = await prisma.contactList.findUnique({ where: { id: req.listId } })
  if (!list) {
    throw new AppError('NOT_FOUND', {
      userMessage: 'That contact list no longer exists.',
    })
  }
  const device = await prisma.device.findUnique({ where: { id: req.deviceId } })
  if (!device) {
    throw new AppError('NOT_FOUND', { userMessage: 'That device no longer exists.' })
  }
  if (device.status !== 'connected') {
    throw new AppError('DEVICE_NOT_CONNECTED', {
      userMessage: `Connect "${device.name}" before checking numbers with it.`,
    })
  }

  const total = await prisma.contact.count({ where: scope(req.listId, req.recheck) })
  running.add(req.listId)
  void run({ ...req, total }).finally(() => running.delete(req.listId))
  return { total }
}

function scope(listId: string, recheck: boolean) {
  return { listId, ...(recheck ? {} : { waStatus: 'unknown' }) }
}

async function run(job: Job): Promise<void> {
  const prisma = getPrisma()
  const progress = { checked: 0, valid: 0, invalid: 0 }
  const report = (done: boolean, error: string | null) =>
    notify('contacts:verifyProgress', {
      listId: job.listId,
      total: job.total,
      ...progress,
      done,
      error,
    })

  let lastId: string | undefined
  try {
    for (;;) {
      // Keyed on id rather than a Prisma cursor: rows leave the "unknown"
      // filter as soon as they are checked, so a cursor row could vanish from
      // the result set under its own feet.
      const batch = await prisma.contact.findMany({
        where: {
          ...scope(job.listId, job.recheck),
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        select: { id: true, phone: true },
        take: CHECK_BATCH,
      })
      if (batch.length === 0) break
      lastId = batch[batch.length - 1]?.id

      const { results } = await waBridge.request('number:check', {
        deviceId: job.deviceId,
        phones: batch.map((c) => c.phone),
      })
      const exists = new Map(results.map((r) => [r.phone, r.exists]))
      const validIds = batch.filter((c) => exists.get(c.phone) === true).map((c) => c.id)
      const invalidIds = batch
        .filter((c) => exists.get(c.phone) === false)
        .map((c) => c.id)

      const now = new Date()
      await prisma.$transaction([
        prisma.contact.updateMany({
          where: { id: { in: validIds } },
          data: { waStatus: 'valid', waCheckedAt: now },
        }),
        prisma.contact.updateMany({
          where: { id: { in: invalidIds } },
          data: { waStatus: 'invalid', waCheckedAt: now },
        }),
      ])

      progress.checked += batch.length
      progress.valid += validIds.length
      progress.invalid += invalidIds.length
      report(false, null)
      if (batch.length < CHECK_BATCH) break
    }
    console.info(
      `number check finished: ${progress.checked} checked, ${progress.invalid} not on WhatsApp`,
    )
    report(true, null)
  } catch (err) {
    console.error(
      'number check stopped',
      err instanceof Error ? err.message : String(err),
    )
    const device = await prisma.device
      .findUnique({ where: { id: job.deviceId }, select: { status: true } })
      .catch((lookupErr: unknown) => {
        console.debug('number check: device lookup after failure failed', lookupErr)
        return null
      })
    report(
      true,
      device?.status === 'connected'
        ? 'The check stopped because WhatsApp did not answer. Numbers checked so far are saved.'
        : 'The device disconnected before the check finished. Numbers checked so far are saved.',
    )
  }
}
