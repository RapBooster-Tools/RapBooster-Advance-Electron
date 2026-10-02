'use client'

import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import type { GroupRow } from './shared'

/** Pending join requests (groups with join approval on). */
export function GroupRequestsPanel({
  group,
  onChanged,
}: {
  group: GroupRow
  onChanged: () => void
}) {
  const toast = useToast()
  const requests = useIpcQuery(
    'group:joinRequests',
    { groupId: group.id },
    { enabled: group.isAdmin },
  )
  const [busy, setBusy] = useState(false)

  async function handle(jids: string[], action: 'approve' | 'reject') {
    setBusy(true)
    const result = await window.api.invoke('group:handleJoinRequests', {
      groupId: group.id,
      jids,
      action,
    })
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    const verb = action === 'approve' ? 'Approved' : 'Rejected'
    const { approved, failed } = result.data
    toast(
      failed > 0 ? 'warning' : 'success',
      `${verb} ${approved}${failed > 0 ? `, ${failed} could not be handled` : ''}`,
    )
    requests.refetch()
    onChanged()
  }

  if (!group.isAdmin) {
    return <p className="text-xs text-ink-muted">Only admins can see join requests.</p>
  }

  const list = requests.data ?? []

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-ink" data-testid="request-count">
          {requests.loading ? 'Loading…' : `${list.length} pending`}
        </h3>
        {list.length > 1 && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void handle(
                list.map((r) => r.jid),
                'approve',
              )
            }
            data-testid="approve-all-requests"
          >
            Approve all
          </Button>
        )}
      </div>
      {requests.error && (
        <p className="text-xs text-danger">{requests.error.userMessage}</p>
      )}
      {!requests.loading && list.length === 0 && (
        <p className="text-xs text-ink-muted">No one is waiting to join.</p>
      )}
      <ul className="max-h-60 overflow-y-auto">
        {list.map((r) => (
          <li
            key={r.jid}
            data-testid="join-request"
            className="flex items-center gap-2 border-b border-line py-1.5 text-sm last:border-b-0"
          >
            <span className="flex-1 truncate">{r.phone}</span>
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => void handle([r.jid], 'approve')}
              data-testid="approve-request"
            >
              Approve
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void handle([r.jid], 'reject')}
              data-testid="reject-request"
            >
              Reject
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
