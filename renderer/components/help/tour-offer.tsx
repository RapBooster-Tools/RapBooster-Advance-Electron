'use client'

import { Compass, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { topicById } from '@renderer/help'

/**
 * "New here? Take the tour" — shown once, the first time a screen with a tour
 * is opened. Deliberately small and out of the way: it never takes focus and
 * never blocks the screen, so someone who knows the app can just ignore it.
 */
export function TourOffer({
  tourId,
  onStart,
  onDismiss,
}: {
  tourId: string
  onStart: () => void
  onDismiss: () => void
}) {
  const screen = topicById(tourId)?.navLabel ?? 'this screen'
  return (
    <section
      aria-label="Guided tour"
      data-testid="tour-offer"
      data-tour-id={tourId}
      className="fixed bottom-4 left-[248px] z-30 flex w-80 animate-slide-up items-start gap-3 rounded-card border border-line bg-surface-raised p-3.5 shadow-raised collapsed:left-[84px]"
    >
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary"
      >
        <Compass className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">New to {screen}?</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          A one-minute tour shows you what each part does.
        </p>
        <div className="mt-2.5 flex gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={onStart}
            data-testid="tour-offer-start"
          >
            Take the tour
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            data-testid="tour-offer-dismiss"
          >
            No thanks
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Close the tour offer"
        className="-mt-1 -mr-1 inline-flex size-6 items-center justify-center rounded-control text-ink-subtle hover:bg-wa-in hover:text-ink"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </section>
  )
}
