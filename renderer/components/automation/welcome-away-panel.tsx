'use client'

import { useState, type ReactNode } from 'react'
import type { IpcResponse } from '@shared/ipc'
import { useToast } from '@renderer/components/providers/toast-provider'
import { FieldHelp } from '@renderer/components/help/field-help'
import { Button } from '@renderer/components/ui/button'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import { Field, INPUT_CLASS } from './field'
import { HoursEditor } from './hours-editor'

type Config = IpcResponse<'autoreply:getConfig'>

const TAG_HINT = "Type {{Name}} to include the customer's name."

function Section({
  title,
  hint,
  enabled,
  onToggle,
  testId,
  children,
}: {
  title: string
  hint: string
  enabled: boolean
  onToggle: (on: boolean) => void
  testId: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          data-testid={`${testId}-enabled`}
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-semibold text-ink">{title}</span>
          <span className="block text-xs text-ink-muted">{hint}</span>
        </span>
      </label>
      {enabled && children}
    </section>
  )
}

function WelcomeAwayForm({ initial, onSaved }: { initial: Config; onSaved: () => void }) {
  const [config, setConfig] = useState<Config>(initial)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const setWelcome = (patch: Partial<Config['welcome']>) =>
    setConfig((c) => ({ ...c, welcome: { ...c.welcome, ...patch } }))
  const setAway = (patch: Partial<Config['away']>) =>
    setConfig((c) => ({ ...c, away: { ...c.away, ...patch } }))

  async function save() {
    setBusy(true)
    const res = await window.api.invoke('autoreply:setConfig', config)
    setBusy(false)
    if (!res.ok) return toast('error', res.error.userMessage)
    toast('success', 'Welcome and away messages saved.')
    onSaved()
  }

  return (
    <div
      className="flex max-w-3xl flex-col gap-4"
      data-testid="welcome-away"
      data-help="welcome-away"
    >
      <p className="text-sm text-ink-muted">
        These go out on their own, alongside any flow, keyword rule or AI reply. They are
        never sent to groups, to chats that opted out, or to numbers on your opt-out list.
      </p>

      <Section
        title="Welcome message"
        hint="Sent once, when someone messages you for the very first time."
        enabled={config.welcome.enabled}
        onToggle={(enabled) => setWelcome({ enabled })}
        testId="welcome"
      >
        <Field label="Welcome text" htmlFor="welcome-text" hint={TAG_HINT}>
          <textarea
            id="welcome-text"
            data-testid="welcome-text"
            rows={3}
            maxLength={4096}
            value={config.welcome.text}
            onChange={(e) => setWelcome({ text: e.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
      </Section>

      <Section
        title="Away message"
        hint="Sent when a message arrives outside your business hours."
        enabled={config.away.enabled}
        onToggle={(enabled) => setAway({ enabled })}
        testId="away"
      >
        <Field label="Away text" htmlFor="away-text" hint={TAG_HINT}>
          <textarea
            id="away-text"
            data-testid="away-text"
            rows={3}
            maxLength={4096}
            value={config.away.text}
            onChange={(e) => setAway({ text: e.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
        <Field
          label="Business hours"
          hint="Times are in this computer's time zone. Outside them, the away message is sent."
        >
          <HoursEditor
            hours={config.away.hours}
            onChange={(hours) => setAway({ hours })}
          />
        </Field>
        <Field
          label="Send the away message to the same chat at most every (hours)"
          htmlFor="away-cooldown"
          info={<FieldHelp id="away-cooldown" />}
          hint="Stops a customer who sends several messages at night from getting it each time."
        >
          <input
            id="away-cooldown"
            data-testid="away-cooldown"
            type="number"
            min={1}
            max={168}
            value={config.away.cooldownHours}
            onChange={(e) =>
              setAway({
                cooldownHours: Math.min(168, Math.max(1, Number(e.target.value) || 1)),
              })
            }
            className={`${INPUT_CLASS} w-28`}
          />
        </Field>
      </Section>

      <div>
        <Button
          variant="primary"
          onClick={() => void save()}
          disabled={busy}
          data-testid="welcome-away-save"
        >
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

/** Welcome and away messages, on the Automation screen. */
export function WelcomeAwayPanel() {
  const config = useIpcQuery('autoreply:getConfig')
  if (config.error) {
    return <p className="text-sm text-danger">{config.error.userMessage}</p>
  }
  if (!config.data) return <p className="text-sm text-ink-muted">Loading…</p>
  return <WelcomeAwayForm initial={config.data} onSaved={config.refetch} />
}
