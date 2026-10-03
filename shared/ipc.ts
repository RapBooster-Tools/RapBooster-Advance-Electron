/**
 * THE IPC contract (SPRINTS.md §5, CLAUDE.md §2.2).
 *
 * Imported by main, preload and renderer so all three agree by construction.
 * Every channel declares a zod request and response schema, and the router
 * validates **both** directions: the renderer is treated as untrusted input even
 * though we wrote it, and a handler returning the wrong shape is a bug that
 * should fail at the boundary rather than deep inside a component.
 *
 * Adding a channel means editing this file first, then the handler, then the
 * caller. Channels declared here before their handler exists are intentional —
 * the full surface is fixed in T1.5 so it never has to be renegotiated.
 */
import { z } from 'zod'
import type { IpcChannelName, IpcEventName } from './channels'
import type { SerializedError } from './errors'
import { audienceChannels, audienceEvents } from './contract/audience'
import { automationChannels, automationEvents } from './contract/automation'
import { broadcastChannels, broadcastEvents } from './contract/broadcast'
import { groupChannels } from './contract/groups'
import { messagingChannels, messagingEvents } from './contract/messaging'
import { workspaceChannels, workspaceEvents } from './contract/workspace'
import { inboxRichMessage, richPayload } from './rich-message'
import {
  campaignStatus,
  deviceStatus,
  dialPrefix,
  jobStatus,
  licenseStatus,
  mediaType,
  messageDirection,
  messageStatus,
  messageType,
  recipientStatus,
  suffixRule,
  templateButton,
  templateType,
  waNumberStatus,
  aiProvider,
  waServiceState,
  clockTime,
  MAX_LIST_ROWS,
  MAX_TEMPLATE_BUTTONS,
} from './types'

// ─────────────────────────────── primitives ──────────────────────────────

const id = z.string().min(1)
const isoDate = z.string().datetime({ offset: true })
const nullableIso = isoDate.nullable()
const cursor = z.string().min(1).optional()
const pageLimit = z.number().int().min(1).max(200).default(100)

/** Paginated envelope — every list channel returns this shape. */
function page<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    total: z.number().int().min(0),
  })
}

const ok = z.object({ ok: z.literal(true) })

// ──────────────────────────────── entities ───────────────────────────────

export const licenseInfo = z.object({
  status: licenseStatus,
  keyMasked: z.string().nullable(),
  deviceName: z.string().nullable(),
  remarks: z.string().nullable(),
  activatedAt: nullableIso,
  expiresAt: nullableIso,
  lastValidatedAt: nullableIso,
  graceUntil: nullableIso,
})

/** The other machine holding a license, shown by the conflict dialog. */
export const licenseConflict = z.object({
  deviceName: z.string(),
  lastUsedAt: nullableIso,
})

export const device = z.object({
  id,
  name: z.string(),
  phone: z.string().nullable(),
  status: deviceStatus,
  lastActiveAt: nullableIso,
  lastError: z.string().nullable(),
  dailySentCount: z.number().int().min(0),
  createdAt: isoDate,
  warmupEnabled: z.boolean(),
  /** Day N of warmup (1-based), or null when warmup is off. */
  warmupDay: z.number().int().min(1).nullable(),
  /** Today's effective cap after warmup; null = unlimited. */
  effectiveCap: z.number().int().min(0).nullable(),
  healthPausedUntil: nullableIso,
  healthReason: z.string().nullable(),
  isBusiness: z.boolean(),
})

export const contactList = z.object({
  id,
  name: z.string(),
  fields: z.array(z.string()),
  contactCount: z.number().int().min(0),
  createdAt: isoDate,
})

export const contact = z.object({
  id,
  listId: id,
  name: z.string(),
  phone: z.string(),
  data: z.record(z.string(), z.string()),
  isValid: z.boolean(),
  waStatus: waNumberStatus,
  tagIds: z.array(id),
})

export const template = z.object({
  id,
  name: z.string(),
  type: templateType,
  content: z.string(),
  mediaType: mediaType.nullable(),
  mediaPath: z.string().nullable(),
  options: z.array(z.string()).max(MAX_LIST_ROWS).nullable(),
  buttons: z.array(templateButton).max(MAX_TEMPLATE_BUTTONS).nullable(),
  footer: z.string().nullable(),
  listButtonText: z.string().nullable(),
  /** Rich types' payload (location, contact, poll, event, product). */
  extra: richPayload.nullable(),
  createdAt: isoDate,
})

export const campaign = z.object({
  id,
  name: z.string(),
  status: campaignStatus,
  templateId: id,
  templateName: z.string(),
  deviceIds: z.array(id),
  listIds: z.array(id),
  scheduledAt: nullableIso,
  delayFrom: z.number().int().min(0),
  delayTo: z.number().int().min(0),
  sleepDuration: z.number().int().min(0),
  sleepAfter: z.number().int().min(1),
  totalCount: z.number().int().min(0),
  sentCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  createdAt: isoDate,
  includeTagIds: z.array(id),
  excludeTagIds: z.array(id),
  checkNumbers: z.boolean(),
  skippedCount: z.number().int().min(0),
  deliveredCount: z.number().int().min(0),
  readCount: z.number().int().min(0),
  repliedCount: z.number().int().min(0),
})

export const campaignRecipient = z.object({
  id,
  phone: z.string(),
  contactName: z.string(),
  deviceId: id,
  status: recipientStatus,
  attempts: z.number().int().min(0),
  error: z.string().nullable(),
  sentAt: nullableIso,
  deliveredAt: nullableIso,
  readAt: nullableIso,
  repliedAt: nullableIso,
})

export const group = z.object({
  id,
  deviceId: id,
  name: z.string(),
  memberCount: z.number().int().min(0),
  isAdmin: z.boolean(),
  isCommunity: z.boolean(),
  parentId: z.string().nullable(),
  announce: z.boolean(),
  restrict: z.boolean(),
  joinApproval: z.boolean(),
  syncedAt: isoDate,
})

export const chat = z.object({
  id,
  deviceId: id,
  name: z.string(),
  phone: z.string(),
  isGroup: z.boolean(),
  lastMessage: z.string().nullable(),
  lastMessageAt: nullableIso,
  unreadCount: z.number().int().min(0),
  isEscalated: z.boolean(),
  autoReplyOptOut: z.boolean(),
  /** AI replies waiting for approval or held by quiet hours. */
  pendingDrafts: z.number().int().min(0),
  /** The number is on the opt-out list. */
  optedOut: z.boolean(),
})

export const message = z.object({
  id,
  chatId: id,
  direction: messageDirection,
  type: messageType,
  body: z.string().nullable(),
  mediaPath: z.string().nullable(),
  fileName: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  buttons: z.array(templateButton).nullable(),
  status: messageStatus,
  isAiReply: z.boolean(),
  timestamp: isoDate,
})

export const chatbotConfig = z.object({
  enabled: z.boolean(),
  systemInstructions: z.string(),
  businessName: z.string().nullable(),
  businessEmail: z.string().nullable(),
  businessPhone: z.string().nullable(),
  responseDelay: z.number().int().min(0).max(30),
  tone: z.string(),
  industry: z.string().nullable(),
  primaryGoal: z.string(),
  responseStyle: z.string(),
  language: z.string(),
  escalationTrigger: z.string(),
  escalationKeywords: z.array(z.string()),
  escalationMessage: z.string().nullable(),
  confidenceThreshold: z.number().int().min(0).max(100),
  escalateAfterMessages: z.number().int().min(0).max(100),
  escalateAfterMinutes: z.number().int().min(0).max(10_080),
  products: z.string(),
  knowledgeBase: z.string(),
})

export const sendingDefaults = z.object({
  delayFrom: z.number().int().min(0).max(300),
  delayTo: z.number().int().min(0).max(300),
  sleepDuration: z.number().int().min(0).max(600),
  sleepAfter: z.number().int().min(1).max(100),
  groupMessageDelay: z.number().int().min(0).max(300),
  groupCreateDelay: z.number().int().min(0).max(60),
  dailyCapPerDevice: z.number().int().min(0),
  retryAttempts: z.number().int().min(0).max(10),
  maxConcurrentDevices: z.number().int().min(1).max(20),
  quietHoursEnabled: z.boolean(),
  quietHoursStart: clockTime,
  quietHoursEnd: clockTime,
  /** "typing…" / "recording…" before automated sends. */
  simulateTyping: z.boolean(),
  /** Mark incoming messages read when the bot or a rule answers them. */
  markReadOnReply: z.boolean(),
  /** Pause a device whose recent sends fail at a ban-like rate. */
  healthBreaker: z.boolean(),
  /** Hours after a send during which an inbound message counts as a reply. */
  attributionHours: z.number().int().min(1).max(720),
})

export const dashboardStats = z.object({
  totalContacts: z.number().int().min(0),
  activeDevices: z.number().int().min(0),
  runningCampaigns: z.number().int().min(0),
  templates: z.number().int().min(0),
  sentToday: z.number().int().min(0),
  failedToday: z.number().int().min(0),
})

// ─────────────────────────── the invoke contract ─────────────────────────

export const ipcContract = {
  // ── License ──
  'license:status': { request: z.void(), response: licenseInfo },
  'license:activate': {
    request: z.object({ key: z.string().min(1), remarks: z.string().optional() }),
    // A conflict is a legitimate outcome, not an exception — the UI must render
    // the other device's details rather than a generic error.
    response: z.object({
      status: licenseStatus,
      info: licenseInfo.nullable(),
      conflict: licenseConflict.nullable(),
    }),
  },
  'license:transfer': {
    request: z.object({ key: z.string().min(1), remarks: z.string().optional() }),
    response: z.object({ status: licenseStatus, info: licenseInfo.nullable() }),
  },
  'license:deactivate': { request: z.void(), response: ok },
  'license:revalidate': { request: z.void(), response: licenseInfo },

  // ── Devices ──
  'device:list': { request: z.void(), response: z.array(device) },
  'device:create': { request: z.object({ name: z.string().min(1) }), response: device },
  'device:rename': {
    request: z.object({ id, name: z.string().min(1) }),
    response: device,
  },
  'device:connect': { request: z.object({ id }), response: ok },
  'device:requestPairingCode': {
    request: z.object({ id, phone: z.string().min(6) }),
    response: z.object({ code: z.string() }),
  },
  'device:reconnect': { request: z.object({ id }), response: ok },
  'device:logout': { request: z.object({ id }), response: ok },
  'device:delete': { request: z.object({ id }), response: ok },

  // ── Contact lists ──
  'contactList:list': { request: z.void(), response: z.array(contactList) },
  'contactList:create': {
    request: z.object({
      name: z.string().min(1),
      customFields: z.array(z.string()).default([]),
    }),
    response: contactList,
  },
  'contactList:update': {
    request: z.object({ id, name: z.string().min(1).optional() }),
    response: contactList,
  },
  'contactList:delete': { request: z.object({ id }), response: ok },

  // ── Contacts ──
  'contacts:list': {
    request: z.object({
      listId: id,
      search: z.string().optional(),
      tagId: id.optional(),
      waStatus: waNumberStatus.optional(),
      cursor,
      limit: pageLimit,
    }),
    response: page(contact),
  },
  'contacts:create': {
    request: z.object({ listId: id, data: z.record(z.string(), z.string()) }),
    response: contact,
  },
  'contacts:update': {
    request: z.object({ id, data: z.record(z.string(), z.string()) }),
    response: contact,
  },
  'contacts:delete': { request: z.object({ id }), response: ok },
  'contacts:bulkDelete': { request: z.object({ ids: z.array(id).min(1) }), response: ok },
  'contacts:importPreview': {
    request: z.object({ filePath: z.string().min(1) }),
    response: z.object({
      headers: z.array(z.string()),
      sampleRows: z.array(z.array(z.string())),
      totalRows: z.number().int().min(0),
    }),
  },
  'contacts:import': {
    request: z.object({
      listId: id,
      filePath: z.string().min(1),
      /** CSV header -> list field name */
      mapping: z.record(z.string(), z.string()),
      duplicatePolicy: z.enum(['skip', 'overwrite', 'allow']).default('skip'),
      /**
       * Dial prefix to apply to national numbers, e.g. `+91`. Null means the
       * file's numbers already carry their country code. There is no default:
       * the importer must ask, because a wrong guess corrupts the whole list
       * (REQUIREMENTS §7.5).
       */
      dialPrefix: dialPrefix.nullable(),
    }),
    response: z.object({
      imported: z.number().int().min(0),
      skipped: z.number().int().min(0),
      invalid: z.number().int().min(0),
      errorReportPath: z.string().nullable(),
    }),
  },
  'contacts:export': {
    request: z.object({ listId: id, search: z.string().optional() }),
    response: z.object({ filePath: z.string(), rows: z.number().int().min(0) }),
  },

  // ── Templates ──
  'template:list': { request: z.void(), response: z.array(template) },
  'template:create': {
    request: z.object({
      name: z.string().min(1),
      type: templateType,
      // Not .min(1): a voice note or sticker has no text. The handler requires
      // content for every type that displays it.
      content: z.string(),
      extra: richPayload.optional(),
      mediaType: mediaType.optional(),
      mediaSourcePath: z.string().optional(),
      options: z.array(z.string()).max(MAX_LIST_ROWS).optional(),
      buttons: z.array(templateButton).max(MAX_TEMPLATE_BUTTONS).optional(),
      footer: z.string().max(60).optional(),
      listButtonText: z.string().max(20).optional(),
    }),
    response: template,
  },
  'template:update': {
    request: z.object({
      id,
      name: z.string().min(1).optional(),
      content: z.string().optional(),
      extra: richPayload.optional(),
      mediaType: mediaType.optional(),
      mediaSourcePath: z.string().optional(),
      options: z.array(z.string()).max(MAX_LIST_ROWS).optional(),
      buttons: z.array(templateButton).max(MAX_TEMPLATE_BUTTONS).optional(),
      footer: z.string().max(60).optional(),
      listButtonText: z.string().max(20).optional(),
    }),
    response: template,
  },
  'template:delete': { request: z.object({ id }), response: ok },
  'template:usage': {
    request: z.object({ id }),
    response: z.object({
      campaigns: z.array(z.object({ id, name: z.string() })),
      groupJobs: z.number().int().min(0),
    }),
  },
  'template:preview': {
    request: z.object({ id, contactId: id.optional() }),
    response: z.object({
      rendered: z.string(),
      unresolvedTags: z.array(z.string()),
    }),
  },

  // ── Campaigns ──
  'campaign:list': { request: z.void(), response: z.array(campaign) },
  'campaign:get': { request: z.object({ id }), response: campaign },
  'campaign:create': {
    request: z.object({
      name: z.string().min(1),
      templateId: id,
      // Deliberately not `.min(1)`: the handler rejects an empty selection with
      // the prototype's wording. A zod failure here would surface a generic
      // "that request was not valid" instead of telling the user what to fix.
      deviceIds: z.array(id),
      listIds: z.array(id),
      scheduledAt: isoDate.optional(),
      delayFrom: z.number().int().min(0).max(300),
      delayTo: z.number().int().min(0).max(300),
      sleepDuration: z.number().int().min(0).max(600),
      sleepAfter: z.number().int().min(1).max(100),
      /** Audience = lists ∪ included tags, minus excluded tags. */
      includeTagIds: z.array(id).default([]),
      excludeTagIds: z.array(id).default([]),
      checkNumbers: z.boolean().default(false),
    }),
    response: campaign,
  },
  'campaign:start': { request: z.object({ id }), response: ok },
  'campaign:pause': { request: z.object({ id }), response: ok },
  'campaign:resume': { request: z.object({ id }), response: ok },
  'campaign:stop': { request: z.object({ id }), response: ok },
  'campaign:delete': { request: z.object({ id }), response: ok },
  'campaign:recipients': {
    request: z.object({
      id,
      status: recipientStatus.optional(),
      cursor,
      limit: pageLimit,
    }),
    response: page(campaignRecipient),
  },
  'campaign:report': {
    request: z.object({ id }),
    response: z.object({ filePath: z.string(), rows: z.number().int().min(0) }),
  },

  // ── Groups ──
  'group:list': {
    request: z.object({ deviceId: id.optional() }),
    response: z.array(group),
  },
  'group:sync': {
    request: z.object({ deviceId: id.optional() }),
    response: z.object({ synced: z.number().int().min(0) }),
  },
  'groupSend:create': {
    request: z.object({
      // Neither is constrained here: the handler rejects an empty selection or
      // a missing template with the prototype's wording, and a zod failure
      // would replace that with a generic message the user cannot act on
      // (same reasoning as campaign:create — tracker D44).
      templateId: z.string(),
      groupIds: z.array(id),
      delaySeconds: z.number().int().min(0).max(300),
    }),
    response: z.object({ jobId: id }),
  },
  'groupSend:status': {
    request: z.object({ jobId: id }),
    response: z.object({
      status: jobStatus,
      total: z.number().int().min(0),
      sent: z.number().int().min(0),
      failed: z.number().int().min(0),
    }),
  },
  'groupCreate:create': {
    request: z.object({
      deviceId: id,
      prefix: z.string().min(1),
      suffixRule,
      count: z.number().int().min(1).max(100),
      delaySeconds: z.number().int().min(0).max(60),
      listIds: z.array(id).default([]),
      contactsPerGroup: z.number().int().min(0).max(500),
      description: z.string().max(2048).optional(),
      /** Only admins can send. */
      announce: z.boolean().default(false),
      joinApproval: z.boolean().default(false),
    }),
    response: z.object({ jobId: id }),
  },
  'groupCreate:status': {
    request: z.object({ jobId: id }),
    response: z.object({
      status: jobStatus,
      created: z.number().int().min(0),
      failed: z.number().int().min(0),
      resultLog: z.string().nullable(),
    }),
  },

  // ── Inbox ──
  'chat:list': {
    request: z.object({
      deviceId: id.optional(),
      search: z.string().optional(),
      /** escalated = handed to a human; drafts = AI replies awaiting a person. */
      filter: z.enum(['all', 'unread', 'escalated', 'drafts']).default('all'),
      cursor,
      limit: pageLimit,
    }),
    response: page(chat),
  },
  'chat:get': { request: z.object({ id }), response: chat },
  'chat:messages': {
    request: z.object({ chatId: id, before: isoDate.optional(), limit: pageLimit }),
    response: page(message),
  },
  'chat:send': {
    request: z.object({
      chatId: id,
      body: z.string().optional(),
      mediaSourcePath: z.string().optional(),
      buttons: z.array(templateButton).max(MAX_TEMPLATE_BUTTONS).optional(),
    }),
    response: message,
  },
  'chat:markRead': { request: z.object({ chatId: id }), response: ok },
  'chat:setOptOut': {
    request: z.object({ chatId: id, optOut: z.boolean() }),
    response: ok,
  },
  /** Hand an escalated chat back to the auto-responder. */
  'chat:resumeBot': { request: z.object({ chatId: id }), response: ok },
  'chat:sendRich': {
    request: z.object({ chatId: id, message: inboxRichMessage }),
    response: message,
  },

  // ── Chatbot ──
  'chatbot:get': { request: z.void(), response: chatbotConfig },
  'chatbot:save': { request: chatbotConfig, response: chatbotConfig },
  'chatbot:testKey': {
    request: z.object({
      apiKey: z.string().min(1).optional(),
      provider: aiProvider.optional(),
    }),
    response: z.object({ valid: z.boolean(), detail: z.string().nullable() }),
  },

  // ── Settings ──
  'settings:get': {
    request: z.object({ key: z.string().min(1) }),
    response: z.object({ value: z.string().nullable() }),
  },
  'settings:set': {
    request: z.object({
      key: z.string().min(1),
      value: z.string(),
      encrypt: z.boolean().default(false),
    }),
    // `encrypted` reports what actually happened, which is not always what was
    // asked for: when the OS keychain is unavailable the value is stored in the
    // clear. The renderer needs to know so it can tell the user, rather than the
    // app silently keeping a secret unprotected (CLAUDE.md §5.6).
    response: z.object({
      ok: z.literal(true),
      encrypted: z.boolean(),
      wantedEncryption: z.boolean(),
    }),
  },
  'settings:getSendingDefaults': { request: z.void(), response: sendingDefaults },
  /**
   * A partial update, merged onto the stored values: a screen that edits only
   * some fields must not have to round-trip the rest, and adding a setting must
   * not break every caller that predates it.
   */
  'settings:setSendingDefaults': {
    request: sendingDefaults.partial(),
    response: sendingDefaults,
  },

  // ── System ──
  'system:dashboard': { request: z.void(), response: dashboardStats },
  'system:version': {
    request: z.void(),
    response: z.object({
      app: z.string(),
      electron: z.string(),
      node: z.string(),
      chrome: z.string(),
      platform: z.string(),
    }),
  },
  'system:paths': {
    request: z.void(),
    response: z.object({ userData: z.string(), database: z.string(), logs: z.string() }),
  },
  'system:openPath': { request: z.object({ path: z.string().min(1) }), response: ok },
  /**
   * The native "choose a file" dialog. Non-technical users must never type a
   * file path (D96); every file input in the app goes through this.
   */
  'system:pickFile': {
    request: z.object({
      title: z.string().max(100).optional(),
      filters: z
        .array(
          z.object({ name: z.string().max(60), extensions: z.array(z.string().max(10)) }),
        )
        .max(10)
        .default([]),
      multiple: z.boolean().default(false),
    }),
    response: z.object({ paths: z.array(z.string()) }),
  },
  'system:exportDiagnostics': {
    request: z.void(),
    response: z.object({ filePath: z.string() }),
  },
  'system:backup': { request: z.void(), response: z.object({ filePath: z.string() }) },
  'system:restore': { request: z.object({ filePath: z.string().min(1) }), response: ok },
  'system:clearData': {
    request: z.object({ confirmation: z.literal('DELETE') }),
    response: ok,
  },
  'system:checkUpdate': {
    request: z.void(),
    response: z.object({ available: z.boolean(), version: z.string().nullable() }),
  },
  /**
   * Current wa-service state. Events alone are insufficient: a renderer that
   * mounts after the last transition would have nothing to show, so the
   * degraded-state banner needs to read the value on first paint.
   */
  'system:waServiceState': {
    request: z.void(),
    response: z.object({ state: waServiceState, restartCount: z.number().int().min(0) }),
  },

  // ── Marketing suite (D89) — one file per domain under shared/contract/ ──
  ...audienceChannels,
  ...groupChannels,
  ...broadcastChannels,
  ...messagingChannels,
  ...automationChannels,
  ...workspaceChannels,
} as const

export type IpcContract = typeof ipcContract
export type IpcChannel = keyof IpcContract

/** What a handler receives: the request after parsing, with defaults applied. */
export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>
/**
 * What a caller sends: the request before parsing, so fields with a default may
 * be omitted. Without this split, adding `.default()` to a field would force
 * every existing caller to pass it.
 */
export type IpcRequestInput<C extends IpcChannel> = z.input<IpcContract[C]['request']>
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>

export const IPC_CHANNELS = Object.keys(ipcContract) as IpcChannel[]

/**
 * Compile-time guarantee that shared/channels.ts (which the sandboxed preload
 * uses) stays in lockstep with this contract. Adding a channel here without
 * adding its name there — or vice versa — is a type error.
 */
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
const _channelsMatchContract: AssertEqual<IpcChannel, IpcChannelName> = true
const _eventsMatchContract: AssertEqual<IpcEvent, IpcEventName> = true
void _channelsMatchContract
void _eventsMatchContract

// ─────────────────────────── the event contract ──────────────────────────

/**
 * Main -> renderer push. Nothing polls (CLAUDE.md §2.7): progress and status
 * always arrive as events, so a 100k-recipient campaign cannot be turned into
 * 100k renderer queries.
 */
export const ipcEvents = {
  'device:status': z.object({
    deviceId: id,
    status: deviceStatus,
    phone: z.string().nullable().optional(),
    error: z.string().nullable().optional(),
  }),
  'device:qr': z.object({ deviceId: id, qr: z.string() }),
  'device:pairingCode': z.object({ deviceId: id, code: z.string() }),
  'campaign:progress': z.object({
    campaignId: id,
    status: campaignStatus,
    sent: z.number().int().min(0),
    failed: z.number().int().min(0),
    total: z.number().int().min(0),
  }),
  'groupJob:progress': z.object({
    jobId: id,
    kind: z.enum(['send', 'create']),
    done: z.number().int().min(0),
    total: z.number().int().min(0),
    status: jobStatus,
  }),
  'message:received': z.object({ chatId: id, message }),
  'message:status': z.object({ messageId: id, status: messageStatus }),
  'license:changed': z.object({ status: licenseStatus, expiresAt: nullableIso }),
  'wa:serviceState': z.object({
    state: waServiceState,
    restartCount: z.number().int().min(0),
  }),
  toast: z.object({
    level: z.enum(['info', 'success', 'warning', 'error']),
    message: z.string(),
  }),
  ...audienceEvents,
  ...broadcastEvents,
  ...messagingEvents,
  ...automationEvents,
  ...workspaceEvents,
} as const

export type IpcEvents = typeof ipcEvents
export type IpcEvent = keyof IpcEvents
export type IpcEventPayload<E extends IpcEvent> = z.infer<IpcEvents[E]>

export const IPC_EVENTS = Object.keys(ipcEvents) as IpcEvent[]

// ────────────────────────────── wire envelope ────────────────────────────

/**
 * Handlers never throw across IPC — they resolve with a discriminated result.
 * Throwing loses the typed error taxonomy (Electron stringifies the Error) and
 * forces every call site into a try/catch.
 */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: SerializedError }
