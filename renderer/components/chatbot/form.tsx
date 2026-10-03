'use client'

import type { ReactNode } from 'react'

export const INPUT =
  'rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary'

export function Panel({
  title,
  children,
  actions,
}: {
  title: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {actions}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

export function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string
  htmlFor: string
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-subtle">{hint}</p>}
    </div>
  )
}

/** A number input that never hands NaN to its owner while the user is typing. */
export function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  hint,
  testId,
}: {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  hint?: string
  testId?: string
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step ?? 1}
        data-testid={testId ?? id}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        className={INPUT}
      />
    </Field>
  )
}
