'use client'

import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

/**
 * Checkbox with its label and optional help line.
 *
 * A native input underneath, so keyboard, form semantics and screen readers
 * work unchanged; `accent-color` themes the tick in both light and dark.
 * The whole row is clickable — small targets are hard for many users.
 */
export function Checkbox({
  label,
  description,
  className,
  id: idProp,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode
  description?: ReactNode
}) {
  const generated = useId()
  const id = idProp ?? generated
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        id={id}
        type="checkbox"
        aria-describedby={description ? `${id}-description` : undefined}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded accent-primary disabled:cursor-not-allowed"
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm text-ink">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="mt-0.5 text-xs text-ink-muted">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}
