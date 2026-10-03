'use client'

import type { Route } from 'next'
import { useRouter, useSelectedLayoutSegment } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  resolveHelpAnchor,
  topicForSegment,
  tourFor,
  type HelpAnchor,
} from '@renderer/help'
import { HelpDrawer } from './help-drawer'
import { TourOffer } from './tour-offer'
import { TourOverlay } from './tour-overlay'
import { useOnboarding, type ChecklistState } from './use-onboarding'
import { WelcomeDialog } from './welcome-dialog'

export type { ChecklistState } from './use-onboarding'

interface HelpApi {
  /** Topic of the screen on show. */
  topicId: string
  drawerOpen: boolean
  openHelp: (anchor?: HelpAnchor) => void
  toggleHelp: () => void
  closeHelp: () => void
  /** Open the tour's screen if needed, then run the tour. */
  startTour: (id: string) => void
  /** Null until loaded, and for an install that never started onboarding. */
  checklist: ChecklistState | null
  setChecklist: (state: ChecklistState) => void
}

const HelpContext = createContext<HelpApi | null>(null)

/** The help system, or null outside the licensed app (e.g. activation). */
export function useHelp(): HelpApi | null {
  return useContext(HelpContext)
}

/**
 * Where the user is asking for help from: the focused panel's `data-help`
 * id, else the open dialog's, else none (the screen's own topic).
 */
function contextAnchor(): HelpAnchor | undefined {
  const dialogs = document.querySelectorAll<HTMLElement>(
    '[role="dialog"][aria-modal="true"]',
  )
  const dialog = dialogs[dialogs.length - 1]
  const active = document.activeElement
  const focused =
    active instanceof HTMLElement && (!dialog || dialog.contains(active))
      ? active.closest('[data-help]')
      : null
  const element = focused ?? dialog?.querySelector('[data-help]') ?? null
  const id = element?.getAttribute('data-help')
  return id ? resolveHelpAnchor(id) : undefined
}

interface DrawerState {
  anchor: HelpAnchor
  /** Changes on every open, so the drawer starts from the asked-for topic. */
  nonce: number
}

/**
 * Help for the licensed app: the F1 drawer, guided tours and the first-run
 * welcome. Mounted once in the (app) layout, beside the sidebar, because it
 * needs the current route segment exactly as the sidebar sees it.
 */
export function HelpProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const segment = useSelectedLayoutSegment()
  const topicId = topicForSegment(segment).id
  const onboarding = useOnboarding()

  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  const [activeTour, setActiveTour] = useState<{ id: string; nonce: number } | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const openHelp = useCallback(
    (anchor?: HelpAnchor) => {
      if (document.activeElement instanceof HTMLElement) {
        returnFocus.current = document.activeElement
      }
      setDrawer({ anchor: anchor ?? { topic: topicId }, nonce: Date.now() })
    },
    [topicId],
  )

  const closeHelp = useCallback(() => {
    setDrawer(null)
    // Back where the user was, as a dialog would; only if it is still there.
    const target = returnFocus.current
    returnFocus.current = null
    if (target?.isConnected) target.focus()
  }, [])

  const toggleHelp = useCallback(() => {
    if (drawer) closeHelp()
    else openHelp(contextAnchor())
  }, [drawer, closeHelp, openHelp])

  // F1 is the platform convention for help on both Windows and macOS keyboards.
  // Only F1 is handled, so no existing shortcut or focus is disturbed.
  // WHY a layout effect: it re-binds in the same commit as a route change, so
  // an F1 pressed straight after navigating can never reach a handler that
  // still holds the previous screen's topic.
  useLayoutEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'F1' || event.repeat) return
      event.preventDefault()
      toggleHelp()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleHelp])

  const { markTourSeen } = onboarding
  const startTour = useCallback(
    (id: string) => {
      const tour = tourFor(id)
      if (!tour) return
      setDrawer(null)
      markTourSeen(id)
      if (topicForSegment(segment).route !== tour.route) router.push(tour.route as Route)
      setActiveTour({ id, nonce: Date.now() })
    },
    [markTourSeen, router, segment],
  )

  // The first visit to a screen with a tour offers it, once. The offer is
  // recorded as seen the moment it shows, so ignoring it also counts.
  const candidate = tourFor(topicId)
  const offerable =
    onboarding.ready &&
    onboarding.onboardingCompleted &&
    !activeTour &&
    candidate !== undefined &&
    !onboarding.tourSeen(candidate.id)
  const [offer, setOffer] = useState<{ id: string; segment: string | null } | null>(null)
  const [offerSegment, setOfferSegment] = useState(segment)
  if (offerSegment !== segment) {
    setOfferSegment(segment)
    setOffer(null)
  }
  if (offerable && offer?.id !== candidate.id) setOffer({ id: candidate.id, segment })

  useEffect(() => {
    if (offer) markTourSeen(offer.id)
  }, [offer, markTourSeen])

  const api = useMemo<HelpApi>(
    () => ({
      topicId,
      drawerOpen: drawer !== null,
      openHelp,
      toggleHelp,
      closeHelp,
      startTour,
      checklist: onboarding.checklist,
      setChecklist: onboarding.setChecklist,
    }),
    [
      topicId,
      drawer,
      openHelp,
      toggleHelp,
      closeHelp,
      startTour,
      onboarding.checklist,
      onboarding.setChecklist,
    ],
  )

  const tour = activeTour ? tourFor(activeTour.id) : undefined
  const shownOffer = offer && offer.segment === segment && !activeTour ? offer : null

  return (
    <HelpContext.Provider value={api}>
      {children}
      {drawer && (
        <HelpDrawer
          key={drawer.nonce}
          anchor={drawer.anchor}
          currentTopic={topicId}
          onClose={closeHelp}
          onStartTour={startTour}
          onOpenCenter={() => {
            setDrawer(null)
            router.push('/help')
          }}
        />
      )}
      {tour && activeTour && (
        <TourOverlay
          key={activeTour.nonce}
          tour={tour}
          onClose={() => setActiveTour(null)}
        />
      )}
      {shownOffer && (
        <TourOffer
          tourId={shownOffer.id}
          onStart={() => startTour(shownOffer.id)}
          onDismiss={() => setOffer(null)}
        />
      )}
      {onboarding.ready && !onboarding.onboardingCompleted && (
        <WelcomeDialog onFinish={onboarding.finishWelcome} />
      )}
    </HelpContext.Provider>
  )
}
