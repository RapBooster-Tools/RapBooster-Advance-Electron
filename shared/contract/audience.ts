/**
 * Audience: tags, the opt-out (suppression) list, WhatsApp number checks and
 * Google Sheets import (IMPROVEMENT-PLAN.md Phases 2 and 4; D89).
 */
import { z } from 'zod'
import { dialPrefix, suppressionSource, tagSource } from '../types'
import { cursor, id, isoDate, ok, page, pageLimit, started } from './common'

export const tag = z.object({
  id,
  name: z.string(),
  color: z.string(),
  source: tagSource,
  contactCount: z.number().int().min(0),
  createdAt: isoDate,
})

export const suppression = z.object({
  phone: z.string(),
  reason: z.string().nullable(),
  source: suppressionSource,
  createdAt: isoDate,
})

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #0078d4')
const sheetUrl = z
  .string()
  .url()
  .refine((u) => /^https:\/\/docs\.google\.com\/spreadsheets\//.test(u), {
    message: 'Paste a Google Sheets link (docs.google.com/spreadsheets/…)',
  })

export const audienceChannels = {
  'tag:list': { request: z.void(), response: z.array(tag) },
  'tag:create': {
    request: z.object({
      name: z.string().trim().min(1).max(40),
      color: hexColor.optional(),
    }),
    response: tag,
  },
  'tag:update': {
    request: z.object({
      id,
      name: z.string().trim().min(1).max(40).optional(),
      color: hexColor.optional(),
    }),
    response: tag,
  },
  'tag:delete': { request: z.object({ id }), response: ok },
  /** Assign by explicit ids, or to every contact in a list. */
  'tag:assign': {
    request: z.object({
      tagId: id,
      contactIds: z.array(id).max(10_000).default([]),
      listId: id.optional(),
    }),
    response: z.object({ assigned: z.number().int().min(0) }),
  },
  'tag:unassign': {
    request: z.object({ tagId: id, contactIds: z.array(id).min(1).max(10_000) }),
    response: z.object({ removed: z.number().int().min(0) }),
  },

  'suppression:list': {
    request: z.object({ search: z.string().optional(), cursor, limit: pageLimit }),
    response: page(suppression),
  },
  /** Phones are normalized server-side; invalid ones are counted, not thrown. */
  'suppression:add': {
    request: z.object({
      phones: z.array(z.string().min(3)).min(1).max(10_000),
      reason: z.string().max(200).optional(),
    }),
    response: z.object({
      added: z.number().int().min(0),
      invalid: z.number().int().min(0),
    }),
  },
  'suppression:remove': {
    request: z.object({ phones: z.array(z.string().min(1)).min(1).max(10_000) }),
    response: z.object({ removed: z.number().int().min(0) }),
  },
  'suppression:import': {
    request: z.object({ filePath: z.string().min(1), dialPrefix: dialPrefix.nullable() }),
    response: z.object({
      added: z.number().int().min(0),
      invalid: z.number().int().min(0),
    }),
  },
  'suppression:export': {
    request: z.void(),
    response: z.object({ filePath: z.string(), rows: z.number().int().min(0) }),
  },
  'optout:getConfig': {
    request: z.void(),
    response: z.object({
      keywords: z.array(z.string()),
      confirmationEnabled: z.boolean(),
      confirmationText: z.string(),
    }),
  },
  'optout:setConfig': {
    request: z.object({
      keywords: z.array(z.string().trim().min(1).max(40)).min(1).max(30),
      confirmationEnabled: z.boolean(),
      confirmationText: z.string().trim().min(1).max(500),
    }),
    response: ok,
  },

  /** Check every unchecked number in a list; progress via contacts:verifyProgress. */
  'contacts:verifyNumbers': {
    request: z.object({ listId: id, deviceId: id, recheck: z.boolean().default(false) }),
    response: started,
  },
  'contacts:sheetPreview': {
    request: z.object({ url: sheetUrl }),
    response: z.object({
      headers: z.array(z.string()),
      sampleRows: z.array(z.array(z.string())),
      totalRows: z.number().int().min(0),
    }),
  },
  'contacts:importSheet': {
    request: z.object({
      listId: id,
      url: sheetUrl,
      mapping: z.record(z.string(), z.string()),
      duplicatePolicy: z.enum(['skip', 'overwrite', 'allow']).default('skip'),
      dialPrefix: dialPrefix.nullable(),
    }),
    response: z.object({
      imported: z.number().int().min(0),
      skipped: z.number().int().min(0),
      invalid: z.number().int().min(0),
      errorReportPath: z.string().nullable(),
    }),
  },
} as const

export const audienceEvents = {
  'contacts:verifyProgress': z.object({
    listId: id,
    checked: z.number().int().min(0),
    total: z.number().int().min(0),
    valid: z.number().int().min(0),
    invalid: z.number().int().min(0),
    done: z.boolean(),
    error: z.string().nullable(),
  }),
} as const
