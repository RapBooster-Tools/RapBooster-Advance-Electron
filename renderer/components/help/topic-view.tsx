'use client'

import { AlertTriangle, ChevronRight, Lightbulb } from 'lucide-react'
import { useEffect, useRef } from 'react'
import {
  FIELD_HELP,
  GENERAL_FAQ,
  GLOSSARY,
  SAFETY_RULES,
  TROUBLESHOOTING,
  topicById,
  type HelpSearchResult,
} from '@renderer/help'
import type { HelpTopic } from '@renderer/help/types'
import { cn } from '@renderer/lib/cn'

const KIND_LABEL: Record<HelpSearchResult['kind'], string> = {
  topic: 'Screen',
  task: 'How to',
  faq: 'Question',
  setting: 'Setting',
  glossary: 'Word',
  problem: 'Problem',
  safety: 'Safety',
}

function Heading({ children }: { children: string }) {
  return (
    <h3 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-ink-subtle uppercase">
      {children}
    </h3>
  )
}

/**
 * One help topic, as the drawer and the Help Center show it. `focusTask`
 * scrolls to and highlights one "how to", for help opened from a panel.
 */
export function TopicView({
  topic,
  focusTask,
  onOpenTopic,
  compact = false,
}: {
  topic: HelpTopic
  focusTask?: string
  onOpenTopic: (id: string) => void
  compact?: boolean
}) {
  const taskRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    taskRef.current?.scrollIntoView({ block: 'start' })
  }, [focusTask])

  const fields = Object.entries(FIELD_HELP).filter(([, f]) => f.topic === topic.id)

  return (
    <article data-testid="help-topic" data-topic={topic.id} className="text-sm text-ink">
      <h2
        className={cn('font-semibold tracking-tight', compact ? 'text-base' : 'text-lg')}
        data-testid="help-topic-title"
      >
        {topic.title}
      </h2>
      <p className="mt-1.5 leading-relaxed text-ink-muted">{topic.summary}</p>

      {topic.tasks.length > 0 && (
        <>
          <Heading>How to</Heading>
          <ul className="flex flex-col gap-2">
            {topic.tasks.map((task) => {
              const focused = task.id === focusTask
              return (
                <li
                  key={task.id}
                  id={`help-task-${task.id}`}
                  ref={focused ? taskRef : undefined}
                  data-testid="help-task"
                  data-focused={focused ? 'true' : undefined}
                  className={cn(
                    'scroll-mt-4 rounded-card border p-3',
                    focused ? 'border-primary bg-primary/5' : 'border-line bg-surface',
                  )}
                >
                  <p className="font-medium">{task.title}</p>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-ink-muted">
                    {task.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {fields.length > 0 && (
        <>
          <Heading>Settings explained</Heading>
          <dl className="flex flex-col gap-2">
            {fields.map(([id, field]) => (
              <div key={id}>
                <dt className="font-medium">{field.label}</dt>
                <dd className="text-ink-muted">{field.text}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {topic.warnings.length > 0 && (
        <>
          <Heading>Be careful</Heading>
          <ul className="flex flex-col gap-2" data-testid="help-warnings">
            {topic.warnings.map((warning) => (
              <li
                key={warning}
                className="flex gap-2 rounded-card bg-status-warn-bg px-3 py-2 text-status-warn-fg"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {topic.tips.length > 0 && (
        <>
          <Heading>Tips</Heading>
          <ul className="flex flex-col gap-1.5">
            {topic.tips.map((tip) => (
              <li key={tip} className="flex gap-2 text-ink-muted">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {topic.faq.length > 0 && (
        <>
          <Heading>Questions</Heading>
          <div className="flex flex-col gap-1.5">
            {topic.faq.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-card border border-line bg-surface px-3 py-2"
              >
                <summary className="cursor-pointer font-medium marker:text-ink-subtle">
                  {faq.question}
                </summary>
                <p className="mt-1.5 text-ink-muted">{faq.answer}</p>
              </details>
            ))}
          </div>
        </>
      )}

      {topic.related.length > 0 && (
        <>
          <Heading>Related</Heading>
          <div className="flex flex-wrap gap-1.5">
            {topic.related.map((id) => {
              const related = topicById(id)
              if (!related) return null
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onOpenTopic(id)}
                  data-testid={`help-related-${id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted transition-colors hover:border-primary hover:text-primary"
                >
                  {related.title}
                  <ChevronRight className="size-3" aria-hidden />
                </button>
              )
            })}
          </div>
        </>
      )}
    </article>
  )
}

/** A search hit that is not part of a topic: a problem, word or rule. */
export function EntryView({ entryKey }: { entryKey: string }) {
  const [kind, ...rest] = entryKey.split(':')
  const id = rest.join(':')

  if (kind === 'problem') {
    const problem = TROUBLESHOOTING.find((p) => p.id === id)
    if (!problem) return null
    return (
      <article data-testid="help-entry" className="text-sm text-ink">
        <h2 className="text-base font-semibold">{problem.problem}</h2>
        <p className="mt-1.5 text-ink-muted">{problem.why}</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-ink-muted">
          {problem.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </article>
    )
  }

  const simple =
    kind === 'glossary'
      ? GLOSSARY.filter((g) => g.term === id).map((g) => [g.term, g.definition])
      : kind === 'safety'
        ? SAFETY_RULES.filter((r) => r.id === id).map((r) => [r.title, r.text])
        : kind === 'faq'
          ? GENERAL_FAQ.filter((_, i) => `general:${i}` === id).map((f) => [
              f.question,
              f.answer,
            ])
          : []
  const [entry] = simple
  if (!entry) return null
  return (
    <article data-testid="help-entry" className="text-sm text-ink">
      <h2 className="text-base font-semibold">{entry[0]}</h2>
      <p className="mt-1.5 text-ink-muted">{entry[1]}</p>
    </article>
  )
}

export function SearchResults({
  results,
  onPick,
  testId,
}: {
  results: HelpSearchResult[]
  onPick: (result: HelpSearchResult) => void
  testId: string
}) {
  if (results.length === 0) {
    return (
      <p className="text-sm text-ink-muted" data-testid={`${testId}-empty`}>
        Nothing matches. Try fewer or simpler words, such as &ldquo;limit&rdquo; or
        &ldquo;QR&rdquo;.
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Search results">
      {results.map((result) => (
        <li key={result.key}>
          <button
            type="button"
            onClick={() => onPick(result)}
            data-testid={testId}
            data-key={result.key}
            className="flex w-full flex-col gap-0.5 rounded-card border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-primary"
          >
            <span className="flex items-center gap-2">
              <span className="rounded bg-status-idle-bg px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-status-idle-fg uppercase">
                {KIND_LABEL[result.kind]}
              </span>
              <span className="text-sm font-medium text-ink">{result.title}</span>
            </span>
            <span className="text-xs text-ink-muted">{result.snippet}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
