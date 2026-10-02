'use client'

import type { WaNumberStatus } from '@shared/types'
import { cn } from '@renderer/lib/cn'

/** A tag rendered in its own colour, as a dot and a name. */
export function TagChip({
  name,
  color,
  testId = 'tag-chip',
}: {
  name: string
  color: string
  testId?: string
}) {
  return (
    <span
      data-testid={testId}
      title={name}
      className="inline-flex max-w-28 items-center gap-1 rounded-full border border-line bg-surface px-1.5 py-px text-[11px] text-ink"
    >
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{name}</span>
    </span>
  )
}

const WA_LABELS: Record<WaNumberStatus, string> = {
  unknown: 'Unchecked',
  valid: 'On WhatsApp',
  invalid: 'Not on WhatsApp',
}

const WA_TONES: Record<WaNumberStatus, string> = {
  unknown: 'bg-status-idle-bg text-status-idle-fg',
  valid: 'bg-status-ok-bg text-status-ok-fg',
  invalid: 'bg-danger/10 text-danger',
}

export function WaStatusBadge({ status }: { status: WaNumberStatus }) {
  return (
    <span
      data-testid="wa-badge"
      data-status={status}
      className={cn(
        'inline-flex rounded-full px-2 py-px text-[11px] font-medium whitespace-nowrap',
        WA_TONES[status],
      )}
    >
      {WA_LABELS[status]}
    </span>
  )
}

export const WA_STATUS_OPTIONS: Array<{ value: WaNumberStatus; label: string }> = [
  { value: 'valid', label: WA_LABELS.valid },
  { value: 'invalid', label: WA_LABELS.invalid },
  { value: 'unknown', label: WA_LABELS.unknown },
]
