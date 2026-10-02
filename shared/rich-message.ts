/**
 * Payloads for the rich template and inbox message types (tracker D89).
 *
 * Stored as JSON in `Template.extra` and carried over IPC, so one schema per
 * type is the single definition every process agrees on. Media-backed types
 * (voice, sticker) carry no payload here: their file goes through the same
 * managed media store as image and video templates.
 */
import { z } from 'zod'

export const MAX_POLL_OPTIONS = 12
export const MAX_SHARED_CONTACTS = 10

export const locationPayload = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().max(100).optional(),
  address: z.string().max(200).optional(),
})
export type LocationPayload = z.infer<typeof locationPayload>

export const sharedContact = z.object({
  name: z.string().min(1).max(100),
  /** E.164, e.g. +919876543210. */
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Use international format, e.g. +919876543210'),
})
export const contactPayload = z.object({
  contacts: z.array(sharedContact).min(1).max(MAX_SHARED_CONTACTS),
})
export type ContactPayload = z.infer<typeof contactPayload>

export const pollPayload = z.object({
  /** The question is the template's `content`. */
  options: z.array(z.string().min(1).max(100)).min(2).max(MAX_POLL_OPTIONS),
  /** 1 = single choice; 0 = any number of choices. */
  selectableCount: z.number().int().min(0).max(MAX_POLL_OPTIONS).default(1),
})
export type PollPayload = z.infer<typeof pollPayload>

export const eventPayload = z.object({
  /** The event name is the template's `content`. */
  description: z.string().max(1000).optional(),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }).optional(),
  location: z.string().max(200).optional(),
})
export type EventPayload = z.infer<typeof eventPayload>

/** A snapshot of a catalog product, so a template keeps working offline. */
export const productPayload = z.object({
  deviceId: z.string().min(1),
  productId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  priceAmount1000: z.number().int().optional(),
  currency: z.string().length(3).optional(),
  imageUrl: z.string().url().optional(),
})
export type ProductPayload = z.infer<typeof productPayload>

/** Template.extra, keyed by template type. Types without a payload store null. */
export const richPayloadByType = {
  location: locationPayload,
  contact: contactPayload,
  poll: pollPayload,
  event: eventPayload,
  product: productPayload,
} as const

export const richPayload = z.union([
  locationPayload,
  contactPayload,
  pollPayload,
  eventPayload,
  productPayload,
])
export type RichPayload = z.infer<typeof richPayload>

/** One-off rich sends from the inbox composer. */
export const inboxRichMessage = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('location'), payload: locationPayload }),
  z.object({ kind: z.literal('contact'), payload: contactPayload }),
  z.object({
    kind: z.literal('poll'),
    question: z.string().min(1).max(255),
    payload: pollPayload,
  }),
  z.object({ kind: z.literal('voice'), mediaSourcePath: z.string().min(1) }),
  z.object({ kind: z.literal('sticker'), mediaSourcePath: z.string().min(1) }),
])
export type InboxRichMessage = z.infer<typeof inboxRichMessage>
