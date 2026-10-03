'use client'

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'
import {
  useTheme,
  type ThemePreference,
} from '@renderer/components/providers/theme-provider'
import { cn } from '@renderer/lib/cn'

const OPTIONS: ReadonlyArray<{
  value: ThemePreference
  label: string
  hint: string
  icon: LucideIcon
}> = [
  { value: 'light', label: 'Light', hint: 'Always light', icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Always dark', icon: Moon },
  {
    value: 'system',
    label: 'System',
    hint: 'Match your Windows or macOS setting',
    icon: Monitor,
  },
]

/**
 * Light / Dark / System choice.
 *
 * A radio group, because exactly one option is always selected: one Tab stop,
 * arrow keys move and select, as screen-reader users expect from radios.
 *
 * `compact` is the header version (icon + short label); `cards` is the larger
 * one on the Settings screen, with a one-line hint per choice. Test ids are
 * `${testIdPrefix}-light|dark|system`.
 */
export function ThemeToggle({
  variant = 'compact',
  testIdPrefix = 'theme',
  className,
}: {
  variant?: 'compact' | 'cards'
  testIdPrefix?: string
  className?: string
}) {
  const { preference, setPreference } = useTheme()
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (delta === 0) return
    event.preventDefault()
    const current = OPTIONS.findIndex((o) => o.value === preference)
    const next = (current + delta + OPTIONS.length) % OPTIONS.length
    const option = OPTIONS[next]
    if (!option) return
    setPreference(option.value)
    refs.current[next]?.focus()
  }

  const cards = variant === 'cards'

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      data-testid={`${testIdPrefix}-toggle`}
      onKeyDown={onKeyDown}
      className={cn(
        cards
          ? 'grid grid-cols-3 gap-3'
          : 'inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-muted p-0.5',
        className,
      )}
    >
      {OPTIONS.map((option, i) => {
        const selected = option.value === preference
        const Icon = option.icon
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            title={cards ? undefined : option.hint}
            data-testid={`${testIdPrefix}-${option.value}`}
            onClick={() => setPreference(option.value)}
            className={cn(
              'transition-[background-color,color,box-shadow,border-color] duration-150',
              cards
                ? cn(
                    'flex flex-col items-start gap-2 rounded-card border p-3 text-left',
                    selected
                      ? 'border-primary bg-primary/8 shadow-card'
                      : 'border-line bg-surface hover:border-line-strong',
                  )
                : cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
                    selected
                      ? 'bg-surface-raised text-ink shadow-card'
                      : 'text-ink-muted hover:text-ink',
                  ),
            )}
          >
            <Icon
              className={cn(cards ? 'size-5' : 'size-3.5', selected && 'text-primary')}
              aria-hidden
            />
            {cards ? (
              <span>
                <span className="block text-sm font-medium text-ink">{option.label}</span>
                <span className="block text-xs text-ink-muted">{option.hint}</span>
              </span>
            ) : (
              <span>{option.label}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
