'use client'

import { ArrowLeft, BookOpen, Compass, Search, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Kbd } from '@renderer/components/ui/kbd'
import { searchHelp, topicById, tourFor, type HelpAnchor } from '@renderer/help'
import { EntryView, SearchResults, TopicView } from './topic-view'

export const HELP_DRAWER_ID = 'help-drawer'

type View = { kind: 'topic'; anchor: HelpAnchor } | { kind: 'entry'; key: string }

/**
 * The F1 help panel: a right-hand drawer with the current screen's help,
 * search across all help, and the way into tours and the Help Center.
 *
 * Non-modal on purpose: the user can keep working with the help open, which
 * is the point of help that sits beside the screen. It still sits above an
 * open dialog (z-45 over the dialog's z-40) so F1 inside a dialog works, and
 * it swallows its own Escape so that closing help never closes the dialog.
 */
export function HelpDrawer({
  anchor,
  currentTopic,
  onClose,
  onStartTour,
  onOpenCenter,
}: {
  anchor: HelpAnchor
  currentTopic: string
  onClose: () => void
  onStartTour: (id: string) => void
  onOpenCenter: () => void
}) {
  const titleId = useId()
  const [query, setQuery] = useState('')
  const [view, setView] = useState<View>({ kind: 'topic', anchor })
  const results = useMemo(() => searchHelp(query), [query])

  const topic = view.kind === 'topic' ? topicById(view.anchor.topic) : undefined
  // A Settings section's tour is the Settings screen's (there is none), and a
  // screen's tour is its own.
  const tour = topic ? tourFor(topic.parent ?? topic.id) : undefined
  const awayFromScreen = view.kind !== 'topic' || view.anchor.topic !== currentTopic

  // WHY a native listener: an open dialog listens for Escape on the document,
  // which is also where React attaches its own handlers here, so a React
  // stopPropagation would not keep the dialog from closing too. Stopping the
  // event on the drawer itself does.
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      if (query) setQuery('')
      else onClose()
    }
    panel.addEventListener('keydown', onKeyDown)
    return () => panel.removeEventListener('keydown', onKeyDown)
  }, [query, onClose])

  function openTopic(id: string, task?: string) {
    setQuery('')
    setView({ kind: 'topic', anchor: task ? { topic: id, task } : { topic: id } })
  }

  return (
    <aside
      id={HELP_DRAWER_ID}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-testid="help-drawer"
      ref={panelRef}
      className="fixed top-14 right-0 bottom-0 z-[45] flex w-[420px] max-w-full animate-fade-in flex-col border-l border-line bg-surface-raised shadow-overlay"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <BookOpen className="size-[18px] text-primary" aria-hidden />
        <h2 id={titleId} className="flex-1 text-[15px] font-semibold text-ink">
          Help
        </h2>
        <span className="text-xs text-ink-subtle">
          <Kbd>F1</Kbd> to close
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close help"
          data-testid="help-close"
          className="inline-flex size-8 items-center justify-center rounded-control text-ink-subtle transition-colors hover:bg-wa-in hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="border-b border-line px-4 py-3">
        <label className="relative block">
          <span className="sr-only">Search all help</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <input
            // Opening help is an explicit request, so the search box may take
            // focus; closing returns focus to where the user was.
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all help…"
            data-testid="help-search"
            className="h-9 w-full rounded-control border border-line bg-surface pr-3 pl-8 text-sm text-ink outline-none placeholder:text-ink-subtle focus:border-primary"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {query.trim() ? (
          <SearchResults
            results={results}
            testId="help-result"
            onPick={(result) => {
              if (result.topic) {
                openTopic(result.topic, result.task)
                return
              }
              setQuery('')
              setView({ kind: 'entry', key: result.key })
            }}
          />
        ) : (
          <>
            {awayFromScreen && (
              <button
                type="button"
                onClick={() => openTopic(currentTopic)}
                data-testid="help-back"
                className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                Help for this screen
              </button>
            )}
            {topic ? (
              <TopicView
                key={`${topic.id}:${view.kind === 'topic' ? (view.anchor.task ?? '') : ''}`}
                topic={topic}
                focusTask={view.kind === 'topic' ? view.anchor.task : undefined}
                onOpenTopic={(id) => openTopic(id)}
                compact
              />
            ) : (
              view.kind === 'entry' && <EntryView entryKey={view.key} />
            )}
          </>
        )}
      </div>

      <footer className="flex flex-wrap gap-2 border-t border-line bg-surface-muted px-4 py-3">
        {tour && !query.trim() && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onStartTour(tour.id)}
            data-testid="help-take-tour"
          >
            <Compass className="size-3.5" aria-hidden />
            Take the tour
          </Button>
        )}
        <Button size="sm" onClick={onOpenCenter} data-testid="help-open-center">
          <BookOpen className="size-3.5" aria-hidden />
          Open Help Center
        </Button>
      </footer>
    </aside>
  )
}
