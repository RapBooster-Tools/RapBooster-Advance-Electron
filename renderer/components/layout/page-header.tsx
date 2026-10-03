'use client'

import type { ReactNode } from 'react'

/**
 * Screen title row. One per screen, first thing in the content column.
 *
 * `title` is the screen's name (an <h1>, test id `page-title` — a contract
 * with the E2E suite); `description` says in one plain sentence what the
 * screen is for; `actions` holds the screen's main action — at most one
 * primary Button. `helpSlot` is reserved for a per-screen help control.
 */
export function PageHeader({
  title,
  description,
  actions,
  helpSlot,
}: {
  title: string
  description?: string
  actions?: ReactNode
  helpSlot?: ReactNode
}) {
  return (
    <div className="relative flex shrink-0 items-start justify-between gap-4 border-b border-line bg-surface px-6 py-5">
      {/* Soft brand glow in the corner: depth without a heavy banner. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: 'var(--gradient-glow)' }}
      />
      <div className="relative min-w-0">
        <div className="flex items-center gap-2">
          <h1
            className="text-xl leading-7 font-semibold tracking-tight text-ink"
            data-testid="page-title"
          >
            {title}
          </h1>
          {helpSlot}
        </div>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && (
        <div className="relative flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  )
}
