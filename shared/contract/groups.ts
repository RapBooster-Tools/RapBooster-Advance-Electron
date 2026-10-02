/**
 * Group power tools, member grabber and communities (D89).
 */
import { z } from 'zod'
import { groupMemberAction } from '../types'
import { e164, id, ok } from './common'

export const groupMember = z.object({
  jid: z.string(),
  phone: z.string(),
  isAdmin: z.boolean(),
})

export const joinRequest = z.object({
  jid: z.string(),
  phone: z.string(),
  requestedAt: z.string().nullable(),
})

export const memberResult = z.object({
  phone: z.string(),
  ok: z.boolean(),
  error: z.string().nullable(),
})

export const community = z.object({
  id,
  deviceId: id,
  name: z.string(),
  linkedGroupIds: z.array(id),
})

/** A whatsapp.com invite link or the bare code. */
const inviteKey = z.string().trim().min(4).max(200)

export const groupChannels = {
  'group:inviteLink': {
    request: z.object({ groupId: id }),
    response: z.object({ code: z.string(), url: z.string() }),
  },
  'group:revokeInvite': {
    request: z.object({ groupId: id }),
    response: z.object({ code: z.string(), url: z.string() }),
  },
  'group:join': {
    request: z.object({ deviceId: id, invite: inviteKey }),
    response: z.object({ groupId: id }),
  },
  'group:updateSettings': {
    request: z.object({
      groupId: id,
      announce: z.boolean().optional(),
      restrict: z.boolean().optional(),
      joinApproval: z.boolean().optional(),
      description: z.string().max(2048).optional(),
    }),
    response: ok,
  },
  'group:members': {
    request: z.object({ groupId: id }),
    response: z.array(groupMember),
  },
  /** Members by phone, or every contact of a list (capped by `max`). */
  'group:updateMembers': {
    request: z.object({
      groupId: id,
      action: groupMemberAction,
      phones: z.array(e164).max(1024).default([]),
      listId: id.optional(),
      max: z.number().int().min(1).max(1024).default(256),
    }),
    response: z.object({ results: z.array(memberResult) }),
  },
  'group:joinRequests': {
    request: z.object({ groupId: id }),
    response: z.array(joinRequest),
  },
  'group:handleJoinRequests': {
    request: z.object({
      groupId: id,
      jids: z.array(z.string().min(1)).min(1).max(256),
      action: z.enum(['approve', 'reject']),
    }),
    response: z.object({
      approved: z.number().int().min(0),
      failed: z.number().int().min(0),
    }),
  },
  /** The grabber: export members of the chosen groups into a contact list. */
  'group:exportMembers': {
    request: z.object({
      groupIds: z.array(id).min(1).max(100),
      listName: z.string().trim().min(1).max(100),
    }),
    response: z.object({
      listId: id,
      imported: z.number().int().min(0),
      skipped: z.number().int().min(0),
    }),
  },

  'community:list': {
    request: z.object({ deviceId: id.optional() }),
    response: z.array(community),
  },
  'community:create': {
    request: z.object({
      deviceId: id,
      name: z.string().trim().min(1).max(100),
      description: z.string().max(2048).default(''),
    }),
    response: community,
  },
  'community:linkGroup': {
    request: z.object({ communityId: id, groupId: id }),
    response: ok,
  },
  'community:unlinkGroup': {
    request: z.object({ communityId: id, groupId: id }),
    response: ok,
  },
  'community:createGroup': {
    request: z.object({
      communityId: id,
      name: z.string().trim().min(1).max(100),
      phones: z.array(e164).max(256).default([]),
    }),
    response: z.object({ groupId: id }),
  },
} as const
