'use client'

import { Bot } from 'lucide-react'
import { useState } from 'react'
import { AiLimitsPanel } from '@renderer/components/chatbot/ai-limits-panel'
import { AiProviderPanel } from '@renderer/components/chatbot/ai-provider-panel'
import { AiUsagePanel } from '@renderer/components/chatbot/ai-usage-panel'
import { Field, INPUT, NumberField, Panel } from '@renderer/components/chatbot/form'
import type { AiConfig } from '@renderer/components/chatbot/providers'
import { PageHeader } from '@renderer/components/layout/page-header'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { useIpcQuery } from '@renderer/hooks/useIpc'

interface Config {
  enabled: boolean
  systemInstructions: string
  businessName: string | null
  businessEmail: string | null
  businessPhone: string | null
  responseDelay: number
  tone: string
  industry: string | null
  primaryGoal: string
  responseStyle: string
  language: string
  escalationTrigger: string
  escalationKeywords: string[]
  escalationMessage: string | null
  confidenceThreshold: number
  escalateAfterMessages: number
  escalateAfterMinutes: number
  products: string
  knowledgeBase: string
}

/** Option sets taken verbatim from the prototype (SPRINTS.md §2.8). */
const DELAY_PRESETS = [
  { value: 0, label: 'Instant (0 sec)' },
  { value: 1, label: 'Very Quick (1 sec)' },
  { value: 2, label: 'Quick (2 sec)' },
  { value: 3, label: 'Normal (3 sec)' },
  { value: 5, label: 'Thoughtful (5 sec)' },
]
const TONES = ['professional', 'friendly', 'formal', 'casual']
const TONE_LABEL: Record<string, string> = {
  professional: 'Professional',
  friendly: 'Friendly & Approachable',
  formal: 'Formal & Official',
  casual: 'Casual & Conversational',
}
const INDUSTRIES = [
  'E-Commerce',
  'SaaS',
  'Healthcare',
  'Hospitality',
  'Real Estate',
  'Customer Support',
  'Education',
  'Finance',
]
const GOALS: Array<[string, string]> = [
  ['support', 'Customer Support'],
  ['sales', 'Sales & Lead Generation'],
  ['inquiry', 'Inquiry Handling'],
  ['booking', 'Appointment Booking'],
  ['feedback', 'Feedback Collection'],
]
const STYLES: Array<[string, string]> = [
  ['conversational', 'Conversational'],
  ['bullets', 'Bullet Points'],
  ['detailed', 'Detailed/Long Form'],
  ['concise', 'Concise/Short'],
]
const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Hindi']
const TRIGGERS: Array<[string, string]> = [
  ['keywords', 'Keywords (urgent, complaint, etc)'],
  ['confidence', 'Low Confidence Threshold'],
  ['messages', 'After N Messages'],
  ['time', 'After Time Elapsed'],
]

export default function AIBotPage() {
  const loaded = useIpcQuery('chatbot:get')
  const toast = useToast()

  // Edits are held as an overlay on the loaded config rather than copied into
  // state by an effect. Copying would mean a synchronous setState inside an
  // effect (a cascading render), and a later refetch could clobber edits the
  // user is part-way through.
  const [edits, setEdits] = useState<Config>()
  const ai = useIpcQuery('ai:getConfig')
  const [aiEdits, setAiEdits] = useState<AiConfig>()
  const [busy, setBusy] = useState(false)

  const config = edits ?? (loaded.data as Config | undefined)
  const aiConfig = aiEdits ?? ai.data?.config

  function setAi<K extends keyof AiConfig>(key: K, value: AiConfig[K]) {
    setAiEdits((current) => {
      const base = current ?? ai.data?.config
      return base ? { ...base, [key]: value } : base
    })
  }

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setEdits((current) => {
      const base = current ?? (loaded.data as Config | undefined)
      return base ? { ...base, [key]: value } : base
    })
  }

  async function save() {
    if (!config) return
    setBusy(true)
    const result = await window.api.invoke('chatbot:save', config)
    const aiResult = aiConfig
      ? await window.api.invoke('ai:setConfig', aiConfig)
      : ({ ok: true } as const)
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    if (!aiResult.ok) {
      toast('error', aiResult.error.userMessage)
      return
    }
    toast('success', 'Chatbot configuration saved')
  }

  if (!config) {
    return <PageHeader title="AI Chatbot Configuration" description="Loading…" />
  }

  return (
    <>
      <PageHeader
        title="AI Chatbot Configuration"
        description="Configure automatic replies powered by OpenAI, Anthropic, Gemini or a compatible model."
        actions={
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={busy}
            data-testid="save-chatbot"
          >
            Save Configuration
          </Button>
        }
      />

      <div className="flex flex-col gap-4 p-6">
        {aiConfig && (
          <AiProviderPanel
            config={aiConfig}
            keys={ai.data?.keys}
            onChange={setAi}
            onKeySaved={ai.refetch}
          />
        )}

        <Panel title="System Instructions (Bot Behavior & Motive)">
          <textarea
            data-testid="system-instructions"
            value={config.systemInstructions}
            onChange={(e) => set('systemInstructions', e.target.value)}
            placeholder="Define bot personality, behavior rules, communication goals, and response patterns..."
            className={`${INPUT} min-h-28 resize-y font-mono`}
          />
        </Panel>

        <Panel title="Business Information">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Business Name" htmlFor="biz-name">
              <input
                id="biz-name"
                data-testid="biz-name"
                value={config.businessName ?? ''}
                onChange={(e) => set('businessName', e.target.value)}
                placeholder="Your business name"
                className={INPUT}
              />
            </Field>
            <Field label="Email" htmlFor="biz-email">
              <input
                id="biz-email"
                value={config.businessEmail ?? ''}
                onChange={(e) => set('businessEmail', e.target.value)}
                placeholder="support@company.com"
                className={INPUT}
              />
            </Field>
            <Field label="Phone" htmlFor="biz-phone">
              <input
                id="biz-phone"
                value={config.businessPhone ?? ''}
                onChange={(e) => set('businessPhone', e.target.value)}
                placeholder="+1-800-SUPPORT"
                className={INPUT}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Auto-Reply Settings">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              data-testid="enable-autoreply"
              checked={config.enabled}
              onChange={(e) => set('enabled', e.target.checked)}
            />
            Enable Auto-Replies
          </label>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Response Delay (sec)" htmlFor="delay-preset">
              <select
                id="delay-preset"
                data-testid="response-delay"
                value={config.responseDelay}
                onChange={(e) => set('responseDelay', Number(e.target.value))}
                className={INPUT}
              >
                {DELAY_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
                {!DELAY_PRESETS.some((p) => p.value === config.responseDelay) && (
                  <option value={config.responseDelay}>
                    Custom ({config.responseDelay} sec)
                  </option>
                )}
              </select>
            </Field>
            <Field label="Tone" htmlFor="tone">
              <select
                id="tone"
                data-testid="tone"
                value={config.tone}
                onChange={(e) => set('tone', e.target.value)}
                className={INPUT}
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {TONE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Industry" htmlFor="industry">
              <input
                id="industry"
                list="industry-options"
                data-testid="industry"
                value={config.industry ?? ''}
                onChange={(e) => set('industry', e.target.value)}
                placeholder="Or type custom industry..."
                className={INPUT}
              />
            </Field>
          </div>
          <datalist id="industry-options">
            {INDUSTRIES.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </Panel>

        {aiConfig && <AiLimitsPanel config={aiConfig} onChange={setAi} />}

        <Panel title="Bot Personality & Goals">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Primary Goal" htmlFor="goal">
              <select
                id="goal"
                data-testid="primary-goal"
                value={config.primaryGoal}
                onChange={(e) => set('primaryGoal', e.target.value)}
                className={INPUT}
              >
                {GOALS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Response Style" htmlFor="style">
              <select
                id="style"
                data-testid="response-style"
                value={config.responseStyle}
                onChange={(e) => set('responseStyle', e.target.value)}
                className={INPUT}
              >
                {STYLES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Language" htmlFor="language">
              <select
                id="language"
                data-testid="language"
                value={config.language}
                onChange={(e) => set('language', e.target.value)}
                className={INPUT}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l.toLowerCase()}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Panel>

        <Panel title="Escalation & Handling">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Escalation Trigger" htmlFor="trigger">
              <select
                id="trigger"
                data-testid="escalation-trigger"
                value={config.escalationTrigger}
                onChange={(e) => set('escalationTrigger', e.target.value)}
                className={INPUT}
              >
                {TRIGGERS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Escalation Keywords (comma-separated)"
              htmlFor="keywords"
              hint="Leave blank for sensible defaults: urgent, complaint, refund, lawyer, manager."
            >
              <input
                id="keywords"
                data-testid="escalation-keywords"
                value={config.escalationKeywords.join(', ')}
                onChange={(e) =>
                  set(
                    'escalationKeywords',
                    e.target.value
                      .split(',')
                      .map((k) => k.trim())
                      .filter((k) => k !== ''),
                  )
                }
                className={INPUT}
              />
            </Field>
          </div>

          {config.escalationTrigger === 'messages' && (
            <NumberField
              id="escalate-after-messages"
              label="Hand over after this many bot replies in a chat"
              hint="0 turns the trigger off"
              min={0}
              max={100}
              value={config.escalateAfterMessages}
              onChange={(v) => set('escalateAfterMessages', v)}
            />
          )}
          {config.escalationTrigger === 'time' && (
            <NumberField
              id="escalate-after-minutes"
              label="Hand over when a conversation has run this many minutes"
              hint="0 turns the trigger off"
              min={0}
              max={10_080}
              value={config.escalateAfterMinutes}
              onChange={(v) => set('escalateAfterMinutes', v)}
            />
          )}
          {config.escalationTrigger === 'confidence' && (
            <p
              className="rounded-card bg-status-warn-bg px-2 py-1.5 text-xs text-status-warn-fg"
              data-testid="trigger-unsupported"
            >
              No AI provider returns a confidence score, so this trigger is stored but not
              enforced — see REQUIREMENTS §5.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Escalation Message" htmlFor="esc-msg">
              <input
                id="esc-msg"
                value={config.escalationMessage ?? ''}
                onChange={(e) => set('escalationMessage', e.target.value)}
                placeholder="Connecting you with support team..."
                className={INPUT}
              />
            </Field>
            <Field label="Confidence Threshold (%)" htmlFor="confidence">
              <input
                id="confidence"
                type="number"
                min={0}
                max={100}
                value={config.confidenceThreshold}
                onChange={(e) => set('confidenceThreshold', Number(e.target.value))}
                className={INPUT}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Products & Services (Bulk)">
          <textarea
            data-testid="products"
            value={config.products}
            onChange={(e) => set('products', e.target.value)}
            placeholder={'Product A | Premium solution\nProduct B | Enterprise package'}
            className={`${INPUT} min-h-24 resize-y font-mono`}
          />
          <p className="text-xs text-ink-subtle">Format: Name | Description</p>
        </Panel>

        <Panel title="Knowledge Base (Bulk)">
          <textarea
            data-testid="knowledge-base"
            value={config.knowledgeBase}
            onChange={(e) => set('knowledgeBase', e.target.value)}
            placeholder={
              'Q: How do I start? | A: Click signup...\nQ: Payment methods? | A: Credit card, PayPal...'
            }
            className={`${INPUT} min-h-24 resize-y font-mono`}
          />
          <p className="text-xs text-ink-subtle">Format: Q: Question | A: Answer</p>
        </Panel>

        <AiUsagePanel />

        <div className="flex items-start gap-2 pb-4">
          <Bot className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
          <p className="text-xs text-ink-muted">
            The bot never replies in a group, never replies to itself, and skips any chat
            you opt out of. Every reply is paced by the same anti-ban throttle campaigns
            use.
          </p>
        </div>
      </div>
    </>
  )
}
