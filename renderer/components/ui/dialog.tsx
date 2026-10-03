'use client'

import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

/** How long the exit animation runs; matches `animate-scale-out`. */
const EXIT_MS = 140

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Open dialogs, innermost last. Escape and the focus trap belong to the top
 * one only — a confirm opened from inside a dialog must not close both.
 */
const stack: string[] = []

/**
 * Modal dialog.
 *
 * Hand-written rather than pulled from a component library (see tracker D20),
 * but it still has to behave: Escape closes, focus moves into the dialog on
 * open and returns to the trigger on close, and focus is trapped while open.
 * A modal that lets keyboard focus wander behind it is not accessible.
 *
 * The body scrolls; the header and the footer (where the actions live) stay
 * put, so the primary button is always visible on a long form.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 500,
  testId,
}: {
  open: boolean
  onClose: () => void
  title: string
  /** One plain sentence under the title saying what this dialog is for. */
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
  testId?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  // Stay mounted briefly after `open` turns false so the exit can animate.
  // Callers that unmount the dialog outright simply skip the exit animation.
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  const closing = mounted && !open

  useEffect(() => {
    if (!closing) return
    const timer = setTimeout(() => setMounted(false), EXIT_MS)
    return () => clearTimeout(timer)
  }, [closing])

  useEffect(() => {
    if (!open) return

    const key = titleId
    stack.push(key)
    previouslyFocused.current = document.activeElement as HTMLElement | null

    const panel = panelRef.current
    const focusable = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => !el.hasAttribute('disabled'),
      )

    // Prefer the first field in the body over the header's close button, and
    // respect an element that already took focus via autoFocus.
    if (!panel?.contains(document.activeElement)) {
      const inBody = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      ;(inBody ?? focusable()[0])?.focus()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== key) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const items = focusable()
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const index = stack.lastIndexOf(key)
      if (index !== -1) stack.splice(index, 1)
      previouslyFocused.current?.focus()
    }
  }, [open, onClose, titleId])

  if (!mounted) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-40 flex items-center justify-center bg-overlay p-6 backdrop-blur-[2px]',
        closing ? 'pointer-events-none animate-fade-out' : 'animate-fade-in',
      )}
      onMouseDown={(event) => {
        // Only a click that both starts and ends on the backdrop dismisses —
        // otherwise a drag that ends outside would close the dialog and lose
        // whatever the user had typed.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        data-testid={testId}
        inert={closing}
        style={{ maxWidth: width }}
        className={cn(
          'flex max-h-[85vh] w-full flex-col overflow-hidden rounded-dialog border border-line bg-surface-raised shadow-overlay',
          closing ? 'animate-scale-out' : 'animate-scale-in',
        )}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[15px] leading-6 font-semibold text-ink">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-sm text-ink-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-control text-ink-subtle transition-colors hover:bg-wa-in hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto p-5">
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-line bg-surface-muted px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
