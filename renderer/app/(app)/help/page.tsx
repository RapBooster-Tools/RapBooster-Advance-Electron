'use client'

import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  GlossaryList,
  HelpActions,
  SafetyList,
  ShortcutList,
  TroubleshootingList,
} from '@renderer/components/help/help-center-sections'
import { EntryView, SearchResults, TopicView } from '@renderer/components/help/topic-view'
import { PageHeader } from '@renderer/components/layout/page-header'
import { Input } from '@renderer/components/ui/input'
import { TabPanel, Tabs } from '@renderer/components/ui/tabs'
import { HELP_TOPICS, searchHelp, topicById } from '@renderer/help'
import { cn } from '@renderer/lib/cn'

type Section = 'topics' | 'troubleshooting' | 'safety' | 'glossary' | 'shortcuts'

const SECTIONS: ReadonlyArray<{ value: Section; label: string; testId: string }> = [
  { value: 'topics', label: 'Screens', testId: 'help-tab-topics' },
  {
    value: 'troubleshooting',
    label: 'Troubleshooting',
    testId: 'help-tab-troubleshooting',
  },
  { value: 'safety', label: 'Safety rules', testId: 'help-tab-safety' },
  { value: 'glossary', label: 'Glossary', testId: 'help-tab-glossary' },
  { value: 'shortcuts', label: 'Keyboard shortcuts', testId: 'help-tab-shortcuts' },
]

/** What is open on the Screens tab: a topic (and task), or a loose entry. */
type Selection = { topic: string; task?: string } | { entry: string }

/**
 * Help Center: every piece of help in one place, from the same content as the
 * F1 drawer and docs/USER-GUIDE.md.
 */
export default function HelpCenterPage() {
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<Section>('topics')
  const [selection, setSelection] = useState<Selection>({ topic: 'dashboard' })
  const results = useMemo(() => searchHelp(query, 50), [query])

  const topic = 'topic' in selection ? topicById(selection.topic) : undefined

  function openTopic(id: string, task?: string) {
    setQuery('')
    setSection('topics')
    setSelection(task ? { topic: id, task } : { topic: id })
  }

  return (
    <>
      <PageHeader
        title="Help Center"
        description="Guides for every screen, answers to common problems, and how to get support."
      />

      <div className="flex flex-col gap-5 p-6" data-help="help">
        <label className="relative block max-w-xl">
          <span className="sr-only">Search the help</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the help, e.g. “daily limit” or “QR code”"
            data-testid="help-center-search"
            className="pl-9"
          />
        </label>

        {query.trim() ? (
          <section aria-label="Search results" className="max-w-3xl">
            <SearchResults
              results={results}
              testId="help-center-result"
              onPick={(result) => {
                if (result.topic) {
                  openTopic(result.topic, result.task)
                  return
                }
                setQuery('')
                setSection('topics')
                setSelection({ entry: result.key })
              }}
            />
          </section>
        ) : (
          <>
            <HelpActions />

            <Tabs
              idBase="help-center"
              items={SECTIONS}
              value={section}
              onChange={setSection}
              label="Help sections"
            />

            <TabPanel idBase="help-center" value={section}>
              {section === 'topics' && (
                <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
                  <nav aria-label="Help topics">
                    <ul className="flex flex-col gap-0.5" data-testid="help-topic-list">
                      {HELP_TOPICS.map((t) => {
                        const active = 'topic' in selection && selection.topic === t.id
                        return (
                          <li key={t.id}>
                            <button
                              type="button"
                              onClick={() => openTopic(t.id)}
                              aria-current={active ? 'true' : undefined}
                              data-testid={`help-topic-${t.id}`}
                              className={cn(
                                'w-full rounded-control px-3 py-1.5 text-left text-sm transition-colors',
                                t.parent && 'pl-6 text-[13px]',
                                active
                                  ? 'bg-primary/10 font-semibold text-primary'
                                  : 'text-ink-muted hover:bg-wa-in hover:text-ink',
                              )}
                            >
                              {t.parent ? t.title.replace(/^Settings › /, '') : t.title}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </nav>
                  <div className="max-w-3xl rounded-card border border-line bg-surface p-5 shadow-card">
                    {topic ? (
                      <TopicView
                        key={`${topic.id}:${'task' in selection ? (selection.task ?? '') : ''}`}
                        topic={topic}
                        focusTask={'task' in selection ? selection.task : undefined}
                        onOpenTopic={(id) => openTopic(id)}
                      />
                    ) : (
                      'entry' in selection && <EntryView entryKey={selection.entry} />
                    )}
                  </div>
                </div>
              )}
              {section === 'troubleshooting' && <TroubleshootingList />}
              {section === 'safety' && <SafetyList />}
              {section === 'glossary' && <GlossaryList />}
              {section === 'shortcuts' && <ShortcutList />}
            </TabPanel>
          </>
        )}
      </div>
    </>
  )
}
