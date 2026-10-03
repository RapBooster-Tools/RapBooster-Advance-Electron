'use client'

import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

/**
 * A keyboard key, for shortcut hints ("Press <Kbd>Enter</Kbd> to send").
 * Write the platform's own name for modifier keys (Ctrl on Windows, ⌘ on macOS).
 */
export function Kbd({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line border-b-2 bg-surface-muted px-1',
        'font-sans text-[11px] font-medium text-ink-muted',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
