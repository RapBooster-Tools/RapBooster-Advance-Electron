'use client'

import { X } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import type { Tour } from '@renderer/help/types'

/** How long a freshly opened screen gets to draw its first tour target. */
const FIRST_TARGET_WAIT_MS = 4_000
const SPOT_PAD = 6
const GAP = 12
const EDGE = 12

function find(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Resolve once any of the targets is in the page, or with false on timeout. */
function waitForAny(targets: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (targets.some((t) => find(t))) {
      resolve(true)
      return
    }
    const observer = new MutationObserver(() => {
      if (!targets.some((t) => find(t))) return
      observer.disconnect()
      clearTimeout(timer)
      resolve(true)
    })
    const timer = setTimeout(() => {
      observer.disconnect()
      resolve(false)
    }, timeoutMs)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tour'],
    })
  })
}

/** Where the popover goes: below the target, else above, else beside, else inside. */
function placePopover(spot: DOMRect, size: { width: number; height: number }) {
  const maxLeft = window.innerWidth - size.width - EDGE
  const clampLeft = (x: number) => Math.max(EDGE, Math.min(x, maxLeft))
  const maxTop = window.innerHeight - size.height - EDGE
  if (spot.bottom + GAP + size.height <= window.innerHeight - EDGE) {
    return { top: spot.bottom + GAP, left: clampLeft(spot.left) }
  }
  if (spot.top - GAP - size.height >= EDGE) {
    return { top: spot.top - GAP - size.height, left: clampLeft(spot.left) }
  }
  const top = Math.max(EDGE, Math.min(spot.top, maxTop))
  if (spot.right + GAP + size.width <= window.innerWidth - EDGE) {
    return { top, left: spot.right + GAP }
  }
  if (spot.left - GAP - size.width >= EDGE)
    return { top, left: spot.left - GAP - size.width }
  return { top: maxTop, left: clampLeft(spot.right - size.width - GAP) }
}

/**
 * Guided tour: dims the window, spotlights one `[data-tour]` element at a
 * time and explains it in a small popover with Back, Next and Skip.
 *
 * Steps whose element is not on screen are skipped, so a tour still makes
 * sense on an empty screen. The arrow keys move through it and Escape ends it.
 * Motion follows the reduced-motion setting: no smooth scrolling and no
 * gliding spotlight when it is on.
 */
export function TourOverlay({ tour, onClose }: { tour: Tour; onClose: () => void }) {
  const toast = useToast()
  const titleId = useId()
  const [index, setIndex] = useState<number | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [popSize, setPopSize] = useState({ width: 340, height: 180 })
  const popRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<Element | null>(null)

  const available = tour.steps
    .map((step, i) => (find(step.target) ? i : -1))
    .filter((i) => i >= 0)

  const finish = useCallback(() => {
    onClose()
  }, [onClose])

  // Start: remember focus, then wait for the screen to draw.
  useEffect(() => {
    returnFocus.current = document.activeElement
    let cancelled = false
    void waitForAny(
      tour.steps.map((s) => s.target),
      FIRST_TARGET_WAIT_MS,
    ).then((found) => {
      if (cancelled) return
      const first = tour.steps.findIndex((s) => find(s.target))
      if (!found || first === -1) {
        toast(
          'info',
          'There is nothing to show on this screen yet. Try the tour again later.',
        )
        onClose()
        return
      }
      setIndex(first)
    })
    return () => {
      cancelled = true
      const target = returnFocus.current
      if (target instanceof HTMLElement && target.isConnected) target.focus()
    }
  }, [tour, toast, onClose])

  const go = useCallback(
    (direction: 1 | -1) => {
      if (index === null) return
      for (let i = index + direction; i >= 0 && i < tour.steps.length; i += direction) {
        const step = tour.steps[i]
        if (step && find(step.target)) {
          setIndex(i)
          return
        }
      }
      if (direction === 1) finish()
    },
    [index, tour, finish],
  )

  // Follow the target: scroll it into view, then track it while the page
  // scrolls or resizes.
  useLayoutEffect(() => {
    if (index === null) return
    const step = tour.steps[index]
    const element = step ? find(step.target) : null
    if (!element) return
    element.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: reducedMotion() ? 'auto' : 'smooth',
    })
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setRect(element.getBoundingClientRect()))
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(element)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [index, tour])

  // Each step puts focus on Next, so Enter or Space moves on. Runs once the
  // popover exists, which is after the target was first measured.
  const placed = rect !== null
  useEffect(() => {
    if (!placed) return
    popRef.current
      ?.querySelector<HTMLButtonElement>('[data-testid="tour-next"]')
      ?.focus({ preventScroll: true })
  }, [index, placed])

  useLayoutEffect(() => {
    const box = popRef.current?.getBoundingClientRect()
    if (!box) return
    if (box.width !== popSize.width || box.height !== popSize.height) {
      setPopSize({ width: box.width, height: box.height })
    }
  }, [index, rect, popSize])

  // Arrow keys and Escape for the whole window while the tour runs; Tab stays
  // inside the popover, as in any dialog.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        finish()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        go(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        go(-1)
      } else if (event.key === 'Tab') {
        const buttons = Array.from(
          popRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ??
            [],
        )
        if (buttons.length === 0) return
        const position = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.shiftKey
          ? (position <= 0 ? buttons.length : position) - 1
          : (position + 1) % buttons.length
        event.preventDefault()
        buttons[next]?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [go, finish])

  if (index === null || !rect) return null
  const step = tour.steps[index]
  if (!step) return null

  const spot = new DOMRect(
    rect.left - SPOT_PAD,
    rect.top - SPOT_PAD,
    rect.width + SPOT_PAD * 2,
    rect.height + SPOT_PAD * 2,
  )
  const position = placePopover(spot, popSize)
  const shown = Math.max(1, available.indexOf(index) + 1)
  const total = Math.max(available.length, shown)
  const isLast = !available.some((i) => i > index)
  const isFirst = !available.some((i) => i < index)
  const spotStyle: CSSProperties = {
    top: spot.top,
    left: spot.left,
    width: spot.width,
    height: spot.height,
    boxShadow: '0 0 0 9999px var(--color-overlay)',
  }

  return (
    <div data-testid="tour" data-tour-id={tour.id} data-step={index}>
      {/* Catches clicks so the page underneath cannot be used mid-tour. */}
      <div
        aria-hidden
        className="fixed inset-0 z-[70]"
        onMouseDown={(e) => e.preventDefault()}
      />
      <div
        aria-hidden
        data-testid="tour-spotlight"
        className="pointer-events-none fixed z-[71] rounded-card ring-2 ring-primary motion-safe:transition-all motion-safe:duration-200"
        style={spotStyle}
      />
      <div
        ref={popRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="tour-popover"
        style={{ top: position.top, left: position.left }}
        className="fixed z-[72] w-[340px] max-w-[calc(100vw-24px)] animate-fade-in rounded-card border border-line bg-surface-raised p-4 shadow-overlay"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p
              className="text-[11px] font-semibold tracking-wide text-primary uppercase"
              data-testid="tour-progress"
            >
              Step {shown} of {total}
            </p>
            <h2
              id={titleId}
              className="mt-0.5 text-[15px] font-semibold text-ink"
              data-testid="tour-title"
            >
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={finish}
            aria-label="End the tour"
            className="-mt-1 -mr-1 inline-flex size-7 items-center justify-center rounded-control text-ink-subtle hover:bg-wa-in hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={finish} data-testid="tour-skip">
            Skip tour
          </Button>
          <span className="flex-1" />
          <Button
            size="sm"
            onClick={() => go(-1)}
            disabled={isFirst}
            data-testid="tour-back"
          >
            Back
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => (isLast ? finish() : go(1))}
            data-testid="tour-next"
          >
            {isLast ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  )
}
