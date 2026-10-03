'use client'

import { cn } from '@renderer/lib/cn'

export type ChatFilter = 'all' | 'unread' | 'escalated' | 'drafts'

const TABS: Array<[ChatFilter, string]> = [
  ['all', 'All'],
  ['unread', 'Unread'],
  ['escalated', 'Escalated'],
  ['drafts', 'Drafts'],
]

export function ChatFilterTabs({
  value,
  onChange,
}: {
  value: ChatFilter
  onChange: (value: ChatFilter) => void
}) {
  return (
    <div role="tablist" aria-label="Filter chats" className="flex gap-1">
      {TABS.map(([tab, label]) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={value === tab}
          data-testid={`chat-filter-${tab}`}
          onClick={() => onChange(tab)}
          className={cn(
            'flex-1 rounded-control px-2 py-1 text-xs font-medium',
            value === tab
              ? 'bg-primary text-on-primary'
              : 'text-ink-muted hover:bg-wa-in',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
