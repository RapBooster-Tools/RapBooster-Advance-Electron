/**
 * Keyword auto-replies, outgoing webhooks, drip sequences, call auto-reject,
 * warmup and analytics (D89).
 */
import { z } from 'zod'
import { enrollmentStatus, ruleMatchType, sequenceStatus, webhookEvent } from '../types'
import { cursor, id, isoDate, nullableIso, ok, page, pageLimit, patchOf } from './common'

export const keywordRule = z.object({
  id,
  name: z.string(),
  keywords: z.array(z.string()),
  matchType: ruleMatchType,
  replyText: z.string().nullable(),
  templateId: id.nullable(),
  deviceIds: z.array(id),
  enabled: z.boolean(),
  priority: z.number().int(),
  cooldownMinutes: z.number().int().min(0),
  hitCount: z.number().int().min(0),
  lastHitAt: nullableIso,
})

const keywordRuleInput = z.object({
  name: z.string().trim().min(1).max(100),
  keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
  matchType: ruleMatchType.default('contains'),
  /** Exactly one of replyText / templateId — checked by the handler. */
  replyText: z.string().trim().max(4096).optional(),
  templateId: id.optional(),
  deviceIds: z.array(id).default([]),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(-100).max(100).default(0),
  cooldownMinutes: z.number().int().min(0).max(1440).default(10),
})

export const webhook = z.object({
  id,
  url: z.string(),
  events: z.array(webhookEvent),
  enabled: z.boolean(),
  lastStatus: z.number().int().nullable(),
  lastError: z.string().nullable(),
  lastDeliveredAt: nullableIso,
  createdAt: isoDate,
})

export const webhookDelivery = z.object({
  id,
  event: webhookEvent,
  status: z.enum(['pending', 'delivered', 'failed']),
  attempts: z.number().int().min(0),
  lastError: z.string().nullable(),
  createdAt: isoDate,
  deliveredAt: nullableIso,
})

const webhookUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//.test(u), { message: 'Use an http(s) URL' })

export const sequenceStep = z.object({
  id,
  position: z.number().int().min(0),
  templateId: id,
  templateName: z.string(),
  delayMinutes: z.number().int().min(0),
})

export const sequence = z.object({
  id,
  name: z.string(),
  status: sequenceStatus,
  deviceIds: z.array(id),
  stopOnReply: z.boolean(),
  steps: z.array(sequenceStep),
  counts: z.object({
    active: z.number().int().min(0),
    completed: z.number().int().min(0),
    stopped: z.number().int().min(0),
    failed: z.number().int().min(0),
  }),
  createdAt: isoDate,
})

const stepInput = z.object({
  templateId: id,
  /** After enrollment (first step) or after the previous step. Max 90 days. */
  delayMinutes: z.number().int().min(0).max(129_600),
})

export const enrollment = z.object({
  id,
  contactId: id,
  contactName: z.string(),
  phone: z.string(),
  nextStep: z.number().int().min(0),
  nextRunAt: nullableIso,
  status: enrollmentStatus,
  stoppedReason: z.string().nullable(),
  lastSentAt: nullableIso,
})

export const callEvent = z.object({
  id,
  deviceId: id,
  from: z.string(),
  isVideo: z.boolean(),
  rejected: z.boolean(),
  replied: z.boolean(),
  at: isoDate,
})

const dayStat = z.object({
  date: z.string(),
  sent: z.number().int().min(0),
  failed: z.number().int().min(0),
  delivered: z.number().int().min(0),
  read: z.number().int().min(0),
  replied: z.number().int().min(0),
})

export const automationChannels = {
  'rule:list': { request: z.void(), response: z.array(keywordRule) },
  'rule:create': { request: keywordRuleInput, response: keywordRule },
  'rule:update': {
    request: patchOf(keywordRuleInput).extend({ id }),
    response: keywordRule,
  },
  'rule:delete': { request: z.object({ id }), response: ok },
  /** Dry run: which rule would answer this text, and with what. */
  'rule:test': {
    request: z.object({ text: z.string().min(1).max(4096), deviceId: id.optional() }),
    response: z.object({ ruleId: id.nullable(), reply: z.string().nullable() }),
  },

  'webhook:list': { request: z.void(), response: z.array(webhook) },
  /** The signing secret is returned once, here, and never again. */
  'webhook:create': {
    request: z.object({ url: webhookUrl, events: z.array(webhookEvent).min(1) }),
    response: webhook.extend({ secret: z.string() }),
  },
  'webhook:update': {
    request: z.object({
      id,
      url: webhookUrl.optional(),
      events: z.array(webhookEvent).min(1).optional(),
      enabled: z.boolean().optional(),
    }),
    response: webhook,
  },
  'webhook:delete': { request: z.object({ id }), response: ok },
  /** Deliver a sample event right now and report what the endpoint said. */
  'webhook:test': {
    request: z.object({ id }),
    response: z.object({
      status: z.number().int().nullable(),
      error: z.string().nullable(),
    }),
  },
  'webhook:deliveries': {
    request: z.object({ id, limit: z.number().int().min(1).max(200).default(50) }),
    response: z.array(webhookDelivery),
  },

  'sequence:list': { request: z.void(), response: z.array(sequence) },
  'sequence:create': {
    request: z.object({
      name: z.string().trim().min(1).max(100),
      deviceIds: z.array(id),
      stopOnReply: z.boolean().default(true),
      steps: z.array(stepInput).min(1).max(20),
    }),
    response: sequence,
  },
  'sequence:update': {
    request: z.object({
      id,
      name: z.string().trim().min(1).max(100).optional(),
      status: sequenceStatus.optional(),
      deviceIds: z.array(id).optional(),
      stopOnReply: z.boolean().optional(),
      steps: z.array(stepInput).min(1).max(20).optional(),
    }),
    response: sequence,
  },
  'sequence:delete': { request: z.object({ id }), response: ok },
  'sequence:enroll': {
    request: z.object({
      id,
      listIds: z.array(id).default([]),
      tagIds: z.array(id).default([]),
      contactIds: z.array(id).max(10_000).default([]),
    }),
    response: z.object({
      enrolled: z.number().int().min(0),
      skipped: z.number().int().min(0),
    }),
  },
  'sequence:enrollments': {
    request: z.object({
      id,
      status: enrollmentStatus.optional(),
      cursor,
      limit: pageLimit,
    }),
    response: page(enrollment),
  },
  'sequence:unenroll': {
    request: z.object({ enrollmentIds: z.array(id).min(1).max(10_000) }),
    response: ok,
  },

  'calls:getConfig': {
    request: z.void(),
    response: z.object({ autoReject: z.boolean(), message: z.string() }),
  },
  'calls:setConfig': {
    request: z.object({ autoReject: z.boolean(), message: z.string().max(1000) }),
    response: ok,
  },
  'calls:list': {
    request: z.object({ limit: z.number().int().min(1).max(200).default(50) }),
    response: z.array(callEvent),
  },

  'device:setWarmup': { request: z.object({ id, enabled: z.boolean() }), response: ok },
  'device:clearHealthPause': { request: z.object({ id }), response: ok },
  'device:syncLabels': {
    request: z.object({ id }),
    response: z.object({ isBusiness: z.boolean() }),
  },
  'warmup:getConfig': {
    request: z.void(),
    response: z.object({
      autoConversations: z.boolean(),
      conversationsPerDay: z.number().int(),
    }),
  },
  'warmup:setConfig': {
    request: z.object({
      autoConversations: z.boolean(),
      conversationsPerDay: z.number().int().min(1).max(50),
    }),
    response: ok,
  },

  /** Seven days of outcomes plus per-device usage against today's cap. */
  'system:analytics': {
    request: z.void(),
    response: z.object({
      days: z.array(dayStat),
      devices: z.array(
        z.object({
          deviceId: id,
          name: z.string(),
          sentToday: z.number().int().min(0),
          cap: z.number().int().min(0),
          warmupCap: z.number().int().min(0).nullable(),
          healthPausedUntil: nullableIso,
        }),
      ),
      repliesAwaiting: z.number().int().min(0),
      escalated: z.number().int().min(0),
    }),
  },
  'campaign:duplicate': {
    request: z.object({ id, name: z.string().trim().min(1).max(200).optional() }),
    response: z.object({ id }),
  },
} as const

export const automationEvents = {
  /** Warmup, health or business status changed — the Devices screen refetches. */
  'device:updated': z.object({ deviceId: id }),
  /** Enrollments moved (a step sent, a reply stopped one, enroll/unenroll). */
  'sequence:changed': z.object({ sequenceId: id }),
} as const
