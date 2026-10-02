/**
 * Status (stories) and WhatsApp Channels, posted now or on a schedule (D89).
 */
import { z } from 'zod'
import { postKind, postStatus, postTarget } from '../types'
import { id, isoDate, nullableIso, ok } from './common'

export const channel = z.object({
  id,
  deviceId: id,
  name: z.string(),
  description: z.string().nullable(),
  role: z.string(),
  subscribers: z.number().int().min(0),
  inviteUrl: z.string().nullable(),
  syncedAt: isoDate,
})

export const scheduledPost = z.object({
  id,
  deviceId: id,
  deviceName: z.string(),
  target: postTarget,
  channelId: id.nullable(),
  channelName: z.string().nullable(),
  kind: postKind,
  body: z.string(),
  mediaPath: z.string().nullable(),
  backgroundColor: z.string().nullable(),
  listIds: z.array(id),
  scheduledAt: isoDate,
  status: postStatus,
  postedAt: nullableIso,
  error: z.string().nullable(),
})

export const broadcastChannels = {
  'channel:list': {
    request: z.object({ deviceId: id.optional() }),
    response: z.array(channel),
  },
  'channel:create': {
    request: z.object({
      deviceId: id,
      name: z.string().trim().min(1).max(100),
      description: z.string().max(2048).default(''),
    }),
    response: channel,
  },
  /** Invite link (whatsapp.com/channel/…), bare code, or newsletter JID. */
  'channel:follow': {
    request: z.object({ deviceId: id, invite: z.string().trim().min(4).max(300) }),
    response: channel,
  },
  'channel:delete': { request: z.object({ id }), response: ok },

  'post:list': {
    request: z.object({ target: postTarget.optional(), status: postStatus.optional() }),
    response: z.array(scheduledPost),
  },
  /** No `scheduledAt` means post now (still paced by the throttle). */
  'post:create': {
    request: z.object({
      deviceId: id,
      target: postTarget,
      channelId: id.optional(),
      kind: postKind,
      body: z.string().max(4096).default(''),
      mediaSourcePath: z.string().optional(),
      backgroundColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      listIds: z.array(id).default([]),
      scheduledAt: isoDate.optional(),
    }),
    response: scheduledPost,
  },
  'post:cancel': { request: z.object({ id }), response: ok },
} as const

export const broadcastEvents = {
  'post:changed': z.object({ id, status: postStatus, error: z.string().nullable() }),
} as const
