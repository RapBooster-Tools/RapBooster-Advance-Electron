'use client'

import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { FieldHelp } from '@renderer/components/help/field-help'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import type { IpcResponse } from '@shared/ipc'
import type { RuleMatchType } from '@shared/types'
import { Field, INPUT_CLASS } from './field'

export type KeywordRule = IpcResponse<'rule:list'>[number]

const MATCH_LABEL: Record<RuleMatchType, string> = {
  contains: 'Contains the keyword (whole word)',
  starts_with: 'Starts with the keyword',
  exact: 'Is exactly the keyword',
}

/** Create or edit one keyword rule. */
export function RuleDialog({
  rule,
  onClose,
  onSaved,
}: {
  rule: KeywordRule | null
  onClose: () => void
  onSaved: () => void
}) {
  const devices = useIpcQuery('device:list')
  const templates = useIpcQuery('template:list')

  const [name, setName] = useState(rule?.name ?? '')
  const [keywords, setKeywords] = useState<string[]>(rule?.keywords ?? [])
  const [draft, setDraft] = useState('')
  const [matchType, setMatchType] = useState<RuleMatchType>(rule?.matchType ?? 'contains')
  const [mode, setMode] = useState<'text' | 'template'>(
    rule?.templateId ? 'template' : 'text',
  )
  const [replyText, setReplyText] = useState(rule?.replyText ?? '')
  const [templateId, setTemplateId] = useState(rule?.templateId ?? '')
  const [deviceIds, setDeviceIds] = useState<string[]>(rule?.deviceIds ?? [])
  const [priority, setPriority] = useState(rule?.priority ?? 0)
  const [cooldown, setCooldown] = useState(rule?.cooldownMinutes ?? 10)
  const [enabled, setEnabled] = useState(rule?.enabled ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  function addKeyword(value: string): string[] {
    const next = value.trim().toLowerCase()
    if (!next || keywords.includes(next)) return keywords
    const updated = [...keywords, next]
    setKeywords(updated)
    return updated
  }

  function onKeywordKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addKeyword(draft)
      setDraft('')
    } else if (event.key === 'Backspace' && draft === '' && keywords.length > 0) {
      setKeywords(keywords.slice(0, -1))
    }
  }

  async function save() {
    setError(undefined)
    // A keyword still in the box when Save is pressed was meant to be added.
    const allKeywords = addKeyword(draft)
    setDraft('')
    if (!name.trim()) return setError('Give the rule a name.')
    if (allKeywords.length === 0) return setError('Add at least one keyword.')
    if (mode === 'text' && !replyText.trim()) return setError('Write the reply text.')
    if (mode === 'template' && !templateId) return setError('Choose a template.')

    const body = {
      name: name.trim(),
      keywords: allKeywords,
      matchType,
      deviceIds,
      enabled,
      priority,
      cooldownMinutes: cooldown,
      ...(mode === 'text' ? { replyText: replyText.trim() } : { templateId }),
    }
    setBusy(true)
    const result = rule
      ? await window.api.invoke('rule:update', { id: rule.id, ...body })
      : await window.api.invoke('rule:create', body)
    setBusy(false)
    if (!result.ok) return setError(result.error.userMessage)
    onSaved()
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={rule ? 'Edit keyword rule' : 'New keyword rule'}
      testId="rule-dialog"
      width={560}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={busy}
            data-testid="rule-save"
          >
            {busy ? 'Saving…' : 'Save rule'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Name" htmlFor="rule-name">
          <input
            id="rule-name"
            data-testid="rule-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Pricing question"
            className={INPUT_CLASS}
          />
        </Field>

        <Field
          label="Keywords"
          htmlFor="rule-keyword-input"
          hint="Press Enter after each keyword. Matching ignores upper and lower case."
        >
          <div className="flex flex-wrap items-center gap-1.5 rounded-control border border-line px-2 py-1.5 focus-within:border-primary">
            {keywords.map((k) => (
              <span
                key={k}
                data-testid="rule-keyword-chip"
                className="inline-flex items-center gap-1 rounded bg-wa-in px-2 py-0.5 text-xs text-ink"
              >
                {k}
                <button
                  type="button"
                  aria-label={`Remove ${k}`}
                  onClick={() => setKeywords(keywords.filter((x) => x !== k))}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
            <input
              id="rule-keyword-input"
              data-testid="rule-keyword-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeywordKey}
              placeholder={keywords.length === 0 ? 'price, cost, rate…' : ''}
              className="min-w-24 flex-1 py-0.5 text-sm outline-none"
            />
          </div>
        </Field>

        <Field
          label="Match when the message…"
          htmlFor="rule-match-type"
          info={<FieldHelp id="rule-match" />}
        >
          <select
            id="rule-match-type"
            data-testid="rule-match-type"
            value={matchType}
            onChange={(e) => setMatchType(e.target.value as RuleMatchType)}
            className={INPUT_CLASS}
          >
            {(Object.keys(MATCH_LABEL) as RuleMatchType[]).map((m) => (
              <option key={m} value={m}>
                {MATCH_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-semibold text-ink">Reply with</legend>
          <div className="flex gap-4 text-sm text-ink">
            {(['text', 'template'] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="rule-mode"
                  data-testid={`rule-mode-${m}`}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                {m === 'text' ? 'Text' : 'A template'}
              </label>
            ))}
          </div>
          {mode === 'text' ? (
            <textarea
              data-testid="rule-reply-text"
              aria-label="Reply text"
              rows={4}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Our prices start at…"
              className={INPUT_CLASS}
            />
          ) : (
            <select
              data-testid="rule-template"
              aria-label="Template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">-- Choose template --</option>
              {(templates.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-semibold text-ink">
            Answer on devices (none ticked = all devices)
          </legend>
          <div className="max-h-24 overflow-y-auto rounded-control border border-line p-2">
            {(devices.data ?? []).length === 0 && (
              <p className="text-xs text-ink-subtle">No devices yet.</p>
            )}
            {(devices.data ?? []).map((d) => (
              <label key={d.id} className="flex items-center gap-2 py-0.5 text-sm">
                <input
                  type="checkbox"
                  data-testid={`rule-device-${d.id}`}
                  checked={deviceIds.includes(d.id)}
                  onChange={() =>
                    setDeviceIds((c) =>
                      c.includes(d.id) ? c.filter((x) => x !== d.id) : [...c, d.id],
                    )
                  }
                />
                {d.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Priority"
            htmlFor="rule-priority"
            info={<FieldHelp id="flow-priority" />}
            hint="Higher runs first when two rules match."
          >
            <input
              id="rule-priority"
              data-testid="rule-priority"
              type="number"
              min={-100}
              max={100}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className={INPUT_CLASS}
            />
          </Field>
          <Field
            label="Cooldown per chat (minutes)"
            htmlFor="rule-cooldown"
            info={<FieldHelp id="rule-cooldown" />}
            hint="Stops the rule answering the same chat again too soon."
          >
            <input
              id="rule-cooldown"
              data-testid="rule-cooldown"
              type="number"
              min={0}
              max={1440}
              value={cooldown}
              onChange={(e) => setCooldown(Number(e.target.value))}
              className={INPUT_CLASS}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            data-testid="rule-enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Rule enabled
        </label>

        {error && (
          <p className="text-sm text-danger" data-testid="rule-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
