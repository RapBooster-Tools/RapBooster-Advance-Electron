'use client'

import { formatDistanceToNow } from 'date-fns'
import { cn } from '@renderer/lib/cn'
import { ChatFilterTabs, type ChatFilter } from './chat-filter-tabs'
import type { InboxChat } from './inbox-types'
import { displayPhone } from '@shared/phone-display'

/** The left column: search, device filter, filter tabs and the conversations. */
export function ChatList({
  chats,
  devices,
  activeId,
  onSelect,
  search,
  onSearch,
  deviceFilter,
  onDeviceFilter,
  filter,
  onFilter,
}: {
  chats: InboxChat[]
  devices: Array<{ id: string; name: string }>
  activeId: string | undefined
  onSelect: (chatId: string) => void
  search: string
  onSearch: (value: string) => void
  deviceFilter: string
  onDeviceFilter: (value: string) => void
  filter: ChatFilter
  onFilter: (value: ChatFilter) => void
}) {
  return (
    <div
      className="flex w-[300px] shrink-0 flex-col border-r border-line"
      data-tour="inbox-chat-list"
    >
      <div className="flex flex-col gap-2 border-b border-line p-3">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search chats..."
          data-testid="chat-search"
          className="rounded-control border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-primary"
        />
        <select
          value={deviceFilter}
          onChange={(e) => onDeviceFilter(e.target.value)}
          data-testid="chat-device-filter"
          className="rounded-control border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-primary"
        >
          <option value="">-- All Devices --</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <ChatFilterTabs value={filter} onChange={onFilter} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="chat-list">
        {chats.length === 0 ? (
          <p className="p-4 text-xs text-ink-muted">No conversations yet.</p>
        ) : (
          chats.map((chat) => (
            <button
              key={chat.id}
              type="button"
              data-testid="chat-item"
              onClick={() => onSelect(chat.id)}
              className={cn(
                'flex w-full flex-col gap-0.5 border-b border-line px-3 py-2 text-left',
                chat.id === activeId ? 'bg-wa-in' : 'hover:bg-app-bg',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-ink">
                  {displayPhone(chat.name)}
                </span>
                {chat.unreadCount > 0 && (
                  <span
                    className="shrink-0 rounded-full bg-primary px-1.5 text-xs text-on-primary"
                    data-testid="unread-badge"
                  >
                    {chat.unreadCount}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="truncate text-xs text-ink-muted">
                  {displayPhone(chat.phone)}
                </span>
                {chat.pendingDrafts > 0 && (
                  <span
                    className="shrink-0 rounded bg-status-warn-bg px-1.5 text-[10px] text-status-warn-fg"
                    data-testid="drafts-badge"
                  >
                    {chat.pendingDrafts} draft{chat.pendingDrafts === 1 ? '' : 's'}
                  </span>
                )}
                {chat.optedOut && (
                  <span
                    className="shrink-0 rounded bg-status-idle-bg px-1.5 text-[10px] text-status-idle-fg"
                    data-testid="opted-out-badge"
                  >
                    Opted out
                  </span>
                )}
              </span>
              <span className="truncate text-xs text-ink-subtle">
                {chat.lastMessage ?? ''}
              </span>
              {chat.lastMessageAt && (
                <span className="text-[10px] text-ink-subtle">
                  {formatDistanceToNow(new Date(chat.lastMessageAt))} ago
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
