'use client'

import { useState } from 'react'
import { Webhook as WebhookIcon } from 'lucide-react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { StatusPill } from '@renderer/components/ui/status-pill'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import type { IpcResponse } from '@shared/ipc'
import { formatWhen } from './field'
import { WebhookDialog } from './webhook-dialog'

type Webhook = IpcResponse<'webhook:list'>[number]

const DELIVERY_TONE = { delivered: 'ok', pending: 'warn', failed: 'danger' } as const

function LastStatus({ hook }: { hook: Webhook }) {
  if (hook.lastStatus === null && hook.lastError === null) {
    return <StatusPill tone="idle">Never called</StatusPill>
  }
  const ok = hook.lastError === null
  return (
    <span title={hook.lastError ?? ''}>
      <StatusPill tone={ok ? 'ok' : 'danger'}>
        {hook.lastStatus !== null
          ? `HTTP ${hook.lastStatus}`
          : (hook.lastError ?? 'Error')}
      </StatusPill>
    </span>
  )
}

function Deliveries({ id }: { id: string }) {
  const deliveries = useIpcQuery('webhook:deliveries', { id, limit: 20 })
  const rows = deliveries.data ?? []
  return (
    <div
      className="border-t border-line bg-app-bg px-3 py-2"
      data-testid="webhook-deliveries"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink">Recent deliveries</span>
        <Button size="sm" variant="ghost" onClick={deliveries.refetch}>
          Refresh
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-muted">Nothing sent yet.</p>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-t border-line" data-testid="delivery-row">
                <td className="py-1 pr-2 text-ink">{d.event}</td>
                <td className="py-1 pr-2">
                  <StatusPill tone={DELIVERY_TONE[d.status]}>{d.status}</StatusPill>
                </td>
                <td className="py-1 pr-2 text-ink-muted">
                  {d.attempts} attempt{d.attempts === 1 ? '' : 's'}
                </td>
                <td className="py-1 pr-2 text-danger">{d.lastError ?? ''}</td>
                <td className="py-1 text-right text-ink-muted">
                  {formatWhen(d.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function WebhooksPanel() {
  const hooks = useIpcQuery('webhook:list')
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<string>()
  const [testing, setTesting] = useState<string>()
  const toast = useToast()

  async function toggle(hook: Webhook) {
    const res = await window.api.invoke('webhook:update', {
      id: hook.id,
      enabled: !hook.enabled,
    })
    if (!res.ok) return toast('error', res.error.userMessage)
    hooks.refetch()
  }

  async function test(hook: Webhook) {
    setTesting(hook.id)
    const res = await window.api.invoke('webhook:test', { id: hook.id })
    setTesting(undefined)
    hooks.refetch()
    if (!res.ok) return toast('error', res.error.userMessage)
    if (res.data.error === null)
      toast('success', `Test delivered (HTTP ${res.data.status})`)
    else toast('error', `Test failed: ${res.data.error}`)
  }

  async function remove(hook: Webhook) {
    const res = await window.api.invoke('webhook:delete', { id: hook.id })
    if (!res.ok) return toast('error', res.error.userMessage)
    hooks.refetch()
  }

  const all = hooks.data ?? []
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          Signed JSON POSTs to your own systems. Failed calls retry for about nine hours.
        </p>
        <Button
          variant="primary"
          onClick={() => setCreating(true)}
          data-testid="webhook-new"
        >
          + New webhook
        </Button>
      </div>

      {all.length === 0 && !hooks.loading ? (
        <EmptyState
          icon={WebhookIcon}
          title="No webhooks yet"
          description="Send incoming messages, opt-outs and campaign results to a CRM, Zapier or your own server."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {all.map((h) => (
            <div
              key={h.id}
              className="rounded-card border border-line bg-surface"
              data-testid="webhook-row"
            >
              <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Webhook enabled"
                  data-testid="webhook-toggle"
                  checked={h.enabled}
                  onChange={() => void toggle(h)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-ink">{h.url}</p>
                  <p className="text-xs text-ink-muted">{h.events.join(', ')}</p>
                </div>
                <LastStatus hook={h} />
                <span className="text-xs text-ink-muted">
                  Last delivered {formatWhen(h.lastDeliveredAt)}
                </span>
                <Button
                  size="sm"
                  onClick={() => void test(h)}
                  disabled={testing === h.id}
                  data-testid="webhook-test"
                >
                  {testing === h.id ? 'Sending…' : 'Send test'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpen(open === h.id ? undefined : h.id)}
                  data-testid="webhook-show-deliveries"
                >
                  Deliveries
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(h)}>
                  Delete
                </Button>
              </div>
              {open === h.id && <Deliveries id={h.id} />}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <WebhookDialog onClose={() => setCreating(false)} onCreated={hooks.refetch} />
      )}
    </div>
  )
}
