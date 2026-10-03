'use client'

import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-status-idle-bg text-status-idle-fg',
  primary: 'bg-primary/12 text-primary',
  success: 'bg-status-ok-bg text-status-ok-fg',
  warning: 'bg-status-warn-bg text-status-warn-fg',
  danger: 'bg-danger/12 text-danger',
  info: 'bg-status-info-bg text-status-info-fg',
}

/**
 * A short label: a type, a tag, a count. For a *state* (Connected, Running,
 * Failed) use StatusPill, which carries the status colour language.
 */
export function Badge({
  tone = 'neutral',
  size = 'md',
  children,
  className,
  testId,
}: {
  tone?: BadgeTone
  size?: 'sm' | 'md'
  children: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-1.5 text-[11px] leading-[18px]' : 'px-2 py-0.5 text-xs',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
