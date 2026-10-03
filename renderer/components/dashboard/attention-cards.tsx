'use client'

import Link from 'next/link'

/** Inbox work waiting on a person: escalated chats and AI drafts to approve. */
export function AttentionCards({
  escalated,
  drafts,
}: {
  escalated: number
  drafts: number
}) {
  const cards = [
    { label: 'Escalated chats', value: escalated, testId: 'escalated-count' },
    { label: 'AI drafts awaiting approval', value: drafts, testId: 'drafts-count' },
  ]
  return (
    <div className="grid grid-cols-2 gap-4">
      {cards.map((card) => (
        <Link
          key={card.testId}
          href="/inbox"
          data-testid={`${card.testId}-link`}
          className="rounded-card border border-line bg-surface px-4 py-3 transition-colors hover:border-primary"
        >
          <span className="block text-xs text-ink-muted">{card.label}</span>
          <span
            className="mt-1 block text-2xl font-semibold text-ink"
            data-testid={card.testId}
          >
            {card.value}
          </span>
          <span className="text-xs text-primary">Open inbox →</span>
        </Link>
      ))}
    </div>
  )
}
