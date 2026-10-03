/**
 * Status updates and WhatsApp Channels (D89). Channel bookkeeping lives in
 * broadcast-channels.ts; this module owns posts.
 *
 * Posts are rows in `ScheduledPost`, delivered by services/post-scheduler.ts —
 * "post now" is the same row with `scheduledAt` = now, so there is one
 * delivery path to audit.
 */
import { randomUUID } from 'node:crypto'
import { copyFileSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Channel, Device, ScheduledPost } from '../../../generated/prisma/client'
import { AppError } from '../../../shared/errors'
import type { IpcResponse } from '../../../shared/ipc'
import type { PostKind, PostStatus, PostTarget } from '../../../shared/types'
import { getPrisma } from '../db/client'
import { mediaDir } from '../db/paths'
import { assertMediaAllowed } from '../services/media-policy'
import { notify } from '../services/notify'
import { processPost } from '../services/post-scheduler'
import { registerChannelHandlers } from './broadcast-channels'
import { registerHandler } from './router'

const LIST_LIMIT = 500

type PostDto = IpcResponse<'post:list'>[number]

function serializePost(
  p: ScheduledPost & {
    device: Pick<Device, 'name'>
    channel: Pick<Channel, 'name'> | null
  },
): PostDto {
  let listIds: string[] = []
  try {
    const parsed: unknown = JSON.parse(p.listIds)
    if (Array.isArray(parsed)) listIds = parsed.filter((v) => typeof v === 'string')
  } catch (err) {
    // Display only: the scheduler refuses to post an unreadable audience.
    console.debug(`post ${p.id}: unreadable listIds`, err)
  }
  return {
    id: p.id,
    deviceId: p.deviceId,
    deviceName: p.device.name,
    target: p.target as PostTarget,
    channelId: p.channelId,
    channelName: p.channel?.name ?? null,
    kind: p.kind as PostKind,
    body: p.body,
    mediaPath: p.mediaPath,
    backgroundColor: p.backgroundColor,
    listIds,
    scheduledAt: p.scheduledAt.toISOString(),
    status: p.status as PostStatus,
    postedAt: p.postedAt?.toISOString() ?? null,
    error: p.error,
  }
}

const postInclude = {
  device: { select: { name: true } },
  channel: { select: { name: true } },
} as const

function registerPostHandlers(): void {
  registerHandler('post:list', async ({ target, status }) => {
    const rows = await getPrisma().scheduledPost.findMany({
      where: { ...(target ? { target } : {}), ...(status ? { status } : {}) },
      include: postInclude,
      orderBy: { scheduledAt: 'desc' },
      take: LIST_LIMIT,
    })
    return rows.map(serializePost)
  })

  registerHandler('post:create', async (input) => {
    const prisma = getPrisma()
    const body = input.body.trim()

    const device = await prisma.device.findUnique({ where: { id: input.deviceId } })
    if (!device) {
      throw new AppError('NOT_FOUND', { userMessage: 'That device no longer exists.' })
    }

    if (input.kind === 'text' && !body) {
      throw new AppError('VALIDATION_FAILED', { userMessage: 'Write something to post.' })
    }
    if (input.kind !== 'text') {
      if (!input.mediaSourcePath) {
        throw new AppError('VALIDATION_FAILED', {
          userMessage: `Choose the ${input.kind} to post.`,
        })
      }
      assertMediaAllowed(input.mediaSourcePath, input.kind)
    }

    let channelId: string | null = null
    if (input.target === 'channel') {
      const channel = input.channelId
        ? await prisma.channel.findUnique({ where: { id: input.channelId } })
        : null
      if (
        !channel ||
        channel.deviceId !== input.deviceId ||
        !['owner', 'admin'].includes(channel.role)
      ) {
        throw new AppError('VALIDATION_FAILED', {
          userMessage: 'Choose a channel this device owns or administers.',
        })
      }
      channelId = channel.id
    }

    const id = randomUUID()
    let mediaPath: string | null = null
    if (input.kind !== 'text' && input.mediaSourcePath) {
      // Copied into the managed store so a scheduled post still works after
      // the user moves or deletes the original.
      mediaPath = join(mediaDir('posts', id), basename(input.mediaSourcePath))
      try {
        copyFileSync(input.mediaSourcePath, mediaPath)
      } catch (err) {
        rmSync(mediaDir('posts', id), { recursive: true, force: true })
        throw new AppError('VALIDATION_FAILED', {
          userMessage: 'That media file could not be copied into the app.',
          detail: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date()
    let created: ScheduledPost
    try {
      created = await prisma.scheduledPost.create({
        data: {
          id,
          deviceId: input.deviceId,
          target: input.target,
          channelId,
          kind: input.kind,
          body,
          mediaPath,
          // Only a text status has a background; WhatsApp ignores it elsewhere.
          backgroundColor:
            input.target === 'status' && input.kind === 'text'
              ? (input.backgroundColor ?? null)
              : null,
          listIds: JSON.stringify(input.target === 'status' ? input.listIds : []),
          scheduledAt,
        },
      })
    } catch (err) {
      rmSync(mediaDir('posts', id), { recursive: true, force: true })
      throw err
    }
    notify('post:changed', { id, status: 'scheduled', error: null })

    if (created.scheduledAt <= new Date()) await processPost(id)

    const row = await prisma.scheduledPost.findUniqueOrThrow({
      where: { id },
      include: postInclude,
    })
    return serializePost(row)
  })

  registerHandler('post:cancel', async ({ id }) => {
    const prisma = getPrisma()
    const { count } = await prisma.scheduledPost.updateMany({
      where: { id, status: 'scheduled' },
      data: { status: 'cancelled' },
    })
    if (count === 0) {
      const exists = await prisma.scheduledPost.findUnique({ where: { id } })
      throw exists
        ? new AppError('CONFLICT', {
            userMessage: 'Only a post that is still scheduled can be cancelled.',
          })
        : new AppError('NOT_FOUND', { userMessage: 'That post no longer exists.' })
    }
    notify('post:changed', { id, status: 'cancelled', error: null })
    return { ok: true as const }
  })
}

export function registerBroadcastHandlers(): void {
  registerChannelHandlers()
  registerPostHandlers()
}
