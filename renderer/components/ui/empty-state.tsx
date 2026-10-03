'use client'

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

/**
 * Every screen ships a real empty state rather than a blank panel — an empty
 * screen with no explanation reads as a broken app.
 *
 * Shape: what this place is for (title), why it is empty and what to do
 * (description), and ONE obvious next step (action, usually a primary
 * Button). A second, quieter option goes in `secondaryAction`.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  testId,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  secondaryAction?: ReactNode
  /** Smaller padding, for an empty panel inside a card rather than a whole screen. */
  compact?: boolean
  testId?: string
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'flex flex-1 animate-fade-in flex-col items-center justify-center gap-3 px-6 text-center',
        compact ? 'py-8' : 'py-16',
      )}
    >
      {/* Illustration-style badge: a soft halo, a gradient tile, the icon. */}
      <div className="relative mb-1 flex items-center justify-center" aria-hidden>
        <div className="absolute size-24 rounded-full bg-primary/8 blur-[1px]" />
        <div className="absolute size-16 rounded-full bg-primary/10" />
        <div
          className="relative flex size-12 rotate-[-6deg] items-center justify-center rounded-2xl shadow-raised"
          style={{ backgroundImage: 'var(--gradient-accent)' }}
        >
          <Icon className="size-6 rotate-[6deg] text-white" strokeWidth={1.75} />
        </div>
      </div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="max-w-sm text-sm text-ink-muted">{description}</p>
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}
