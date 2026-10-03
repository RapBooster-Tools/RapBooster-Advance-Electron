'use client'

import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import type { FlowTrigger } from '@shared/flow'
import { FieldHelp } from '@renderer/components/help/field-help'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import { Field, INPUT_CLASS } from '../field'
import type { FlowDraft } from './flow-templates'

export const TRIGGER_LABEL: Record<FlowTrigger, string> = {
  keywords: 'When a message contains a keyword',
  new_chat: "On a new customer's first message",
  any: 'On every message (when no flow is running)',
}

type Settings = Omit<FlowDraft, 'graph' | 'id'>

/** Name, how the flow starts, and where it runs. */
export function FlowSettings({
  draft,
  onChange,
}: {
  draft: Settings
  onChange: (patch: Partial<Settings>) => void
}) {
  const devices = useIpcQuery('device:list')
  const [keyword, setKeyword] = useState('')

  function addKeyword() {
    const next = keyword.trim().toLowerCase()
    setKeyword('')
    if (next && !draft.keywords.includes(next)) {
      onChange({ keywords: [...draft.keywords, next] })
    }
  }

  function onKeywordKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addKeyword()
    }
  }

  return (
    <div className="grid gap-3 rounded-card border border-line bg-surface p-4 md:grid-cols-2">
      <Field label="Flow name" htmlFor="flow-name">
        <input
          id="flow-name"
          data-testid="flow-name"
          value={draft.name}
          maxLength={100}
          onChange={(e) => onChange({ name: e.target.value })}
          className={INPUT_CLASS}
        />
      </Field>

      <Field
        label="Start this flow"
        htmlFor="flow-trigger"
        info={<FieldHelp id="flow-trigger" />}
      >
        <select
          id="flow-trigger"
          data-testid="flow-trigger"
          value={draft.trigger}
          onChange={(e) => onChange({ trigger: e.target.value as FlowTrigger })}
          className={INPUT_CLASS}
        >
          {(Object.keys(TRIGGER_LABEL) as FlowTrigger[]).map((t) => (
            <option key={t} value={t}>
              {TRIGGER_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>

      {draft.trigger === 'keywords' && (
        <Field
          label="Keywords"
          htmlFor="flow-keyword-input"
          hint="Press Enter after each one. Whole words only, upper or lower case."
        >
          <div className="flex flex-wrap items-center gap-1.5 rounded-control border border-line px-2 py-1.5 focus-within:border-primary">
            {draft.keywords.map((k) => (
              <span
                key={k}
                data-testid="flow-keyword-chip"
                className="inline-flex items-center gap-1 rounded bg-wa-in px-2 py-0.5 text-xs text-ink"
              >
                {k}
                <button
                  type="button"
                  aria-label={`Remove ${k}`}
                  onClick={() =>
                    onChange({ keywords: draft.keywords.filter((x) => x !== k) })
                  }
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
            <input
              id="flow-keyword-input"
              data-testid="flow-keyword-input"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={onKeywordKey}
              onBlur={addKeyword}
              placeholder={draft.keywords.length === 0 ? 'menu, hi, help…' : ''}
              className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none"
            />
          </div>
        </Field>
      )}

      <Field
        label="Priority"
        htmlFor="flow-priority"
        info={<FieldHelp id="flow-priority" />}
        hint="When two flows could start, the higher number wins."
      >
        <input
          id="flow-priority"
          data-testid="flow-priority"
          type="number"
          min={-100}
          max={100}
          value={draft.priority}
          onChange={(e) => onChange({ priority: Number(e.target.value) || 0 })}
          className={INPUT_CLASS}
        />
      </Field>

      <fieldset className="flex flex-col gap-1.5 md:col-span-2">
        <legend className="mb-1 text-xs font-semibold text-ink">
          Answer on these WhatsApp numbers (none ticked = all of them)
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(devices.data ?? []).length === 0 && (
            <p className="text-xs text-ink-muted">No WhatsApp numbers linked yet.</p>
          )}
          {(devices.data ?? []).map((d) => (
            <label key={d.id} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                data-testid={`flow-device-${d.id}`}
                checked={draft.deviceIds.includes(d.id)}
                onChange={() =>
                  onChange({
                    deviceIds: draft.deviceIds.includes(d.id)
                      ? draft.deviceIds.filter((x) => x !== d.id)
                      : [...draft.deviceIds, d.id],
                  })
                }
              />
              {d.name}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          data-testid="flow-enabled"
          checked={draft.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        Flow switched on
      </label>
    </div>
  )
}
