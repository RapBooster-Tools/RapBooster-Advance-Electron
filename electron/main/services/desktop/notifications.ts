/**
 * Desktop notifications for inbound messages, and the unread badge.
 *
 * Message content is customer data (CLAUDE.md §5.2): it reaches the OS
 * notification and nothing else — never a log line, and never the E2E log seam.
 */
import { app, BrowserWindow, Notification } from 'electron'
import { appendFileSync } from 'node:fs'
import { getPrisma } from '../../db/client'

export interface IncomingMessage {
  chatId: string
  chatName: string
  preview: string | null
  isGroup: boolean
}

/** At most one notification per chat in this window, and the burst horizon. */
const WINDOW_MS = 10_000
/** More distinct chats than this inside the window collapse into one summary. */
const MAX_CHATS = 3
const PREVIEW_CHARS = 80

export interface Shown {
  title: string
  body: string
  chatId?: string
  onClick: () => void
}

/**
 * NOTE: E2E seam. With NODE_ENV=test and RB_NOTIFY_LOG set, notifications are
 * appended to that file as `{title, chatId}` instead of reaching the OS — a
 * headless run has no notification server, and a developer running the suite
 * should not be flooded. The body is deliberately left out so a spec can assert
 * that content never lands in a file.
 */
const TEST_LOG =
  process.env.NODE_ENV === 'test' ? process.env.RB_NOTIFY_LOG || undefined : undefined

/** Held so a notification is not garbage-collected before its click arrives. */
const live = new Set<Notification>()
let lastShown: Shown | undefined

export function show(n: Shown): void {
  lastShown = n
  if (TEST_LOG) {
    try {
      appendFileSync(
        TEST_LOG,
        `${JSON.stringify({ title: n.title, ...(n.chatId ? { chatId: n.chatId } : {}) })}\n`,
      )
    } catch (err) {
      console.error('desktop: could not write the notification test log', err)
    }
    return
  }
  if (!Notification.isSupported()) {
    console.debug('desktop: notifications are not supported on this system')
    return
  }
  const note = new Notification({ title: n.title, body: n.body })
  live.add(note)
  note.on('click', () => {
    live.delete(note)
    n.onClick()
  })
  note.on('close', () => live.delete(note))
  note.show()
}

/** The most recent notification — the E2E seam clicks it. */
export function lastNotification(): Shown | undefined {
  return lastShown
}

/** Whether the user is looking at the app right now. */
export function appInForeground(): boolean {
  return BrowserWindow.getAllWindows().some(
    (w) => !w.isDestroyed() && w.isVisible() && !w.isMinimized() && w.isFocused(),
  )
}

function shorten(text: string | null): string {
  if (!text) return 'New message'
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length === 0) return 'New message'
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS - 1)}…` : flat
}

/**
 * Burst coalescing. A campaign that lands twenty replies in a few seconds must
 * not bury the desktop in twenty toasts: each chat notifies at most once per
 * window, and once more than MAX_CHATS chats are active the rest fold into one
 * "N new messages" summary (with a trailing update if more keep arriving).
 */
export class Coalescer {
  private arrivals: { chatId: string; at: number }[] = []
  private readonly lastPerChat = new Map<string, number>()
  private summaryAt = Number.NEGATIVE_INFINITY
  private sinceSummary = 0
  private trailing: NodeJS.Timeout | undefined

  constructor(
    private readonly emit: (n: Omit<Shown, 'onClick'> & { summary: boolean }) => void,
    private readonly now: () => number = Date.now,
  ) {}

  add(message: IncomingMessage): void {
    const now = this.now()
    this.arrivals = this.arrivals.filter((a) => now - a.at < WINDOW_MS)
    for (const [chatId, at] of this.lastPerChat) {
      if (now - at >= WINDOW_MS) this.lastPerChat.delete(chatId)
    }
    this.arrivals.push({ chatId: message.chatId, at: now })

    const chats = new Set(this.arrivals.map((a) => a.chatId))
    if (chats.size > MAX_CHATS) {
      this.summarise(now, chats.size)
      return
    }
    if (this.lastPerChat.has(message.chatId)) return
    this.lastPerChat.set(message.chatId, now)
    this.emit({
      title: message.chatName,
      body: shorten(message.preview),
      chatId: message.chatId,
      summary: false,
    })
  }

  private summarise(now: number, chatCount: number): void {
    if (now - this.summaryAt >= WINDOW_MS) {
      this.summaryAt = now
      this.sinceSummary = 0
      this.emitSummary(this.arrivals.length, chatCount)
      return
    }
    this.sinceSummary += 1
    if (this.trailing) return
    this.trailing = setTimeout(
      () => {
        this.trailing = undefined
        if (this.sinceSummary === 0) return
        const count = this.sinceSummary
        this.summaryAt = this.now()
        this.sinceSummary = 0
        this.emitSummary(count, null)
      },
      this.summaryAt + WINDOW_MS - now,
    )
  }

  private emitSummary(count: number, chatCount: number | null): void {
    this.emit({
      title: `${count} new message${count === 1 ? '' : 's'}`,
      body:
        chatCount === null
          ? 'Open RapBooster to read them.'
          : `From ${chatCount} chats. Open RapBooster to read them.`,
      summary: true,
    })
  }
}

let badgeTimer: NodeJS.Timeout | undefined

/**
 * Sync the Dock badge (macOS; Unity on Linux) with the total unread count.
 * Debounced: a burst of messages costs one aggregate query, not one each.
 * Windows has no numeric taskbar badge — the frame flashes instead.
 */
export function refreshBadge(): void {
  if (process.platform === 'win32') return
  clearTimeout(badgeTimer)
  badgeTimer = setTimeout(() => {
    void getPrisma()
      .chat.aggregate({ _sum: { unreadCount: true } })
      .then((r) => app.setBadgeCount(r._sum.unreadCount ?? 0))
      .catch((err: unknown) =>
        console.error('desktop: could not count unread chats', err),
      )
  }, 300)
}

/** Draw attention to the taskbar entry on Windows when a message arrives unseen. */
export function flashForAttention(): void {
  if (process.platform !== 'win32') return
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && w.isVisible() && !w.isFocused()) w.flashFrame(true)
  }
}
