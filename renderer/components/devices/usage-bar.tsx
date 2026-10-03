'use client'

import { cn } from '../../lib/cn'

/**
 * Today's sends against a device's cap. `cap` null or 0 means unlimited, which
 * is shown as a count with no bar — a bar against no ceiling would imply one.
 */
export function UsageBar({
  sent,
  cap,
  paused = false,
  testId,
}: {
  sent: number
  cap: number | null
  paused?: boolean
  testId?: string
}) {
  const limited = cap !== null && cap > 0
  const ratio = limited ? Math.min(1, sent / cap) : 0
  const full = limited && sent >= cap

  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <div className="flex justify-between text-xs text-ink-muted">
        <span>Sent today</span>
        <span className="tabular-nums text-ink" data-testid={testId && `${testId}-label`}>
          {limited ? `${sent} / ${cap}` : `${sent} · no cap`}
        </span>
      </div>
      {limited && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-wa-in"
          role="meter"
          aria-label="Sent today against the daily cap"
          aria-valuemin={0}
          aria-valuemax={cap}
          aria-valuenow={Math.min(sent, cap)}
        >
          <div
            className={cn(
              'h-full rounded-full',
              paused ? 'bg-ink-subtle' : full ? 'bg-danger' : 'bg-primary',
            )}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}
