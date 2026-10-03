'use client'

import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

/**
 * Heading for a section *within* a screen (the screen title is PageHeader's).
 * Renders an <h2> by default; pass `as="h3"` inside a Card that already has
 * an h2, so the outline stays meaningful to screen readers.
 */
export function SectionHeader({
  title,
  description,
  actions,
  as: Heading = 'h2',
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  as?: 'h2' | 'h3'
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <Heading className="text-[15px] leading-6 font-semibold text-ink">
          {title}
        </Heading>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
