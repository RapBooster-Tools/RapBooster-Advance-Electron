'use client'

import { CircleQuestionMark } from 'lucide-react'
import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@renderer/lib/cn'

type Side = 'top' | 'bottom' | 'left' | 'right'

const GAP = 8
const HOVER_DELAY_MS = 250

function place(rect: DOMRect, side: Side): CSSProperties {
  // Keep the bubble inside the window: a tooltip clipped by the edge is worse
  // than one slightly off-centre.
  const clampX = (x: number) => Math.min(Math.max(x, 12), window.innerWidth - 12)
  switch (side) {
    case 'right':
      return {
        left: rect.right + GAP,
        top: rect.top + rect.height / 2,
        transform: 'translateY(-50%)',
      }
    case 'left':
      return {
        left: rect.left - GAP,
        top: rect.top + rect.height / 2,
        transform: 'translate(-100%, -50%)',
      }
    case 'bottom':
      return {
        left: clampX(rect.left + rect.width / 2),
        top: rect.bottom + GAP,
        transform: 'translateX(-50%)',
      }
    default:
      return {
        left: clampX(rect.left + rect.width / 2),
        top: rect.top - GAP,
        transform: 'translate(-50%, -100%)',
      }
  }
}

/**
 * Short help text on hover *and* keyboard focus.
 *
 * Accessible by construction: the trigger is described by the tooltip
 * (aria-describedby) while it is open, Escape dismisses it without moving
 * focus (WCAG 1.4.13), and it never holds information that is not also
 * reachable another way — use it for help, not for required content.
 *
 * The child must be a single focusable element (a button or link) that accepts
 * `aria-describedby`. Rendered through a portal with fixed positioning so a
 * scrolling sidebar or an animated dialog cannot clip it.
 */
export function Tooltip({
  content,
  side = 'top',
  disabled = false,
  children,
}: {
  content: ReactNode
  side?: Side
  /** Keep the trigger but show nothing — e.g. a label already visible. */
  disabled?: boolean
  children: ReactElement<{ 'aria-describedby'?: string }>
}) {
  const id = useId()
  const anchor = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [style, setStyle] = useState<CSSProperties | null>(null)

  const show = useCallback(
    (delay: number) => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        const target = anchor.current?.firstElementChild
        if (!target) return
        setStyle(place(target.getBoundingClientRect(), side))
      }, delay)
    },
    [side],
  )

  const hide = useCallback(() => {
    clearTimeout(timer.current)
    setStyle(null)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  const open = style !== null && !disabled
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])

  // NOTE: a native listener, not React's onKeyDown. React handles events at
  // its root, which here is the document — the same place the Dialog listens
  // for Escape — so a React stopPropagation runs too late and Escape on an
  // open tooltip also closed the dialog behind it. A listener on the trigger
  // runs first, while the event is still on its way up.
  useEffect(() => {
    const node = anchor.current
    if (!node) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !openRef.current) return
      // Dismiss only the tooltip — not the dialog it may be sitting in.
      event.stopPropagation()
      hide()
    }
    node.addEventListener('keydown', onKeyDown)
    return () => node.removeEventListener('keydown', onKeyDown)
  }, [hide])

  return (
    <span
      ref={anchor}
      className="contents"
      onPointerEnter={() => show(HOVER_DELAY_MS)}
      onPointerLeave={hide}
      onFocus={() => show(0)}
      onBlur={hide}
    >
      {cloneElement(children, open ? { 'aria-describedby': id } : {})}
      {open &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={style}
            className={cn(
              'pointer-events-none fixed z-[60] max-w-64 animate-fade-in rounded-control',
              'bg-ink px-2.5 py-1.5 text-xs leading-snug font-medium text-surface shadow-raised',
            )}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  )
}

/**
 * A small "?" next to a setting, explaining it in plain words. The visible
 * label stays on the setting itself; this is the longer "what does it do".
 */
export function InfoTip({
  content,
  label = 'More information',
  side = 'top',
  testId,
}: {
  content: ReactNode
  /** Accessible name of the "?" button. */
  label?: string
  side?: Side
  testId?: string
}) {
  return (
    <Tooltip content={content} side={side}>
      <button
        type="button"
        aria-label={label}
        data-testid={testId}
        className="inline-flex size-5 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-wa-in hover:text-ink"
      >
        <CircleQuestionMark className="size-4" aria-hidden />
      </button>
    </Tooltip>
  )
}
