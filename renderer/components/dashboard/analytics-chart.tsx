'use client'

import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import type { IpcResponse } from '@shared/ipc'

type Day = IpcResponse<'system:analytics'>['days'][number]
type SeriesKey = Exclude<keyof Day, 'date'>

/**
 * Fixed categorical order, validated for colour-vision deficiency against the
 * white card surface. Three of these sit under 3:1 contrast, which is why the
 * chart always carries a legend, per-day hover details and a table view.
 */
const SERIES: ReadonlyArray<{ key: SeriesKey; label: string; color: string }> = [
  { key: 'sent', label: 'Sent', color: '#2a78d6' },
  { key: 'failed', label: 'Failed', color: '#eb6834' },
  { key: 'delivered', label: 'Delivered', color: '#1baf7a' },
  { key: 'read', label: 'Read', color: '#eda100' },
  { key: 'replied', label: 'Replied', color: '#e87ba4' },
]

const W = 700
const H = 220
const PAD = { top: 12, right: 8, bottom: 26, left: 36 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
const GAP = 2

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    weekday: 'short',
  })
}

/** A round number at or above `max`, so gridlines land on readable values. */
function niceMax(max: number): number {
  if (max <= 4) return 4
  const magnitude = 10 ** Math.floor(Math.log10(max))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= max) ?? 10
  return step * magnitude
}

/** A bar with 4px rounded ends at the top, square on the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${
    x + w
  },${y + r}V${y + h}Z`
}

/** Seven days of campaign outcomes as grouped bars (no chart dependency). */
export function AnalyticsChart({ days }: { days: Day[] }) {
  const [asTable, setAsTable] = useState(false)
  const peak = Math.max(0, ...days.flatMap((d) => SERIES.map((s) => d[s.key])))
  const top = niceMax(peak)
  const groupW = PLOT_W / Math.max(1, days.length)
  const barW = Math.max(2, (groupW * 0.7 - GAP * (SERIES.length - 1)) / SERIES.length)
  const y = (v: number) => PAD.top + PLOT_H - (v / top) * PLOT_H
  const ticks = [0, top / 2, top]

  return (
    <section
      className="rounded-card border border-line bg-surface p-4"
      data-testid="analytics-chart"
      data-tour="dashboard-chart"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Last 7 days</h2>
        <div className="flex flex-wrap items-center gap-3">
          <ul className="flex flex-wrap gap-3 text-xs text-ink-muted" aria-label="Legend">
            {SERIES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 rounded-sm"
                  style={{ background: s.color }}
                  aria-hidden
                />
                {s.label}
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAsTable((t) => !t)}
            data-testid="analytics-table-toggle"
          >
            {asTable ? 'Chart' : 'Table'}
          </Button>
        </div>
      </div>

      {asTable ? (
        <table className="w-full text-xs" data-testid="analytics-table">
          <thead>
            <tr className="text-left text-ink-muted">
              <th className="py-1 font-medium">Day</th>
              {SERIES.map((s) => (
                <th key={s.key} className="py-1 text-right font-medium">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date} className="border-t border-line text-ink">
                <td className="py-1">{d.date}</td>
                {SERIES.map((s) => (
                  <td key={s.key} className="py-1 text-right tabular-nums">
                    {d[s.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label="Messages sent, failed, delivered, read and replied over the last 7 days"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                className="fill-ink-subtle"
              >
                {Math.round(t)}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const gx = PAD.left + i * groupW
            const bx =
              gx + (groupW - (barW * SERIES.length + GAP * (SERIES.length - 1))) / 2
            const summary = `${d.date}\n${SERIES.map(
              (s) => `${s.label}: ${d[s.key]}`,
            ).join('\n')}`
            return (
              <g key={d.date} data-testid="analytics-day">
                {SERIES.map((s, j) => {
                  const v = d[s.key]
                  if (v <= 0) return null
                  const barTop = y(v)
                  return (
                    <path
                      key={s.key}
                      d={barPath(
                        bx + j * (barW + GAP),
                        barTop,
                        barW,
                        PAD.top + PLOT_H - barTop,
                      )}
                      fill={s.color}
                    />
                  )
                })}
                {/* The whole day is the hover target: bars this thin are too small to aim at. */}
                <rect
                  x={gx}
                  y={PAD.top}
                  width={groupW}
                  height={PLOT_H}
                  fill="transparent"
                >
                  <title>{summary}</title>
                </rect>
                <text
                  x={gx + groupW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize={11}
                  className="fill-ink-muted"
                >
                  {dayLabel(d.date)}
                </text>
              </g>
            )
          })}
          {peak === 0 && (
            <text
              x={PAD.left + PLOT_W / 2}
              y={PAD.top + PLOT_H / 2}
              textAnchor="middle"
              fontSize={12}
              className="fill-ink-subtle"
            >
              No campaign messages in the last 7 days
            </text>
          )}
        </svg>
      )}
    </section>
  )
}
