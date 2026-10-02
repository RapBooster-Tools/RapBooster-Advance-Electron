'use client'

import type { ReactNode } from 'react'

/** The input look shared by every form on the Automation screen. */
export const INPUT_CLASS =
  'rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary'

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

export function formatWhen(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}
