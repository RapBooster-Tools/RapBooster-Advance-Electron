'use client'

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

export interface TabItem<V extends string> {
  value: V
  label: ReactNode
  /** Optional count badge, e.g. unread chats. */
  count?: number
  testId?: string
  disabled?: boolean
}

/**
 * Tab strip (WAI-ARIA tabs pattern): one Tab stop for the whole strip, arrow
 * keys move between tabs, Home/End jump to the ends. Selection follows focus,
 * which is right for tabs whose panels render instantly.
 *
 * Render the active panel yourself inside <TabPanel>, passing the same `idBase`:
 *
 *   <Tabs idBase="grp" value={tab} onChange={setTab} items={[…]} label="Group views" />
 *   <TabPanel idBase="grp" value={tab}>…</TabPanel>
 */
export function Tabs<V extends string>({
  items,
  value,
  onChange,
  label,
  idBase,
  className,
}: {
  items: ReadonlyArray<TabItem<V>>
  value: V
  onChange: (value: V) => void
  /** Accessible name for the strip, e.g. "Inbox filters". */
  label: string
  idBase?: string
  className?: string
}) {
  const generated = useId()
  const base = idBase ?? generated
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = items.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0)
    const current = enabled.indexOf(items.findIndex((t) => t.value === value))
    let next: number | undefined
    if (event.key === 'ArrowRight') next = enabled[(current + 1) % enabled.length]
    else if (event.key === 'ArrowLeft')
      next = enabled[(current - 1 + enabled.length) % enabled.length]
    else if (event.key === 'Home') next = enabled[0]
    else if (event.key === 'End') next = enabled[enabled.length - 1]
    if (next === undefined) return
    event.preventDefault()
    const target = items[next]
    if (!target) return
    onChange(target.value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex items-center gap-1 rounded-control border border-line bg-surface-muted p-1',
        className,
      )}
    >
      {items.map((tab, i) => {
        const selected = tab.value === value
        return (
          <button
            key={tab.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${tab.value}`}
            aria-selected={selected}
            aria-controls={`${base}-panel-${tab.value}`}
            tabIndex={selected ? 0 : -1}
            disabled={tab.disabled}
            data-testid={tab.testId}
            onClick={() => onChange(tab.value)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium transition-colors duration-150',
              'disabled:pointer-events-none disabled:opacity-50',
              selected
                ? 'bg-surface-raised text-ink shadow-card'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={cn(
                  'min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5',
                  selected ? 'bg-primary text-on-primary' : 'bg-line text-ink-muted',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({
  idBase,
  value,
  children,
  className,
}: {
  idBase: string
  value: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${value}`}
      aria-labelledby={`${idBase}-tab-${value}`}
      className={className}
    >
      {children}
    </div>
  )
}
