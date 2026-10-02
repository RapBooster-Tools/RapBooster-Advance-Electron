/**
 * Inbox rich sends, AI drafts (approve-before-send and quiet-hours holds), AI
 * provider configuration and usage, and the business catalog (D89).
 */
import { z } from 'zod'
import { aiDraftStatus, aiProvider } from '../types'
import { id, isoDate, ok } from './common'

export const aiDraft = z.object({
  id,
  chatId: id,
  chatName: z.string(),
  deviceId: id,
  text: z.string(),
  status: aiDraftStatus,
  reason: z.string().nullable(),
  createdAt: isoDate,
})

export const aiConfig = z.object({
  provider: aiProvider,
  model: z.string().trim().min(1).max(100),
  /** Only for `compatible`: an OpenAI-compatible endpoint, e.g. a local model. */
  baseUrl: z.string().url().nullable(),
  maxTokens: z.number().int().min(16).max(4096),
  temperature: z.number().min(0).max(2),
  historyDepth: z.number().int().min(0).max(50),
  /** 0 = unlimited. */
  dailyCapPerDevice: z.number().int().min(0).max(100_000),
  dailyCapPerChat: z.number().int().min(0).max(1_000),
  /** Replies wait in the inbox for a person to approve, edit or discard. */
  approveBeforeSend: z.boolean(),
  /** Bursts within this many seconds get one reply, not one per message. */
  coalesceSeconds: z.number().int().min(0).max(120),
})

/** Which providers have a key stored — never the key itself. */
export const aiKeyStatus = z.object({
  openai: z.boolean(),
  anthropic: z.boolean(),
  gemini: z.boolean(),
  compatible: z.boolean(),
})

const usageTotals = z.object({
  calls: z.number().int().min(0),
  promptTokens: z.number().int().min(0),
  completionTokens: z.number().int().min(0),
})

export const product = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  priceAmount1000: z.number().int().nullable(),
  currency: z.string().nullable(),
  imageUrl: z.string().nullable(),
})

export const messagingChannels = {
  'aiDraft:list': {
    request: z.object({ chatId: id.optional() }),
    response: z.array(aiDraft),
  },
  /** Send a draft, optionally edited first. */
  'aiDraft:approve': {
    request: z.object({ id, text: z.string().trim().min(1).max(4096).optional() }),
    response: ok,
  },
  'aiDraft:discard': { request: z.object({ id }), response: ok },

  'ai:getConfig': {
    request: z.void(),
    response: z.object({ config: aiConfig, keys: aiKeyStatus }),
  },
  'ai:setConfig': { request: aiConfig, response: aiConfig },
  'ai:usage': {
    request: z.void(),
    response: z.object({
      today: usageTotals,
      month: usageTotals,
      days: z.array(usageTotals.extend({ date: z.string() })),
    }),
  },

  'catalog:list': { request: z.object({ deviceId: id }), response: z.array(product) },
} as const

export const messagingEvents = {
  /** Escalation, drafts or bot state changed for a chat — the inbox refetches. */
  'chat:updated': z.object({ chatId: id }),
} as const
