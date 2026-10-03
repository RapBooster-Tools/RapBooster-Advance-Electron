/**
 * Wave 3: inbox productivity (quick replies, notes, contact profile, scheduled
 * messages), chatbot flows, welcome/away replies, the WhatsApp address book
 * grabber and desktop preferences.
 */
import { z } from 'zod'
import { flowGraph, flowTrigger } from '../flow'
import { clockTime, enrollmentStatus, recipientStatus } from '../types'
import { cursor, id, isoDate, nullableIso, ok, page, pageLimit } from './common'

export const quickReply = z.object({
  id,
  shortcut: z.string(),
  title: z.string(),
  body: z.string(),
  useCount: z.number().int().min(0),
})

const quickReplyInput = z.object({
  /** Typed after "/" in the composer: letters, digits, dash. */
  shortcut: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,30}$/, 'Use 1–30 lowercase letters, digits or dashes'),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(4096),
})

export const chatNote = z.object({ id, chatId: id, body: z.string(), createdAt: isoDate })

export const chatProfile = z.object({
  chatId: id,
  name: z.string(),
  phone: z.string(),
  optedOut: z.boolean(),
  /** Every contact record with this number, across lists. */
  contacts: z.array(
    z.object({
      id,
      listId: id,
      listName: z.string(),
      data: z.record(z.string(), z.string()),
      tagIds: z.array(id),
    }),
  ),
  campaigns: z.array(
    z.object({
      campaignId: id,
      name: z.string(),
      status: recipientStatus,
      sentAt: nullableIso,
      deliveredAt: nullableIso,
      readAt: nullableIso,
      repliedAt: nullableIso,
    }),
  ),
  sequences: z.array(
    z.object({
      enrollmentId: id,
      sequenceId: id,
      name: z.string(),
      status: enrollmentStatus,
      nextStep: z.number().int().min(0),
    }),
  ),
})

export const scheduledMessageStatus = z.enum([
  'scheduled',
  'sending',
  'sent',
  'failed',
  'cancelled',
])

export const scheduledMessage = z.object({
  id,
  chatId: id,
  body: z.string(),
  mediaPath: z.string().nullable(),
  sendAt: isoDate,
  status: scheduledMessageStatus,
  error: z.string().nullable(),
  sentAt: nullableIso,
})

export const chatbotFlow = z.object({
  id,
  name: z.string(),
  enabled: z.boolean(),
  trigger: flowTrigger,
  keywords: z.array(z.string()),
  deviceIds: z.array(id),
  priority: z.number().int(),
  graph: flowGraph,
  activeSessions: z.number().int().min(0),
  updatedAt: isoDate,
})

const flowInput = z.object({
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean().default(true),
  trigger: flowTrigger.default('keywords'),
  keywords: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  deviceIds: z.array(id).default([]),
  priority: z.number().int().min(-100).max(100).default(0),
  graph: flowGraph,
})

const weekday = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])

export const autoReplyConfig = z.object({
  welcome: z.object({
    enabled: z.boolean(),
    /** Merge tags {{Name}} allowed; sent once, on a chat's first message. */
    text: z.string().max(4096),
  }),
  away: z.object({
    enabled: z.boolean(),
    text: z.string().max(4096),
    /** Business hours per weekday; outside them the away message is sent. */
    hours: z.record(
      weekday,
      z.array(z.object({ start: clockTime, end: clockTime })).max(3),
    ),
    /** Repeat the away message to the same chat at most this often. */
    cooldownHours: z.number().int().min(1).max(168),
  }),
})

export const waContact = z.object({
  deviceId: id,
  jid: z.string(),
  phone: z.string(),
  name: z.string().nullable(),
  /** Saved in the phone's address book. */
  inAddressBook: z.boolean(),
  /** Has a one-to-one chat with the phone — includes people never saved. */
  hasChat: z.boolean(),
  lastChatAt: nullableIso,
})

/** Where the grabber takes numbers from. */
export const waContactSource = z.enum(['all', 'addressBook', 'chats'])

export const appPrefs = z.object({
  /** Desktop notification for new inbound messages while the window is unfocused. */
  notifications: z.boolean(),
  /** Closing the window keeps the app (and its campaigns) running in the tray. */
  runInBackground: z.boolean(),
  startAtLogin: z.boolean(),
  onboardingCompleted: z.boolean(),
  /** Guided tours already shown, by screen id. */
  toursSeen: z.array(z.string().max(40)).max(50),
})

export const workspaceChannels = {
  'quickReply:list': { request: z.void(), response: z.array(quickReply) },
  'quickReply:create': { request: quickReplyInput, response: quickReply },
  'quickReply:update': {
    request: quickReplyInput.partial().extend({ id }),
    response: quickReply,
  },
  'quickReply:delete': { request: z.object({ id }), response: ok },
  /** Render a quick reply for a chat (merge tags filled) and count its use. */
  'quickReply:use': {
    request: z.object({ id, chatId: id }),
    response: z.object({ text: z.string() }),
  },

  'chat:notes': { request: z.object({ chatId: id }), response: z.array(chatNote) },
  'chat:addNote': {
    request: z.object({ chatId: id, body: z.string().trim().min(1).max(4096) }),
    response: chatNote,
  },
  'chat:deleteNote': { request: z.object({ id }), response: ok },
  'chat:profile': { request: z.object({ chatId: id }), response: chatProfile },

  'scheduledMessage:list': {
    request: z.object({ chatId: id.optional() }),
    response: z.array(scheduledMessage),
  },
  'scheduledMessage:create': {
    request: z.object({
      chatId: id,
      body: z.string().max(4096).default(''),
      mediaSourcePath: z.string().optional(),
      sendAt: isoDate,
    }),
    response: scheduledMessage,
  },
  'scheduledMessage:cancel': { request: z.object({ id }), response: ok },

  'flow:list': { request: z.void(), response: z.array(chatbotFlow) },
  'flow:create': { request: flowInput, response: chatbotFlow },
  'flow:update': { request: flowInput.partial().extend({ id }), response: chatbotFlow },
  'flow:delete': { request: z.object({ id }), response: ok },
  /** Dry run: feed customer replies, get the bot's side of the conversation. */
  'flow:simulate': {
    request: z.object({
      graph: flowGraph,
      replies: z.array(z.string().max(500)).max(30),
    }),
    response: z.object({
      transcript: z.array(
        z.object({ from: z.enum(['bot', 'customer']), text: z.string() }),
      ),
      ended: z.boolean(),
      handoff: z.boolean(),
    }),
  },

  'autoreply:getConfig': { request: z.void(), response: autoReplyConfig },
  'autoreply:setConfig': { request: autoReplyConfig, response: ok },

  'waContacts:list': {
    request: z.object({
      deviceId: id.optional(),
      source: waContactSource.default('all'),
      search: z.string().optional(),
      onlyNamed: z.boolean().default(false),
      cursor,
      limit: pageLimit,
    }),
    response: page(waContact),
  },
  /** The grabber: copy address-book contacts into a contact list. */
  'waContacts:export': {
    request: z.object({
      deviceIds: z.array(id).min(1),
      source: waContactSource.default('all'),
      /** With source `chats`: only chats active since this moment. */
      chattedSince: isoDate.optional(),
      listName: z.string().trim().min(1).max(100),
      onlyNamed: z.boolean().default(false),
    }),
    response: z.object({
      listId: id,
      imported: z.number().int().min(0),
      skipped: z.number().int().min(0),
    }),
  },

  'app:getPrefs': { request: z.void(), response: appPrefs },
  'app:setPrefs': { request: appPrefs.partial(), response: appPrefs },
} as const

export const workspaceEvents = {
  /** Main asks the renderer to open a screen — e.g. a clicked notification. */
  'app:navigate': z.object({ route: z.string().max(100), chatId: id.optional() }),
  'scheduledMessage:changed': z.object({ chatId: id }),
} as const
