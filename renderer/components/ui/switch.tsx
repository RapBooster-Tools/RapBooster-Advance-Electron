'use client'

import { useId, type ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

/**
 * On/off toggle for a setting that takes effect immediately.
 *
 * A real `role="switch"` button with `aria-checked`, so Space/Enter toggle it
 * and screen readers announce "on/off". The visible label is the accessible
 * name; the description is announced as help. Use a Checkbox instead when the
 * choice only applies after the user presses Save.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  testId,
  className,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
  testId?: string
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="mt-0.5 text-xs text-ink-muted">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-description` : undefined}
        disabled={disabled}
        data-testid={testId}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors duration-200',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-line-strong',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'inline-block size-5 rounded-full bg-white shadow-card transition-transform duration-200 ease-[var(--ease-soft)]',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}
