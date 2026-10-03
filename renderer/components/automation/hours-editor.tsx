'use client'

import { Trash2 } from 'lucide-react'
import type { IpcResponse } from '@shared/ipc'
import { Button } from '@renderer/components/ui/button'
import { INPUT_CLASS } from './field'

export type WeeklyHours = IpcResponse<'autoreply:getConfig'>['away']['hours']
type Day = keyof WeeklyHours

const DAYS: Array<[Day, string]> = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
]

const MAX_RANGES = 3

/** Opening hours for each weekday: closed, or up to three time ranges. */
export function HoursEditor({
  hours,
  onChange,
}: {
  hours: WeeklyHours
  onChange: (hours: WeeklyHours) => void
}) {
  const setDay = (day: Day, ranges: WeeklyHours[Day]) =>
    onChange({ ...hours, [day]: ranges })

  return (
    <div className="flex flex-col divide-y divide-line rounded-control border border-line">
      {DAYS.map(([day, label]) => {
        const ranges = hours[day]
        const open = ranges.length > 0
        return (
          <div
            key={day}
            className="flex flex-wrap items-center gap-3 px-3 py-2"
            data-testid={`hours-${day}`}
          >
            <span className="w-24 text-sm font-medium text-ink">{label}</span>
            <label className="flex items-center gap-1.5 text-sm text-ink">
              <input
                type="checkbox"
                data-testid={`hours-${day}-open`}
                checked={open}
                onChange={(e) =>
                  setDay(day, e.target.checked ? [{ start: '09:00', end: '18:00' }] : [])
                }
              />
              Open
            </label>
            {!open && <span className="text-xs text-ink-muted">Closed all day</span>}
            {ranges.map((range, i) => (
              <span key={i} className="flex items-center gap-1 text-sm text-ink-muted">
                <input
                  type="time"
                  aria-label={`${label} opening time ${i + 1}`}
                  data-testid={`hours-${day}-start-${i}`}
                  value={range.start}
                  onChange={(e) =>
                    setDay(
                      day,
                      ranges.map((r, j) =>
                        j === i ? { ...r, start: e.target.value } : r,
                      ),
                    )
                  }
                  className={INPUT_CLASS}
                />
                to
                <input
                  type="time"
                  aria-label={`${label} closing time ${i + 1}`}
                  data-testid={`hours-${day}-end-${i}`}
                  value={range.end}
                  onChange={(e) =>
                    setDay(
                      day,
                      ranges.map((r, j) => (j === i ? { ...r, end: e.target.value } : r)),
                    )
                  }
                  className={INPUT_CLASS}
                />
                {ranges.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${label} hours ${i + 1}`}
                    onClick={() =>
                      setDay(
                        day,
                        ranges.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                )}
              </span>
            ))}
            {open && ranges.length < MAX_RANGES && (
              <Button
                size="sm"
                variant="ghost"
                data-testid={`hours-${day}-add`}
                onClick={() => setDay(day, [...ranges, { start: '14:00', end: '18:00' }])}
              >
                + Add hours
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
