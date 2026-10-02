'use client'

import { RefreshCw } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import { Panel } from './form'

const fmt = new Intl.NumberFormat()

function Stat({
  label,
  value,
  testId,
}: {
  label: string
  value: string
  testId: string
}) {
  return (
    <div className="rounded-card border border-line px-3 py-2">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-lg font-semibold text-ink" data-testid={testId}>
        {value}
      </p>
    </div>
  )
}

/** Model calls and tokens: today, this month, and the last seven days. */
export function AiUsagePanel() {
  const usage = useIpcQuery('ai:usage')
  const data = usage.data

  return (
    <Panel
      title="Usage"
      actions={
        <Button
          size="sm"
          variant="ghost"
          onClick={usage.refetch}
          data-testid="ai-usage-refresh"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh
        </Button>
      }
    >
      {!data ? (
        <p className="text-xs text-ink-muted">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Stat
              label="Replies generated today"
              value={fmt.format(data.today.calls)}
              testId="ai-usage-today-calls"
            />
            <Stat
              label="Tokens today"
              value={fmt.format(data.today.promptTokens + data.today.completionTokens)}
              testId="ai-usage-today-tokens"
            />
            <Stat
              label="Replies this month"
              value={fmt.format(data.month.calls)}
              testId="ai-usage-month-calls"
            />
            <Stat
              label="Tokens this month"
              value={fmt.format(data.month.promptTokens + data.month.completionTokens)}
              testId="ai-usage-month-tokens"
            />
          </div>
          <table className="w-full text-left text-xs" data-testid="ai-usage-days">
            <thead className="text-ink-muted">
              <tr>
                <th className="py-1 font-medium">Day</th>
                <th className="py-1 text-right font-medium">Calls</th>
                <th className="py-1 text-right font-medium">Prompt tokens</th>
                <th className="py-1 text-right font-medium">Reply tokens</th>
              </tr>
            </thead>
            <tbody>
              {[...data.days].reverse().map((d) => (
                <tr key={d.date} className="border-t border-line text-ink">
                  <td className="py-1">{d.date}</td>
                  <td className="py-1 text-right">{fmt.format(d.calls)}</td>
                  <td className="py-1 text-right">{fmt.format(d.promptTokens)}</td>
                  <td className="py-1 text-right">{fmt.format(d.completionTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Panel>
  )
}
