'use client'

import type { IpcResponse } from '@shared/ipc'
import { cn } from '@renderer/lib/cn'

export type QuickReply = IpcResponse<'quickReply:list'>[number]

/** The "/" token being typed at the end of the message box, if any. */
export function slashQuery(draft: string): string | undefined {
  return /(?:^|\s)\/([a-z0-9-]*)$/i.exec(draft)?.[1]?.toLowerCase()
}

export function matchQuickReplies(items: QuickReply[], query: string): QuickReply[] {
  return items
    .filter((qr) => qr.shortcut.includes(query) || qr.title.toLowerCase().includes(query))
    .slice(0, 8)
}

/** The list that opens above the message box while a "/shortcut" is typed. */
export function QuickReplyPicker({
  query,
  items,
  loading,
  activeIndex,
  onPick,
  onHover,
  onManage,
}: {
  query: string
  items: QuickReply[]
  loading: boolean
  activeIndex: number
  onPick: (reply: QuickReply) => void
  onHover: (index: number) => void
  onManage: () => void
}) {
  return (
    <div
      className="absolute right-0 bottom-full left-0 z-10 mb-1 rounded-card border border-line bg-surface py-1 shadow-lg"
      data-testid="qr-picker"
      role="listbox"
      aria-label="Quick replies"
    >
      {items.length === 0 ? (
        <p className="px-3 py-2 text-xs text-ink-muted" data-testid="qr-picker-empty">
          {loading
            ? 'Loading…'
            : query === ''
              ? 'No quick replies yet. Save answers you send often and insert them here.'
              : `No quick reply matches “/${query}”.`}
        </p>
      ) : (
        items.map((qr, i) => (
          <button
            key={qr.id}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            data-testid="qr-option"
            // mousedown, not click: a click would blur the message box first.
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(qr)
            }}
            onMouseEnter={() => onHover(i)}
            className={cn(
              'flex w-full flex-col px-3 py-1.5 text-left',
              i === activeIndex ? 'bg-wa-in' : 'hover:bg-app-bg',
            )}
          >
            <span className="text-sm text-ink">
              <span className="font-mono font-semibold">/{qr.shortcut}</span>{' '}
              <span className="text-ink-muted">· {qr.title}</span>
            </span>
            <span className="truncate text-xs text-ink-subtle">{qr.body}</span>
          </button>
        ))
      )}
      <div className="flex items-center justify-between border-t border-line px-3 pt-1.5 pb-0.5">
        <span className="text-[10px] text-ink-subtle">
          ↑ ↓ to choose · Enter to insert · Esc to close
        </span>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            onManage()
          }}
          className="text-[11px] text-primary hover:underline"
          data-testid="qr-manage"
        >
          Manage quick replies
        </button>
      </div>
    </div>
  )
}
