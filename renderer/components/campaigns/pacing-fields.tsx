'use client'

import { FieldHelp } from '@renderer/components/help/field-help'
import type { FieldHelpId } from '@renderer/help'

export interface Pacing {
  delayFrom: number
  delayTo: number
  sleepDuration: number
  sleepAfter: number
}

/** Field metadata; the bounds mirror the `campaign:create` schema. */
const FIELDS: ReadonlyArray<{
  key: keyof Pacing
  label: string
  min: number
  max: number
  testId: string
  help: FieldHelpId
}> = [
  {
    key: 'delayFrom',
    label: 'Random Delay From (sec)',
    min: 0,
    max: 300,
    testId: 'cmp-delay-from',
    help: 'pacing-delay-from',
  },
  {
    key: 'delayTo',
    label: 'Random Delay To (sec)',
    min: 0,
    max: 300,
    testId: 'cmp-delay-to',
    help: 'pacing-delay-from',
  },
  {
    key: 'sleepDuration',
    label: 'Sleep Duration (sec)',
    min: 0,
    max: 600,
    testId: 'cmp-sleep',
    help: 'pacing-sleep',
  },
  {
    key: 'sleepAfter',
    label: 'Sleep After N Messages',
    min: 1,
    max: 100,
    testId: 'cmp-sleep-after',
    help: 'pacing-sleep',
  },
]

/** The four pacing inputs of the create-campaign dialog (SPRINTS.md §2.3). */
export function PacingFields({
  value,
  onChange,
}: {
  value: Pacing
  onChange: (next: Pacing) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {FIELDS.map(({ key, label, min, max, testId, help }) => (
        <div key={testId} className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1">
            <label htmlFor={testId} className="text-xs font-semibold text-ink">
              {label}
            </label>
            <FieldHelp id={help} />
          </span>
          <input
            id={testId}
            data-testid={testId}
            type="number"
            min={min}
            max={max}
            value={value[key]}
            onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) })}
            className="rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
      ))}
    </div>
  )
}
