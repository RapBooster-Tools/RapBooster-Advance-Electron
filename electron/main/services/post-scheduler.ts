/**
 * Status and channel posts whose time has come (D89).
 *
 * State lives in `ScheduledPost` rows, never in memory (CLAUDE.md §2.6): a
 * post is claimed by flipping `scheduled` → `posting` with the status in the
 * WHERE clause, so a scheduler tick and a "post now" racing for the same row
 * cannot both win, and a restart can rebuild everything from the table.
 *
 * Every post goes out through `wa-service`, where the throttle paces it like
 * any other send (CLAUDE.md §2.5) — a status update is traffic from the
 * account, and WhatsApp sees it that way.
 */
import type { ScheduledPost } from '../../../generated/prisma/client'
import type { PostStatus } from '../../../shared/types'
import type { WaStatusContent } from '../../../shared/wa-protocol'
import { getPrisma } from '../db/client'
import { waBridge } from '../wa-bridge'
import { notify } from './notify'
import { suppressedPhones } from './optout'
import { isParkingError, isStaleDay } from './sending-policy'

/** Bounds the device scan; the app links at most 20 (CLAUDE.md §1.1). */
const MAX_DEVICES = 50
const WAITING_FOR_DEVICE = 'Waiting for the device to connect'
const HEALTH_PAUSED = 'Device is paused after repeated failures'
/** WhatsApp needs an explicit status audience; beyond this it is not a status, it is a broadcast. */
export const MAX_STATUS_AUDIENCE = 10_000
const SUPPRESSION_BATCH = 1_000

/**
 * Posts this process is delivering right now. A `posting` row not in this set
 * was orphaned by a crash or restart and is returned to the queue.
 */
const inFlight = new Set<string>()

async function setStatus(
  id: string,
  status: PostStatus,
  data: { error?: string | null; messageId?: string; postedAt?: Date } = {},
): Promise<void> {
  const error = data.error ?? null
  await getPrisma().scheduledPost.update({
    where: { id },
    data: { status, ...data, error },
  })
  notify('post:changed', { id, status, error })
}

/**
 * Claim one post for delivery. True only for the caller that flipped it —
 * `updateMany` with the status condition is a compare-and-set in SQLite.
 *
 * WHY the id is reserved in `inFlight` before the write: the orphan sweep must
 * never see a freshly claimed row as abandoned in the gap before delivery
 * starts.
 */
async function claimPost(id: string): Promise<boolean> {
  if (inFlight.has(id)) return false
  inFlight.add(id)
  const { count } = await getPrisma()
    .scheduledPost.updateMany({
      where: { id, status: 'scheduled' },
      data: { status: 'posting', error: null },
    })
    .catch((err: unknown) => {
      inFlight.delete(id)
      throw err
    })
  if (count !== 1) {
    inFlight.delete(id)
    return false
  }
  notify('post:changed', { id, status: 'posting', error: null })
  return true
}

/**
 * Numbers allowed to view a status, as JIDs. Empty `listIds` means every
 * contact on file. Opted-out numbers never see it: a status is marketing too.
 */
export async function statusAudience(listIds: string[]): Promise<string[]> {
  const rows = await getPrisma().contact.findMany({
    where: {
      ...(listIds.length > 0 ? { listId: { in: listIds } } : {}),
      isValid: true,
      waStatus: { not: 'invalid' },
    },
    select: { phone: true },
    distinct: ['phone'],
    orderBy: { phone: 'asc' },
    take: MAX_STATUS_AUDIENCE,
  })
  const phones = rows.map((r) => r.phone)

  const blocked = new Set<string>()
  for (let i = 0; i < phones.length; i += SUPPRESSION_BATCH) {
    for (const p of await suppressedPhones(phones.slice(i, i + SUPPRESSION_BATCH))) {
      blocked.add(p)
    }
  }

  const jids = new Set<string>()
  for (const phone of phones) {
    if (blocked.has(phone)) continue
    const digits = phone.replace(/\D/g, '')
    if (digits) jids.add(`${digits}@s.whatsapp.net`)
  }
  return [...jids]
}

function contentOf(post: ScheduledPost): WaStatusContent {
  if (post.kind === 'text') {
    return {
      kind: 'text',
      body: post.body,
      ...(post.backgroundColor ? { backgroundColor: post.backgroundColor } : {}),
    }
  }
  return {
    kind: 'media',
    path: post.mediaPath ?? '',
    mediaType: post.kind === 'video' ? 'video' : 'image',
    ...(post.body ? { caption: post.body } : {}),
  }
}

function parseListIds(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []
  } catch (err) {
    // Written only by post:create as JSON, so this is corruption; treating it
    // as "everyone" would widen the audience, so the post fails instead.
    throw new Error(`stored audience is unreadable: ${String(err)}`, { cause: err })
  }
}

/**
 * NOTE: mirrors campaign-engine's counter so a restart seeds the throttle with
 * today's true total — posts count against the daily cap like any send.
 */
async function countSend(deviceId: string): Promise<void> {
  const prisma = getPrisma()
  const device = await prisma.device.findUnique({ where: { id: deviceId } })
  if (!device) return
  await prisma.device.update({
    where: { id: deviceId },
    data: isStaleDay(device.dailyCountResetAt)
      ? { dailySentCount: 1, dailyCountResetAt: new Date() }
      : { dailySentCount: { increment: 1 } },
  })
}

function isNotConnected(message: string): boolean {
  return message.includes('not connected') || message.includes('wa-service')
}

/** Deliver a post claimed by `claimPost`; every outcome ends in a status the UI can show. */
async function deliverClaimed(id: string): Promise<void> {
  try {
    const prisma = getPrisma()
    const post = await prisma.scheduledPost.findUnique({ where: { id } })
    if (!post || post.status !== 'posting') return

    const device = await prisma.device.findUnique({ where: { id: post.deviceId } })
    if (!device) return
    if (device.status !== 'connected') {
      await setStatus(id, 'scheduled', { error: WAITING_FOR_DEVICE })
      return
    }
    if (device.healthPausedUntil && device.healthPausedUntil > new Date()) {
      // Same breaker the campaign engine respects: posting from an account
      // WhatsApp is already restricting makes the restriction worse.
      await setStatus(id, 'scheduled', { error: HEALTH_PAUSED })
      return
    }

    try {
      let messageId: string
      if (post.target === 'channel') {
        if (!post.channelId) throw new Error('channel post has no channel')
        ;({ messageId } = await waBridge.request('channel:post', {
          deviceId: post.deviceId,
          channelId: post.channelId,
          message: contentOf(post),
        }))
      } else {
        const statusJidList = await statusAudience(parseListIds(post.listIds))
        if (statusJidList.length === 0) {
          throw new Error('No contacts in the selected audience can see this status')
        }
        ;({ messageId } = await waBridge.request('status:post', {
          deviceId: post.deviceId,
          message: contentOf(post),
          statusJidList,
        }))
      }

      await setStatus(id, 'posted', { messageId, postedAt: new Date() })
      await countSend(post.deviceId)
      console.info(`post ${id} posted to ${post.target}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (isParkingError(message)) {
        // Daily cap or quiet hours: the post never reached WhatsApp. It goes
        // back to the queue and the next tick tries again.
        await setStatus(id, 'scheduled', { error: message })
      } else if (isNotConnected(message)) {
        await setStatus(id, 'scheduled', { error: WAITING_FOR_DEVICE })
      } else {
        console.warn(`post ${id} failed: ${message}`)
        await setStatus(id, 'failed', { error: message })
      }
    }
  } finally {
    inFlight.delete(id)
  }
}

/** Return `posting` rows no live delivery owns — left behind by a crash. */
async function requeueOrphans(): Promise<void> {
  const prisma = getPrisma()
  const stuck = await prisma.scheduledPost.findMany({
    where: { status: 'posting' },
    select: { id: true },
    take: 100,
  })
  for (const { id } of stuck) {
    if (inFlight.has(id)) continue
    // NOTE: the accepted limitation of CLAUDE.md §5.5 applies — a crash after
    // WhatsApp accepted the post but before this row was written means it
    // posts once more.
    const { count } = await prisma.scheduledPost.updateMany({
      where: { id, status: 'posting' },
      data: { status: 'scheduled' },
    })
    if (count === 1) notify('post:changed', { id, status: 'scheduled', error: null })
  }
}

/**
 * Claim a post and start delivering it in the background. Returns whether this
 * caller won the claim.
 *
 * WHY not awaited: the throttle may hold a send for its configured delay or
 * sleep, and the scheduler runs its jobs one after another — awaiting here
 * would stall campaigns and sequences behind a status update.
 */
export async function processPost(id: string): Promise<boolean> {
  if (!(await claimPost(id))) return false
  void deliverClaimed(id).catch((err: unknown) => {
    console.error(`post ${id}: could not record the outcome`, err)
  })
  return true
}

/**
 * Due posts on a device that cannot post stay queued, but say why — a post
 * silently sitting at "scheduled" past its time reads as a bug.
 */
async function noteWaiting(deviceId: string, reason: string): Promise<void> {
  const prisma = getPrisma()
  const waiting = await prisma.scheduledPost.findMany({
    where: {
      deviceId,
      status: 'scheduled',
      scheduledAt: { lte: new Date() },
      OR: [{ error: null }, { error: { not: reason } }],
    },
    select: { id: true },
    take: 100,
  })
  for (const { id } of waiting) {
    const { count } = await prisma.scheduledPost.updateMany({
      where: { id, status: 'scheduled' },
      data: { error: reason },
    })
    if (count === 1) notify('post:changed', { id, status: 'scheduled', error: reason })
  }
}

/**
 * One post per device per tick, oldest first.
 *
 * WHY per device rather than the N oldest overall: a device that is offline,
 * paused or parked on its daily cap would otherwise keep the oldest rows
 * forever and starve every other device's posts. And since a device sends one
 * message at a time anyway (CLAUDE.md §5.4), claiming more than one would only
 * queue them inside the throttle.
 */
export async function postTick(): Promise<void> {
  await requeueOrphans()
  const prisma = getPrisma()
  const now = new Date()

  const busy = new Set(
    (
      await prisma.scheduledPost.findMany({
        where: { status: 'posting' },
        select: { deviceId: true },
        take: 500,
      })
    ).map((p) => p.deviceId),
  )
  const devices = await prisma.device.findMany({
    select: { id: true, status: true, healthPausedUntil: true },
    orderBy: { createdAt: 'asc' },
    take: MAX_DEVICES,
  })

  for (const device of devices) {
    if (device.status !== 'connected') {
      await noteWaiting(device.id, WAITING_FOR_DEVICE)
      continue
    }
    if (device.healthPausedUntil && device.healthPausedUntil > now) {
      await noteWaiting(device.id, HEALTH_PAUSED)
      continue
    }
    if (busy.has(device.id)) continue

    const next = await prisma.scheduledPost.findFirst({
      where: { deviceId: device.id, status: 'scheduled', scheduledAt: { lte: now } },
      orderBy: { scheduledAt: 'asc' },
      select: { id: true },
    })
    if (next) await processPost(next.id)
  }
}
