'use client'

import { useId, type ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

/** Props <Field> hands to its control so label, hint and error are wired up. */
export interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

/**
 * Label + control + hint + error, wired for screen readers.
 *
 * Pass the control as a render function so the ids line up automatically:
 *
 *   <Field label="Template name" hint="Only you see this." error={err}>
 *     {(p) => <Input {...p} value={name} onChange={…} data-testid="tpl-name" />}
 *   </Field>
 *
 * A plain child also works when you set `htmlFor` to the control's own id.
 * Every visible field needs a real label — a placeholder is not one.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  labelAside,
  className,
  children,
}: {
  label: ReactNode
  /** Plain-language help under the control. */
  hint?: ReactNode
  /** Shown under the hint in red and announced to screen readers. */
  error?: ReactNode
  required?: boolean
  htmlFor?: string
  /** Right side of the label row, e.g. an <InfoTip> or a character count. */
  labelAside?: ReactNode
  className?: string
  children: ReactNode | ((props: FieldControlProps) => ReactNode)
}) {
  const generated = useId()
  const id = htmlFor ?? generated
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ')

  const controlProps: FieldControlProps = {
    id,
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    // aria-invalid alone drives the red border (see controlClass), so these
    // props are safe to spread onto a native element as well as our own.
    ...(error ? { 'aria-invalid': true as const } : {}),
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-ink">
          {label}
          {required && (
            <span className="ml-0.5 text-danger" aria-hidden>
              *
            </span>
          )}
        </label>
        {labelAside}
      </div>
      {typeof children === 'function' ? children(controlProps) : children}
      {hint && (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
