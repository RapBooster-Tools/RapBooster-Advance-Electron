'use client'

import { useState } from 'react'
import { CallsPanel } from '@renderer/components/automation/calls-panel'
import { FlowsPanel } from '@renderer/components/automation/flows/flows-panel'
import { RulesPanel } from '@renderer/components/automation/rules-panel'
import { WelcomeAwayPanel } from '@renderer/components/automation/welcome-away-panel'
import { WebhooksPanel } from '@renderer/components/automation/webhooks-panel'
import { PageHeader } from '@renderer/components/layout/page-header'
import { cn } from '@renderer/lib/cn'

const TABS = [
  { id: 'flows', label: 'Chatbot flows' },
  { id: 'rules', label: 'Keyword rules' },
  { id: 'welcome', label: 'Welcome & away' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'calls', label: 'Calls' },
] as const

type Tab = (typeof TABS)[number]['id']

export default function AutomationPage() {
  const [tab, setTab] = useState<Tab>('rules')

  return (
    <>
      <PageHeader
        title="Automation"
        description="Chatbot flows, keyword auto-replies, welcome and away messages, webhooks and call handling"
      />
      <div className="flex gap-1 border-b border-line px-6 pt-3" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-testid={`automation-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-t-control px-3 py-1.5 text-sm',
              tab === t.id
                ? 'bg-primary font-medium text-on-primary'
                : 'text-ink-muted hover:bg-wa-in hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-6" role="tabpanel">
        {tab === 'flows' && <FlowsPanel />}
        {tab === 'rules' && <RulesPanel />}
        {tab === 'welcome' && <WelcomeAwayPanel />}
        {tab === 'webhooks' && <WebhooksPanel />}
        {tab === 'calls' && <CallsPanel />}
      </div>
    </>
  )
}
