/**
 * Protocol between main and the `wa-service` utility process.
 *
 * Mirrors the IPC contract's discipline: typed requests, typed events, and no
 * throwing across the boundary — a rejected promise loses its shape when it
 * crosses a MessagePort, so failures come back as a discriminated result.
 *
 * WHY a separate process at all (CLAUDE.md §2.3): twenty concurrent Baileys
 * sockets run continuous Signal-protocol crypto and emit a high volume of
 * events. In main that would stall window management and IPC. Isolation also
 * means a Baileys crash restarts one process instead of killing the app.
 *
 * `wa-service` never touches SQLite. It reports outcomes and main persists them,
 * so there is exactly one database writer (CLAUDE.md §2.4).
 */
import type { DeviceStatus } from './types'

// ─────────────────────────────── requests ────────────────────────────────

export type WaIncomingType =
  | 'text'
  | 'media'
  | 'attachment'
  | 'buttons'
  | 'interactive'
  | 'voice'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'poll'
  | 'event'
  | 'product'

export interface WaRequests {
  'device:connect': { deviceId: string; authDir: string }
  'device:pairingCode': { deviceId: string; phone: string }
  'device:disconnect': { deviceId: string }
  'device:logout': { deviceId: string }
  'device:isConnected': { deviceId: string }
  'group:fetch': { deviceId: string }
  'group:create': { deviceId: string; subject: string; participants: string[] }
  'message:send': {
    deviceId: string
    to: string
    message: WaOutgoing
    /**
     * A person typing in the inbox is not automation: their reply goes out even
     * inside quiet hours. Everything automated (campaigns, sequences, bots,
     * group jobs, posts) leaves this unset and parks instead (D89).
     */
    manual?: boolean
    /**
     * A welcome or away message answering what the customer just sent: sent
     * inside quiet hours, still held by the daily cap (D151).
     */
    reply?: boolean
  }
  /** Apply pacing rules to a device. Sent whenever sending defaults change. */
  'throttle:configure': {
    deviceId: string
    delayFromMs?: number
    delayToMs?: number
    sleepDurationMs?: number
    sleepAfter?: number
    dailyCap?: number
    /** Today's count, so a restart does not reset the daily cap. */
    sentToday?: number
    /** Minutes after local midnight; null disables quiet hours. */
    quietHours?: { start: number; end: number } | null
    /** Show "typing…"/"recording…" before each automated send. */
    simulateTyping?: boolean
  }
  /** Post a status (story). Paced like any send — it is traffic from the account. */
  'status:post': {
    deviceId: string
    message: WaStatusContent
    /** JIDs allowed to see it. WhatsApp requires an explicit audience. */
    statusJidList: string[]
  }
  /** Which of these E.164 numbers have WhatsApp. Read-only, but rate limited. */
  'number:check': { deviceId: string; phones: string[] }
  'message:read': { deviceId: string; chatJid: string; messageIds: string[] }
  'group:metadata': { deviceId: string; groupId: string }
  'group:inviteCode': { deviceId: string; groupId: string }
  'group:revokeInvite': { deviceId: string; groupId: string }
  'group:acceptInvite': { deviceId: string; code: string }
  'group:setting': {
    deviceId: string
    groupId: string
    setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked'
  }
  'group:joinApproval': { deviceId: string; groupId: string; enabled: boolean }
  'group:description': { deviceId: string; groupId: string; description: string }
  'group:requests': { deviceId: string; groupId: string }
  'group:requestsUpdate': {
    deviceId: string
    groupId: string
    jids: string[]
    action: 'approve' | 'reject'
  }
  'group:participants': {
    deviceId: string
    groupId: string
    jids: string[]
    action: 'add' | 'remove' | 'promote' | 'demote'
  }
  'community:fetch': { deviceId: string }
  'community:create': { deviceId: string; subject: string; description: string }
  'community:link': { deviceId: string; communityId: string; groupId: string }
  'community:unlink': { deviceId: string; communityId: string; groupId: string }
  'community:createGroup': {
    deviceId: string
    communityId: string
    subject: string
    participants: string[]
  }
  'channel:create': { deviceId: string; name: string; description: string }
  /** `key` is an invite code (whatsapp.com/channel/<code>) or a newsletter JID. */
  'channel:follow': { deviceId: string; key: string }
  /** Paced like any send. */
  'channel:post': { deviceId: string; channelId: string; message: WaStatusContent }
  'catalog:fetch': { deviceId: string }
  'business:profile': { deviceId: string }
  'chat:label': {
    deviceId: string
    chatJid: string
    labelId: string
    action: 'add' | 'remove'
  }
  'call:reject': { deviceId: string; callId: string; from: string }
  'service:ping': Record<string, never>
  'service:shutdown': Record<string, never>
}

/** One tappable button on an outgoing message (REQUIREMENTS §7.9). */
export interface WaButton {
  type: 'reply' | 'url' | 'call' | 'copy'
  /** Stable id echoed back when the recipient taps a reply button. */
  id: string
  label: string
  /** URL, phone number or copied text, by type. */
  value?: string
}

export type WaOutgoing =
  | { kind: 'text'; body: string }
  | { kind: 'media'; path: string; mediaType: 'image' | 'video'; caption?: string }
  | { kind: 'document'; path: string; fileName: string; caption?: string }
  | { kind: 'buttons'; body: string; footer?: string; buttons: WaButton[] }
  | {
      kind: 'list'
      body: string
      footer?: string
      buttonText: string
      rows: Array<{ id: string; title: string; description?: string }>
    }
  /** `ptt` = push-to-talk: shown as a voice note rather than an audio file. */
  | { kind: 'audio'; path: string; ptt: boolean }
  | { kind: 'sticker'; path: string }
  | {
      kind: 'location'
      latitude: number
      longitude: number
      name?: string
      address?: string
    }
  | { kind: 'contacts'; contacts: Array<{ name: string; phone: string }> }
  | { kind: 'poll'; name: string; options: string[]; selectableCount: number }
  | {
      kind: 'event'
      name: string
      description?: string
      startAt: string
      endAt?: string
      location?: string
    }
  | {
      kind: 'product'
      productId: string
      title: string
      description?: string
      priceAmount1000?: number
      currency?: string
      imageUrl?: string
      body?: string
    }

/** What a status update or channel post can carry. */
export type WaStatusContent =
  | { kind: 'text'; body: string; backgroundColor?: string }
  | { kind: 'media'; path: string; mediaType: 'image' | 'video'; caption?: string }

export interface WaParticipant {
  jid: string
  phone: string
  isAdmin: boolean
}

export interface WaGroupMetadata {
  id: string
  name: string
  description: string | null
  participants: WaParticipant[]
  announce: boolean
  restrict: boolean
  joinApproval: boolean
  isCommunity: boolean
  parentId: string | null
}

export interface WaProduct {
  id: string
  name: string
  description: string | null
  priceAmount1000: number | null
  currency: string | null
  imageUrl: string | null
}

export interface WaRemoteGroup {
  id: string
  name: string
  memberCount: number
  isAdmin: boolean
}

export interface WaResponses {
  'device:connect': { started: true }
  'device:pairingCode': { code: string }
  'device:disconnect': { ok: true }
  'device:logout': { ok: true }
  'device:isConnected': { connected: boolean }
  'group:fetch': { groups: WaRemoteGroup[] }
  'group:create': WaRemoteGroup
  'message:send': { messageId: string }
  'throttle:configure': { ok: true }
  'status:post': { messageId: string }
  'number:check': {
    results: Array<{ phone: string; exists: boolean; jid: string | null }>
  }
  'message:read': { ok: true }
  'group:metadata': WaGroupMetadata
  'group:inviteCode': { code: string }
  'group:revokeInvite': { code: string }
  'group:acceptInvite': { groupId: string }
  'group:setting': { ok: true }
  'group:joinApproval': { ok: true }
  'group:description': { ok: true }
  'group:requests': {
    requests: Array<{ jid: string; phone: string; requestedAt: string | null }>
  }
  'group:requestsUpdate': {
    results: Array<{ jid: string; ok: boolean; error: string | null }>
  }
  'group:participants': {
    results: Array<{ jid: string; ok: boolean; error: string | null }>
  }
  'community:fetch': {
    communities: Array<{ id: string; name: string; linkedGroupIds: string[] }>
  }
  'community:create': { id: string; name: string }
  'community:link': { ok: true }
  'community:unlink': { ok: true }
  'community:createGroup': WaRemoteGroup
  'channel:create': { id: string; name: string; inviteCode: string | null }
  'channel:follow': {
    id: string
    name: string
    description: string | null
    subscribers: number
    inviteCode: string | null
  }
  'channel:post': { messageId: string }
  'catalog:fetch': { products: WaProduct[] }
  'business:profile': { isBusiness: boolean }
  'chat:label': { ok: true }
  'call:reject': { ok: true }
  'service:ping': { pong: true; sessions: number }
  'service:shutdown': { ok: true }
}

export type WaRequestKind = keyof WaRequests

export interface WaRequestEnvelope<K extends WaRequestKind = WaRequestKind> {
  id: number
  kind: K
  payload: WaRequests[K]
}

export type WaResult<K extends WaRequestKind> =
  { ok: true; data: WaResponses[K] } | { ok: false; error: string }

export interface WaResponseEnvelope<K extends WaRequestKind = WaRequestKind> {
  id: number
  result: WaResult<K>
}

// ──────────────────────────────── events ─────────────────────────────────

/**
 * One number a linked phone knows. `source` says where WhatsApp reported it:
 * the phone's address book, or a chat in its chat list (which also covers
 * people who messaged the user but were never saved).
 */
export interface WaSyncedContact {
  jid: string
  phone: string
  name: string | null
  source: 'addressBook' | 'chat'
  /** Last activity in the chat, ISO; only for `source: 'chat'`. */
  lastChatAt?: string | null
}

export interface WaEvents {
  status: { deviceId: string; status: DeviceStatus; phone?: string; error?: string }
  qr: { deviceId: string; qr: string }
  pairingCode: { deviceId: string; code: string }
  message: {
    deviceId: string
    message: {
      id: string
      chatId: string
      from: string
      pushName: string | null
      isGroup: boolean
      type: WaIncomingType
      body: string | null
      fileName: string | null
      fileSize: number | null
      timestamp: string
    }
  }
  receipt: { deviceId: string; messageId: string; status: 'delivered' | 'read' }
  /** An incoming voice or video call offer. */
  call: { deviceId: string; callId: string; from: string; isVideo: boolean }
  /** A WhatsApp Business label was created, changed or deleted. */
  label: {
    deviceId: string
    labelId: string
    name: string
    color: number
    deleted: boolean
  }
  labelAssociation: {
    deviceId: string
    labelId: string
    chatJid: string
    action: 'add' | 'remove'
  }
  /** Address-book / chat contacts the phone knows, as WhatsApp syncs them. */
  contacts: {
    deviceId: string
    contacts: WaSyncedContact[]
  }
  /**
   * A person's phone number became known for a LID (`<id>@lid`) — rows stored
   * with the hidden stand-in, or filed under the LID, can now be corrected.
   */
  lidMapping: {
    deviceId: string
    mappings: Array<{ lid: string; phone: string }>
  }
  /** Emitted after the reconnect budget is exhausted, so main can inform the user. */
  giveUp: { deviceId: string; attempts: number; detail: string }
  log: { level: 'info' | 'warn' | 'error'; message: string }
}

export type WaEventKind = keyof WaEvents

export interface WaEventEnvelope<K extends WaEventKind = WaEventKind> {
  event: K
  payload: WaEvents[K]
}

export type WaMessage = WaResponseEnvelope | WaEventEnvelope

export function isEventEnvelope(message: WaMessage): message is WaEventEnvelope {
  return 'event' in message
}
