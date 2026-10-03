'use client'

import { cn } from '@renderer/lib/cn'

/**
 * Placeholder shape while data loads, sized like the content it stands in for
 * so nothing jumps when it arrives. Hidden from screen readers — announce
 * loading once on the container instead (e.g. `aria-busy`).
 */
export function Skeleton({
  className,
  lines,
}: {
  /** Size it with Tailwind, e.g. "h-4 w-32" or "size-10 rounded-full". */
  className?: string
  /** Render N stacked text lines instead of one block; the last is shorter. */
  lines?: number
}) {
  if (lines && lines > 1) {
    return (
      <div className={cn('flex flex-col gap-2', className)} aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={cn(
              'rb-skeleton h-3.5 animate-shimmer rounded-full',
              i === lines - 1 ? 'w-3/5' : 'w-full',
            )}
          />
        ))}
      </div>
    )
  }
  return (
    <div
      className={cn('rb-skeleton h-4 animate-shimmer rounded-control', className)}
      aria-hidden
    />
  )
}
