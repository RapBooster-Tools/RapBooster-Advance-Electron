'use client'

import { useCallback, useMemo, useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { useIpcQuery } from '@renderer/hooks/useIpc'

export type ChecklistState = 'active' | 'dismissed' | 'done'

/**
 * Where the getting-started checklist stands. A plain Setting row rather than
 * an app preference: it is written by the Dashboard card and the Help Center,
 * and an install that never saw the welcome (every E2E spec that does not opt
 * in) simply has no row, so no checklist.
 */
const CHECKLIST_KEY = 'help.checklist'

/** `toursSeen` entry meaning every tour is seen (see prefs.ts test seam). */
const ALL_TOURS = '*'

/** The contract keeps at most 50 tour ids. */
const MAX_TOURS = 50

function isChecklistState(value: string | null | undefined): value is ChecklistState {
  return value === 'active' || value === 'dismissed' || value === 'done'
}

/**
 * Onboarding state: whether the welcome was shown, which tours were seen and
 * the checklist. Loaded once; every change is applied locally first and then
 * stored, so the UI never waits on a round trip to hide a prompt.
 */
export function useOnboarding() {
  const toast = useToast()
  const prefs = useIpcQuery('app:getPrefs')
  const stored = useIpcQuery('settings:get', { key: CHECKLIST_KEY })

  const [onboarded, setOnboarded] = useState<boolean>()
  const [seen, setSeen] = useState<string[]>()
  const [checklistOverride, setChecklistOverride] = useState<ChecklistState>()

  const ready = prefs.data !== undefined
  const onboardingCompleted = onboarded ?? prefs.data?.onboardingCompleted ?? true
  const loadedTours = prefs.data?.toursSeen
  const toursSeen = useMemo(() => seen ?? loadedTours ?? [ALL_TOURS], [seen, loadedTours])
  const storedValue = stored.data?.value
  const checklist =
    checklistOverride ?? (isChecklistState(storedValue) ? storedValue : null)

  const tourSeen = useCallback(
    (id: string) => toursSeen.includes(ALL_TOURS) || toursSeen.includes(id),
    [toursSeen],
  )

  const markTourSeen = useCallback(
    (id: string) => {
      if (toursSeen.includes(id)) return
      const next = [...toursSeen, id].slice(-MAX_TOURS)
      setSeen(next)
      void window.api.invoke('app:setPrefs', { toursSeen: next }).then((result) => {
        // Losing this only means the tour is offered once more; not worth an
        // error toast over something the user did not ask for.
        if (!result.ok)
          console.warn('help: could not store seen tours', result.error.detail)
      })
    },
    [toursSeen],
  )

  const setChecklist = useCallback(
    (state: ChecklistState) => {
      setChecklistOverride(state)
      void window.api
        .invoke('settings:set', { key: CHECKLIST_KEY, value: state })
        .then((result) => {
          if (!result.ok) toast('error', result.error.userMessage)
        })
    },
    [toast],
  )

  /** Close the welcome for good; "start" shows the Dashboard checklist. */
  const finishWelcome = useCallback(
    (choice: 'start' | 'skip') => {
      setOnboarded(true)
      setChecklist(choice === 'start' ? 'active' : 'dismissed')
      void window.api
        .invoke('app:setPrefs', { onboardingCompleted: true })
        .then((result) => {
          if (!result.ok) toast('error', result.error.userMessage)
        })
    },
    [setChecklist, toast],
  )

  return {
    ready,
    onboardingCompleted,
    tourSeen,
    markTourSeen,
    checklist,
    setChecklist,
    finishWelcome,
  }
}
