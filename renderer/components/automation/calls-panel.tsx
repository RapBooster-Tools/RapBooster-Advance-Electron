'use client'

import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { StatusPill } from '@renderer/components/ui/status-pill'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import type { IpcResponse } from '@shared/ipc'
import { formatWhen, INPUT_CLASS } from './field'
import { displayPhone } from '@shared/phone-display'

type CallConfig = IpcResponse<'calls:getConfig'>

export function CallsPanel() {
  const config = useIpcQuery('calls:getConfig')
  const calls = useIpcQuery('calls:list', { limit: 50 })
  const devices = useIpcQuery('device:list')
  const toast = useToast()
  // Edits overlay the loaded values, as on the Settings screen.
  const [edits, setEdits] = useState<CallConfig>()
  const [busy, setBusy] = useState(false)

  const current = edits ?? config.data
  const deviceName = new Map((devices.data ?? []).map((d) => [d.id, d.name]))

  async function save() {
    if (!current) return
    setBusy(true)
    const res = await window.api.invoke('calls:setConfig', current)
    setBusy(false)
    if (!res.ok) return toast('error', res.error.userMessage)
    setEdits(undefined)
    config.refetch()
    toast('success', 'Call settings saved')
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink">Incoming calls</h2>
        {current && (
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                data-testid="calls-auto-reject"
                checked={current.autoReject}
                onChange={(e) => setEdits({ ...current, autoReject: e.target.checked })}
              />
              Automatically reject voice and video calls
            </label>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="calls-message" className="text-xs font-semibold text-ink">
                Message sent to the caller (leave empty to send nothing)
              </label>
              <textarea
                id="calls-message"
                data-testid="calls-message"
                rows={3}
                maxLength={1000}
                value={current.message}
                onChange={(e) => setEdits({ ...current, message: e.target.value })}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <Button
                variant="primary"
                onClick={() => void save()}
                disabled={busy}
                data-testid="calls-save"
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-card border border-line bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Recent calls</h2>
          <Button size="sm" variant="ghost" onClick={calls.refetch}>
            Refresh
          </Button>
        </div>
        {(calls.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">No calls received yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs">
              <tr>
                {['From', 'Device', 'Type', 'Outcome', 'When'].map((h) => (
                  <th key={h} className="py-1.5 text-left font-medium text-ink-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(calls.data ?? []).map((c) => (
                <tr key={c.id} className="border-t border-line" data-testid="call-row">
                  <td className="py-1.5 font-mono text-xs text-ink">
                    {displayPhone(c.from)}
                  </td>
                  <td className="py-1.5 text-ink">{deviceName.get(c.deviceId) ?? '—'}</td>
                  <td className="py-1.5 text-ink-muted">
                    {c.isVideo ? 'Video' : 'Voice'}
                  </td>
                  <td className="py-1.5">
                    {c.rejected ? (
                      <StatusPill tone="warn">
                        Rejected{c.replied ? ' · replied' : ''}
                      </StatusPill>
                    ) : (
                      <StatusPill tone="idle">Not rejected</StatusPill>
                    )}
                  </td>
                  <td className="py-1.5 text-xs text-ink-muted">{formatWhen(c.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
