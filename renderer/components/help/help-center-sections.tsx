'use client'

import type { Route } from 'next'
import { Compass, LifeBuoy, ListChecks } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { Card, CardHeader } from '@renderer/components/ui/card'
import { Kbd } from '@renderer/components/ui/kbd'
import {
  GLOSSARY,
  SAFETY_RULES,
  SHORTCUTS,
  TOURS,
  TROUBLESHOOTING,
  topicById,
} from '@renderer/help'
import { useHelp } from './help-provider'

/** Tours, the checklist and support: the things people come here to *do*. */
export function HelpActions() {
  const help = useHelp()
  const router = useRouter()
  const toast = useToast()
  const [exporting, setExporting] = useState(false)

  async function exportDiagnostics() {
    setExporting(true)
    const result = await window.api.invoke('system:exportDiagnostics')
    setExporting(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    toast('success', 'Diagnostics exported')
    await window.api.invoke('system:openPath', { path: result.data.filePath })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card data-testid="help-tours">
        <CardHeader
          icon={<Compass />}
          title="Guided tours"
          description="Restart a tour: RapBooster opens the screen and points at each part."
        />
        <div className="flex flex-wrap gap-1.5">
          {TOURS.map((tour) => (
            <Button
              key={tour.id}
              size="sm"
              onClick={() => help?.startTour(tour.id)}
              data-testid={`help-tour-${tour.id}`}
            >
              {topicById(tour.id)?.navLabel ?? tour.title}
            </Button>
          ))}
        </div>
      </Card>

      <Card data-testid="help-checklist-card">
        <CardHeader
          icon={<ListChecks />}
          title="Getting started"
          description="Link your number, import contacts, write a template and send a first campaign, step by step."
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            help?.setChecklist('active')
            router.push('/' as Route)
          }}
          data-testid="help-show-checklist"
        >
          Show the getting-started checklist again
        </Button>
      </Card>

      <Card data-testid="help-support">
        <CardHeader
          icon={<LifeBuoy />}
          title="Contact support"
          description="Export a diagnostics file and send it to support with a short description of the problem."
        />
        <p className="mb-3 text-xs text-ink-muted">
          The file has no message content; phone numbers and keys are hidden. The same
          button is in Settings, under &ldquo;Data &amp; diagnostics&rdquo;.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => void exportDiagnostics()}
            loading={exporting}
            data-testid="help-export-diagnostics"
          >
            Export diagnostics
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.push('/settings' as Route)}
            data-testid="help-open-settings"
          >
            Open Settings
          </Button>
        </div>
      </Card>
    </div>
  )
}

export function TroubleshootingList() {
  return (
    <div className="flex flex-col gap-2" data-testid="help-troubleshooting">
      {TROUBLESHOOTING.map((entry) => (
        <details
          key={entry.id}
          data-testid={`help-problem-${entry.id}`}
          className="rounded-card border border-line bg-surface px-4 py-3 shadow-card"
        >
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            {entry.problem}
          </summary>
          <p className="mt-2 text-sm text-ink-muted">{entry.why}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
            {entry.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>
      ))}
    </div>
  )
}

export function SafetyList() {
  return (
    <ol className="grid gap-3 md:grid-cols-2" data-testid="help-safety">
      {SAFETY_RULES.map((rule, i) => (
        <li key={rule.id} className="rounded-card border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-ink">
            {i + 1}. {rule.title}
          </p>
          <p className="mt-1 text-sm text-ink-muted">{rule.text}</p>
        </li>
      ))}
    </ol>
  )
}

export function GlossaryList() {
  return (
    <dl
      className="grid gap-x-6 gap-y-3 rounded-card border border-line bg-surface p-4 md:grid-cols-2"
      data-testid="help-glossary"
    >
      {GLOSSARY.map((entry) => (
        <div key={entry.term} data-testid="help-glossary-term">
          <dt className="text-sm font-semibold text-ink">{entry.term}</dt>
          <dd className="text-sm text-ink-muted">{entry.definition}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ShortcutList() {
  return (
    <ul
      className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface"
      data-testid="help-shortcuts"
    >
      {SHORTCUTS.map((s) => (
        <li
          key={`${s.keys}:${s.description}`}
          className="flex items-start gap-4 px-4 py-2.5"
        >
          <span className="w-36 shrink-0">
            <Kbd className="px-1.5">{s.keys}</Kbd>
          </span>
          <span className="text-sm text-ink-muted">{s.description}</span>
        </li>
      ))}
    </ul>
  )
}
