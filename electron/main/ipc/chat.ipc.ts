/**
 * Inbox channels.
 *
 * Messages are persisted by main as wa-service reports them, so the inbox
 * survives a restart and a wa-service crash. History is paged backwards rather
 * than loaded whole — a long-running account accumulates thousands of messages
 * per chat.
 */
import { rmSync } from 'node:fs'
import { AppError } from '../../../shared/errors'
import { decodeButtons } from '../../../shared/template-buttons'
import type { MessageType, TemplateButton } from '../../../shared/types'
import { getPrisma } from '../db/client'
import { prepareInboxRich } from '../services/inbox-rich'
import { refreshBadge } from '../services/desktop/notifications'
import { waBridge } from '../wa-bridge'
import { registerHandler } from './router'

function parseButtons(value: string | null): TemplateButton[] | null {
  if (!value) return null
  const decoded = decodeButtons(value)
  return decoded.length > 0 ? decoded : null
}

function serializeMessage(row: {
  id: string
  chatId: string
  direction: string
  type: string
  body: string | null
  mediaPath: string | null
  fileName: string | null
  fileSize: number | null
  buttons: string | null
  status: string
  isAiReply: boolean
  timestamp: Date
}) {
  return {
    id: row.id,
    chatId: row.chatId,
    direction: row.direction as 'in' | 'out',
    type: row.type as MessageType,
    body: row.body,
    mediaPath: row.mediaPath,
    fileName: row.fileName,
    fileSize: row.fileSize,
    buttons: parseButtons(row.buttons),
    status: row.status as 'pending' | 'sent' | 'delivered' | 'read' | 'failed',
    isAiReply: row.isAiReply,
    timestamp: row.timestamp.toISOString(),
  }
}

/** A chat's number as E.164 — chats store it with or without the plus. */
export function chatE164(phone: string): string {
  return phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`
}

interface ChatRow {
  id: string
  deviceId: string
  name: string
  phone: string
  isGroup: boolean
  lastMessage: string | null
  lastMessageAt: Date | null
  unreadCount: number
  isEscalated: boolean
  autoReplyOptOut: boolean
}

/** Draft counts and opt-out status for a page of chats, in two queries. */
async function chatExtras(rows: ChatRow[]) {
  const prisma = getPrisma()
  const ids = rows.map((r) => r.id)
  const [drafts, suppressed] = await Promise.all([
    prisma.aiDraft.groupBy({
      by: ['chatId'],
      where: { chatId: { in: ids }, status: { in: ['pending_approval', 'held'] } },
      _count: { _all: true },
    }),
    prisma.suppression.findMany({
      where: {
        phone: { in: rows.filter((r) => !r.isGroup).map((r) => chatE164(r.phone)) },
      },
      select: { phone: true },
    }),
  ])
  return {
    drafts: new Map(drafts.map((d) => [d.chatId, d._count._all])),
    suppressed: new Set(suppressed.map((x) => x.phone)),
  }
}

function serializeChat(
  row: ChatRow,
  extras: { drafts: Map<string, number>; suppressed: Set<string> },
) {
  return {
    id: row.id,
    deviceId: row.deviceId,
    name: row.name,
    phone: row.phone,
    isGroup: row.isGroup,
    lastMessage: row.lastMessage,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    unreadCount: row.unreadCount,
    isEscalated: row.isEscalated,
    autoReplyOptOut: row.autoReplyOptOut,
    pendingDrafts: extras.drafts.get(row.id) ?? 0,
    optedOut: !row.isGroup && extras.suppressed.has(chatE164(row.phone)),
  }
}

/**
 * Store a message this account sent and move its chat to the top of the list.
 *
 * WHY shared: typed replies, rich sends and scheduled messages (Wave 3) all
 * record an outbound message; one writer keeps the row shape and the chat
 * preview identical however the message left.
 */
export async function persistOutgoing(
  chatId: string,
  row: {
    id: string
    type: MessageType
    body: string | null
    mediaPath?: string | null
    fileName?: string | null
    buttons?: string | null
    /** The chat list's one-line preview. */
    preview: string
  },
): Promise<ReturnType<typeof serializeMessage>> {
  const prisma = getPrisma()
  const at = new Date()
  const [saved] = await prisma.$transaction([
    prisma.message.create({
      data: {
        id: row.id,
        chatId,
        direction: 'out',
        type: row.type,
        body: row.body,
        mediaPath: row.mediaPath ?? null,
        fileName: row.fileName ?? null,
        buttons: row.buttons ?? null,
        status: 'sent',
        timestamp: at,
      },
    }),
    prisma.chat.update({
      where: { id: chatId },
      data: { lastMessage: row.preview, lastMessageAt: at },
    }),
  ])
  return serializeMessage(saved)
}

export function registerChatHandlers(): void {
  registerHandler('chat:list', async ({ deviceId, search, filter, cursor, limit }) => {
    const where = {
      ...(deviceId ? { deviceId } : {}),
      ...(filter === 'unread' ? { unreadCount: { gt: 0 } } : {}),
      ...(filter === 'escalated' ? { isEscalated: true } : {}),
      ...(filter === 'drafts'
        ? { drafts: { some: { status: { in: ['pending_approval', 'held'] } } } }
        : {}),
      ...(search && search.trim() !== ''
        ? {
            OR: [
              { name: { contains: search.trim() } },
              { phone: { contains: search.trim() } },
            ],
          }
        : {}),
    }

    const [rows, total] = await Promise.all([
      getPrisma().chat.findMany({
        where,
        // Most recent first: an inbox sorted any other way is unusable.
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'asc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      getPrisma().chat.count({ where }),
    ])

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    const extras = await chatExtras(page)
    return {
      items: page.map((row) => serializeChat(row, extras)),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      total,
    }
  })

  registerHandler('chat:get', async ({ id }) => {
    const chat = await getPrisma().chat.findUnique({ where: { id } })
    if (!chat)
      throw new AppError('NOT_FOUND', { userMessage: 'That chat no longer exists.' })
    return serializeChat(chat, await chatExtras([chat]))
  })

  registerHandler('chat:messages', async ({ chatId, before, limit }) => {
    const where = {
      chatId,
      ...(before ? { timestamp: { lt: new Date(before) } } : {}),
    }

    const [rows, total] = await Promise.all([
      // Newest first so paging backwards is a simple `before` cursor; the UI
      // reverses for display.
      getPrisma().message.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit + 1,
      }),
      getPrisma().message.count({ where: { chatId } }),
    ])

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    return {
      items: page.map(serializeMessage),
      nextCursor: hasMore
        ? (page[page.length - 1]?.timestamp.toISOString() ?? null)
        : null,
      total,
    }
  })

  registerHandler('chat:send', async ({ chatId, body, mediaSourcePath, buttons }) => {
    const chat = await getPrisma().chat.findUnique({ where: { id: chatId } })
    if (!chat)
      throw new AppError('NOT_FOUND', { userMessage: 'That chat no longer exists.' })

    if (!body && !mediaSourcePath) {
      throw new AppError('VALIDATION_FAILED', { userMessage: 'Type a message first.' })
    }

    const message = mediaSourcePath
      ? ({ kind: 'media', path: mediaSourcePath, mediaType: 'image' as const } as const)
      : buttons && buttons.length > 0
        ? ({
            kind: 'buttons' as const,
            body: body ?? '',
            buttons: buttons.map((b, i) => ({
              type: b.type,
              id: `btn_${i + 1}`,
              label: b.label,
              ...(b.value ? { value: b.value } : {}),
            })),
          } as const)
        : ({ kind: 'text', body: body ?? '' } as const)

    let messageId: string
    try {
      // Goes through wa-service, so the throttle applies here too — a reply
      // typed by hand is still traffic from the user's account.
      const result = await waBridge.request('message:send', {
        deviceId: chat.deviceId,
        to: chat.id,
        message,
        // A person typing a reply: exempt from quiet hours and the daily cap (D89).
        manual: true,
      })
      messageId = result.messageId
    } catch (err) {
      throw new AppError('SEND_FAILED', {
        detail: err instanceof Error ? err.message : String(err),
      })
    }

    return persistOutgoing(chatId, {
      id: messageId,
      type: mediaSourcePath ? 'media' : buttons?.length ? 'buttons' : 'text',
      body: body ?? null,
      mediaPath: mediaSourcePath ?? null,
      buttons: buttons?.length ? JSON.stringify(buttons) : null,
      preview: body ?? '[media]',
    })
  })

  registerHandler('chat:sendRich', async ({ chatId, message }) => {
    const chat = await getPrisma().chat.findUnique({ where: { id: chatId } })
    if (!chat)
      throw new AppError('NOT_FOUND', { userMessage: 'That chat no longer exists.' })

    // Validates and copies a voice note or sticker before anything is sent.
    const prepared = prepareInboxRich(chatId, message)

    let messageId: string
    try {
      const result = await waBridge.request('message:send', {
        deviceId: chat.deviceId,
        to: chat.id,
        message: prepared.message,
        // Typed by a person in the inbox, like chat:send (D89).
        manual: true,
      })
      messageId = result.messageId
    } catch (err) {
      // Nothing will reference the copy of a file that never went out.
      if (prepared.mediaPath) rmSync(prepared.mediaPath, { force: true })
      throw new AppError('SEND_FAILED', {
        detail: err instanceof Error ? err.message : String(err),
      })
    }

    return persistOutgoing(chatId, {
      id: messageId,
      type: prepared.type,
      body: prepared.summary,
      mediaPath: prepared.mediaPath,
      fileName: prepared.fileName,
      preview: prepared.summary,
    })
  })

  registerHandler('chat:markRead', async ({ chatId }) => {
    await getPrisma().chat.update({ where: { id: chatId }, data: { unreadCount: 0 } })
    refreshBadge()
    return { ok: true as const }
  })

  registerHandler('chat:setOptOut', async ({ chatId, optOut }) => {
    await getPrisma().chat.update({
      where: { id: chatId },
      data: { autoReplyOptOut: optOut },
    })
    return { ok: true as const }
  })

  registerHandler('chat:resumeBot', async ({ chatId }) => {
    await getPrisma().chat.update({
      where: { id: chatId },
      data: { isEscalated: false },
    })
    return { ok: true as const }
  })
}

/**
 * Persist an inbound message and return it for broadcasting.
 *
 * Upserts the chat because a message can arrive from someone with no prior
 * conversation, and does nothing if the message id is already known — WhatsApp
 * can redeliver on reconnect, and a duplicate row would show the user the same
 * message twice.
 */
export async function persistIncoming(
  deviceId: string,
  incoming: {
    id: string
    chatId: string
    from: string
    pushName: string | null
    isGroup: boolean
    type: MessageType
    body: string | null
    fileName: string | null
    fileSize: number | null
    timestamp: string
  },
): Promise<ReturnType<typeof serializeMessage> | null> {
  const prisma = getPrisma()

  const existing = await prisma.message.findUnique({ where: { id: incoming.id } })
  if (existing) return null

  // WHY: a group is named by its subject, never by whichever member wrote
  // last — the sender's push name would rename the group on every message.
  const groupName = incoming.isGroup
    ? ((
        await prisma.group.findUnique({
          where: { id: incoming.chatId },
          select: { name: true },
        })
      )?.name ?? 'Group')
    : null

  await prisma.chat.upsert({
    where: { id: incoming.chatId },
    create: {
      id: incoming.chatId,
      deviceId,
      name: groupName ?? incoming.pushName ?? incoming.from,
      // A group's "phone" is its id; `from` is the member who wrote.
      phone: incoming.isGroup
        ? (incoming.chatId.split('@')[0] ?? incoming.chatId)
        : incoming.from,
      isGroup: incoming.isGroup,
      lastMessage: incoming.body,
      lastMessageAt: new Date(incoming.timestamp),
      unreadCount: 1,
    },
    update: {
      // A pushName can appear later than the first message.
      ...(!incoming.isGroup && incoming.pushName ? { name: incoming.pushName } : {}),
      lastMessage: incoming.body,
      lastMessageAt: new Date(incoming.timestamp),
      unreadCount: { increment: 1 },
    },
  })

  const saved = await prisma.message.create({
    data: {
      id: incoming.id,
      chatId: incoming.chatId,
      direction: 'in',
      type: incoming.type,
      body: incoming.body,
      fileName: incoming.fileName,
      fileSize: incoming.fileSize,
      status: 'delivered',
      timestamp: new Date(incoming.timestamp),
    },
  })

  return serializeMessage(saved)
}
