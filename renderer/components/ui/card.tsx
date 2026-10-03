'use client'

import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

const PADDING = { none: '', sm: 'p-3', md: 'p-5', lg: 'p-6' } as const

/**
 * The basic surface: rounded, softly raised, one border. Group related
 * content in a Card; do not nest cards inside cards — use a divider or a
 * `bg-surface-muted` panel for a sub-group instead.
 *
 * `interactive` adds a hover lift for cards that are themselves clickable
 * (then render it as the clickable element's child or pass onClick + role).
 */
export function Card({
  padding = 'md',
  interactive = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  padding?: keyof typeof PADDING
  interactive?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-surface shadow-card',
        interactive &&
          'transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised',
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/** Title row inside a Card: title, one line of help, actions on the right. */
export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** A small leading icon (a lucide component instance, e.g. <Smartphone />). */
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary [&>svg]:size-[18px]"
            aria-hidden
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] leading-6 font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
