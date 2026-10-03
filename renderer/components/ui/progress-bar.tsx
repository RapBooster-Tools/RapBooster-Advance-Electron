'use client'

import { cn } from '@renderer/lib/cn'

type Tone = 'primary' | 'success' | 'warning' | 'danger'

const FILL: Record<Tone, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-status-warn-fg',
  danger: 'bg-danger',
}

/**
 * Determinate progress (`value` of `max`) or, without `value`, an
 * indeterminate sweep. Always give it a `label` — "Campaign progress",
 * "Import progress" — because a bar alone means nothing to a screen reader.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  tone = 'primary',
  size = 'md',
  showValue = false,
  testId,
  className,
}: {
  value?: number
  max?: number
  label: string
  tone?: Tone
  size?: 'sm' | 'md'
  /** Print the percentage to the right of the bar. */
  showValue?: boolean
  testId?: string
  className?: string
}) {
  const determinate = value !== undefined
  const pct = determinate && max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={determinate ? 0 : undefined}
        aria-valuemax={determinate ? max : undefined}
        aria-valuenow={determinate ? value : undefined}
        data-testid={testId}
        className={cn(
          'relative flex-1 overflow-hidden rounded-full bg-wa-in',
          size === 'sm' ? 'h-1.5' : 'h-2.5',
        )}
      >
        {determinate ? (
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500 ease-[var(--ease-soft)]',
              FILL[tone],
            )}
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div
            className={cn('absolute inset-0 animate-shimmer opacity-80', FILL[tone])}
            style={{
              backgroundImage:
                'linear-gradient(90deg, transparent 0%, rgb(255 255 255 / 0.45) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
            }}
          />
        )}
      </div>
      {showValue && determinate && (
        <span className="w-10 text-right text-xs font-medium text-ink-muted tabular-nums">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  )
}
