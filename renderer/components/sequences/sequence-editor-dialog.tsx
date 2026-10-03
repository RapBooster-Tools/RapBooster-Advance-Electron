'use client'

import { useState } from 'react'
import { FieldHelp } from '@renderer/components/help/field-help'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import type { IpcResponse } from '@shared/ipc'

type Sequence = IpcResponse<'sequence:list'>[number]
type Unit = 'minutes' | 'hours' | 'days'

const UNIT_MINUTES: Record<Unit, number> = { minutes: 1, hours: 60, days: 1440 }
/** The contract's ceiling: 90 days. */
const MAX_DELAY_MINUTES = 129_600
const MAX_STEPS = 20

interface StepDraft {
  key: number
  templateId: string
  amount: number
  unit: Unit
}

/** Show a stored delay in the largest unit that divides it exactly. */
function splitDelay(minutes: number): { amount: number; unit: Unit } {
  if (minutes > 0 && minutes % 1440 === 0) return { amount: minutes / 1440, unit: 'days' }
  if (minutes > 0 && minutes % 60 === 0) return { amount: minutes / 60, unit: 'hours' }
  return { amount: minutes, unit: 'minutes' }
}

const inputClass =
  'rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary'

/** Create or edit a sequence: name, devices, stop-on-reply and its steps. */
export function SequenceEditorDialog({
  sequence,
  onClose,
  onSaved,
}: {
  sequence?: Sequence
  onClose: () => void
  onSaved: () => void
}) {
  const devices = useIpcQuery('device:list')
  const templates = useIpcQuery('template:list')

  const [name, setName] = useState(sequence?.name ?? '')
  const [deviceIds, setDeviceIds] = useState<string[]>(sequence?.deviceIds ?? [])
  const [stopOnReply, setStopOnReply] = useState(sequence?.stopOnReply ?? true)
  const [nextKey, setNextKey] = useState(sequence?.steps.length ?? 1)
  const [steps, setSteps] = useState<StepDraft[]>(() =>
    sequence
      ? sequence.steps.map((s, key) => ({
          key,
          templateId: s.templateId,
          ...splitDelay(s.delayMinutes),
        }))
      : [{ key: 0, templateId: '', amount: 0, unit: 'minutes' }],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  function toggleDevice(id: string) {
    setDeviceIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )
  }

  function patchStep(key: number, patch: Partial<StepDraft>) {
    setSteps((current) => current.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }

  function addStep() {
    setSteps((current) => [
      ...current,
      { key: nextKey, templateId: '', amount: 1, unit: 'days' },
    ])
    setNextKey((k) => k + 1)
  }

  async function save() {
    setError(undefined)
    if (name.trim() === '') return setError('Give the sequence a name.')
    if (deviceIds.length === 0) return setError('Pick at least one device.')
    if (steps.some((s) => !s.templateId))
      return setError('Choose a template for every step.')

    const payload = steps.map((s) => ({
      templateId: s.templateId,
      delayMinutes: Math.round(Math.max(0, s.amount) * UNIT_MINUTES[s.unit]),
    }))
    if (payload.some((s) => s.delayMinutes > MAX_DELAY_MINUTES)) {
      return setError('A delay can be at most 90 days.')
    }

    setBusy(true)
    const body = { name: name.trim(), deviceIds, stopOnReply, steps: payload }
    const result = sequence
      ? await window.api.invoke('sequence:update', { id: sequence.id, ...body })
      : await window.api.invoke('sequence:create', body)
    setBusy(false)

    if (!result.ok) return setError(result.error.userMessage)
    onSaved()
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={sequence ? 'Edit Sequence' : 'New Sequence'}
      testId="sequence-editor"
      width={620}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={busy}
            data-testid="seq-save"
          >
            {sequence ? 'Save' : 'Create Sequence'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="seq-name" className="text-xs font-semibold text-ink">
            Name
          </label>
          <input
            id="seq-name"
            data-testid="seq-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., New lead follow-up"
            className={inputClass}
          />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-xs font-semibold text-ink">Send From</legend>
          <div className="max-h-24 overflow-y-auto rounded-control border border-line p-2">
            {(devices.data ?? []).length === 0 && (
              <p className="text-xs text-ink-subtle">Link a device first.</p>
            )}
            {(devices.data ?? []).map((device) => (
              <label key={device.id} className="flex items-center gap-2 py-0.5 text-sm">
                <input
                  type="checkbox"
                  data-testid={`seq-device-${device.id}`}
                  checked={deviceIds.includes(device.id)}
                  onChange={() => toggleDevice(device.id)}
                />
                <span className="truncate">
                  {device.name} <span className="text-ink-subtle">({device.status})</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center gap-1">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              data-testid="seq-stop-on-reply"
              checked={stopOnReply}
              onChange={(e) => setStopOnReply(e.target.checked)}
            />
            Stop when the contact replies
          </label>
          <FieldHelp id="sequence-stop-on-reply" />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="flex items-center gap-1 text-xs font-semibold text-ink">
            Steps
            <FieldHelp id="sequence-delay" />
          </legend>
          {steps.map((step, index) => (
            <div
              key={step.key}
              data-testid="seq-step"
              className="flex flex-col gap-2 rounded-control border border-line p-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted">
                  Step {index + 1}
                </span>
                {steps.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSteps((c) => c.filter((s) => s.key !== step.key))}
                    data-testid={`seq-remove-step-${index}`}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <select
                aria-label={`Step ${index + 1} template`}
                data-testid={`seq-step-template-${index}`}
                value={step.templateId}
                onChange={(e) => patchStep(step.key, { templateId: e.target.value })}
                className={inputClass}
              >
                <option value="">-- Choose a template --</option>
                {(templates.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <span>Wait</span>
                <input
                  type="number"
                  min={0}
                  aria-label={`Step ${index + 1} delay`}
                  data-testid={`seq-step-delay-${index}`}
                  value={step.amount}
                  onChange={(e) =>
                    patchStep(step.key, { amount: Number(e.target.value) })
                  }
                  className={`${inputClass} w-20`}
                />
                <select
                  aria-label={`Step ${index + 1} delay unit`}
                  data-testid={`seq-step-unit-${index}`}
                  value={step.unit}
                  onChange={(e) => patchStep(step.key, { unit: e.target.value as Unit })}
                  className={inputClass}
                >
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
                <span>
                  {index === 0 ? 'after enrollment' : 'after the previous step'}
                </span>
              </div>
            </div>
          ))}
          {steps.length < MAX_STEPS && (
            <Button
              size="sm"
              onClick={addStep}
              data-testid="seq-add-step"
              className="self-start"
            >
              + Add step
            </Button>
          )}
        </fieldset>

        {error && (
          <p className="text-sm text-danger" role="alert" data-testid="seq-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
