'use client'

import { AlertTriangle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { FieldHelp } from '@renderer/components/help/field-help'
import { Button } from '@renderer/components/ui/button'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import type { FieldHelpId } from '@renderer/help'
import type { IpcResponse } from '@shared/ipc'
import { WarmupConfigPanel } from './warmup-config'

type SendingDefaults = IpcResponse<'settings:getSendingDefaults'>
type NumberKey = {
  [K in keyof SendingDefaults]: SendingDefaults[K] extends number ? K : never
}[keyof SendingDefaults]
type BooleanKey = {
  [K in keyof SendingDefaults]: SendingDefaults[K] extends boolean ? K : never
}[keyof SendingDefaults]

const PACING: ReadonlyArray<readonly [string, NumberKey, number, number]> = [
  ['Delay from (sec)', 'delayFrom', 0, 300],
  ['Delay to (sec)', 'delayTo', 0, 300],
  ['Sleep duration (sec)', 'sleepDuration', 0, 600],
  ['Sleep after N messages', 'sleepAfter', 1, 100],
  ['Group message delay (sec)', 'groupMessageDelay', 0, 300],
  ['Group create delay (sec)', 'groupCreateDelay', 0, 60],
  ['Daily cap per device (0 = none)', 'dailyCapPerDevice', 0, 100000],
  ['Retry attempts', 'retryAttempts', 0, 10],
  ['Max devices sending at once', 'maxConcurrentDevices', 1, 20],
  ['Reply attribution window (hours)', 'attributionHours', 1, 720],
]

/** The "?" beside the settings whose label alone does not say enough. */
const PACING_HELP: Partial<Record<NumberKey, FieldHelpId>> = {
  delayFrom: 'pacing-delay-from',
  delayTo: 'pacing-delay-from',
  sleepDuration: 'pacing-sleep',
  sleepAfter: 'pacing-sleep',
  groupMessageDelay: 'group-delays',
  groupCreateDelay: 'group-delays',
  dailyCapPerDevice: 'daily-cap',
  retryAttempts: 'retry-attempts',
  maxConcurrentDevices: 'max-concurrent-devices',
  attributionHours: 'attribution-hours',
}

const SWITCHES: ReadonlyArray<readonly [BooleanKey, string, string]> = [
  [
    'simulateTyping',
    'Simulate typing',
    'Show “typing…” for a moment before each automated message, as a person would.',
  ],
  [
    'markReadOnReply',
    'Mark read on reply',
    'Blue-tick an incoming message when the bot or a keyword rule answers it.',
  ],
  [
    'healthBreaker',
    'Health breaker',
    'Pause a device automatically when its recent sends fail at a ban-like rate.',
  ],
]

const inputClass =
  'rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary'

function Field({
  id,
  label,
  help,
  children,
}: {
  id: string
  label: string
  help?: FieldHelpId | undefined
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1">
        <label htmlFor={id} className="text-xs font-semibold text-ink">
          {label}
        </label>
        {help && <FieldHelp id={help} />}
      </span>
      {children}
    </div>
  )
}

/**
 * Settings → Sending & safety. These apply to every device immediately: main
 * pushes them into the throttle on save, so a lowered cap or a new quiet-hours
 * window takes effect mid-campaign rather than at the next one.
 */
export function SendingSafetySection() {
  const defaults = useIpcQuery('settings:getSendingDefaults')
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  // Edits overlay the loaded values rather than being copied in by an effect.
  const [edits, setEdits] = useState<Partial<SendingDefaults>>({})

  const sending = defaults.data ? { ...defaults.data, ...edits } : undefined
  const set = (patch: Partial<SendingDefaults>) => setEdits((e) => ({ ...e, ...patch }))

  async function save() {
    if (!sending) return
    setBusy(true)
    const result = await window.api.invoke('settings:setSendingDefaults', edits)
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    setEdits({})
    defaults.refetch()
    toast('success', 'Sending defaults saved')
  }

  return (
    <section
      className="rounded-card border border-line bg-surface p-4"
      data-help="settings-sending"
    >
      <h2 className="mb-2 text-sm font-semibold text-ink">Sending &amp; safety</h2>
      <p className="mb-3 text-xs text-ink-muted">
        The daily cap, quiet hours and typing apply to every device as soon as you save.
        Delays are the default for new campaigns — a running campaign keeps its own,
        because changing its rhythm mid-send is exactly what gets accounts flagged.
      </p>

      {sending && (
        <>
          {sending.dailyCapPerDevice === 0 && (
            <p
              className="mb-3 flex items-start gap-2 rounded bg-status-warn-bg px-3 py-2 text-xs text-status-warn-fg"
              role="alert"
              data-testid="cap-unlimited-warning"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              No daily cap: a device can send without limit. WhatsApp bans numbers that
              send hundreds of messages a day — especially new ones. Set a cap unless you
              are sure.
            </p>
          )}

          <div className="grid grid-cols-3 gap-3">
            {PACING.map(([label, key, min, max]) => (
              <Field key={key} id={`sd-${key}`} label={label} help={PACING_HELP[key]}>
                <input
                  id={`sd-${key}`}
                  data-testid={`sd-${key}`}
                  type="number"
                  min={min}
                  max={max}
                  value={sending[key]}
                  onChange={(e) => set({ [key]: Number(e.target.value) })}
                  className={inputClass}
                />
              </Field>
            ))}
          </div>

          <div className="mt-4 rounded-card border border-line p-3">
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={sending.quietHoursEnabled}
                  onChange={(e) => set({ quietHoursEnabled: e.target.checked })}
                  data-testid="sd-quietHoursEnabled"
                />
                Quiet hours
              </label>
              <FieldHelp id="quiet-hours" />
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              No automated message goes out in this window (local time); work waits and
              resumes when it ends. Replies you type in the inbox still send.
            </p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <Field id="sd-quietHoursStart" label="From">
                <input
                  id="sd-quietHoursStart"
                  data-testid="sd-quietHoursStart"
                  type="time"
                  value={sending.quietHoursStart}
                  disabled={!sending.quietHoursEnabled}
                  onChange={(e) => set({ quietHoursStart: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field id="sd-quietHoursEnd" label="Until">
                <input
                  id="sd-quietHoursEnd"
                  data-testid="sd-quietHoursEnd"
                  type="time"
                  value={sending.quietHoursEnd}
                  disabled={!sending.quietHoursEnabled}
                  onChange={(e) => set({ quietHoursEnd: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {SWITCHES.map(([key, label, help]) => (
              <label key={key} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={sending[key]}
                  onChange={(e) => set({ [key]: e.target.checked })}
                  data-testid={`sd-${key}`}
                />
                <span>
                  <span className="font-semibold text-ink">{label}</span>
                  <span className="block text-xs text-ink-muted">{help}</span>
                </span>
              </label>
            ))}
          </div>

          <Button
            className="mt-3"
            variant="primary"
            onClick={save}
            disabled={busy}
            data-testid="save-sending-defaults"
          >
            Save sending defaults
          </Button>
        </>
      )}

      <WarmupConfigPanel />
    </section>
  )
}
