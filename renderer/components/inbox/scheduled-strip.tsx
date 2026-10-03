'use client'

import { format } from 'date-fns'
import { Clock } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { useIpcEvent, useIpcQuery } from '@renderer/hooks/useIpc'
import type { IpcResponse } from '@shared/ipc'
import { ConfirmDialog } from './confirm-dialog'
import { fileNameOf } from './inbox-types'

type Scheduled = IpcResponse<'scheduledMessage:list'>[number]

const STATUS_LABEL: Record<Scheduled['status'], string> = {
  scheduled: 'Scheduled',
  sending: 'Sending now…',
  sent: 'Sent',
  failed: 'Not sent',
  cancelled: 'Cancelled',
}

/** This chat's messages waiting to go out, shown just above the message box. */
export function ScheduledStrip({ chatId }: { chatId: string }) {
  const list = useIpcQuery('scheduledMessage:list', { chatId })
  const toast = useToast()
  const [confirming, setConfirming] = useState<Scheduled>()
  const [busy, setBusy] = useState(false)

  useIpcEvent('scheduledMessage:changed', (payload) => {
    if (payload.chatId === chatId) list.refetch()
  })

  async function cancel(row: Scheduled) {
    setBusy(true)
    const result = await window.api.invoke('scheduledMessage:cancel', { id: row.id })
    setBusy(false)
    setConfirming(undefined)
    if (!result.ok) {
      toast('error', result.error.userMessage)
    } else {
      toast(
        'success',
        row.status === 'failed' ? 'Dismissed' : 'Scheduled message cancelled',
      )
    }
    list.refetch()
  }

  const items = list.data ?? []
  if (items.length === 0) return null

  return (
    <div
      className="flex max-h-40 flex-col gap-1.5 overflow-y-auto border-t border-line bg-app-bg px-4 py-2"
      data-testid="scheduled-strip"
      data-help="inbox-scheduled"
    >
      {items.map((row) => (
        <div
          key={row.id}
          className="flex items-center gap-2 text-xs"
          data-testid="scheduled-item"
          data-status={row.status}
        >
          <Clock className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
          <span className="shrink-0 font-medium text-ink">
            {format(new Date(row.sendAt), 'd MMM, h:mm a')}
          </span>
          <span className="min-w-0 flex-1 truncate text-ink-muted">
            {row.mediaPath && `📎 ${fileNameOf(row.mediaPath).replace(/^\d+-/, '')} `}
            {row.body}
          </span>
          <span
            className={
              row.status === 'failed'
                ? 'shrink-0 rounded bg-status-warn-bg px-1.5 text-status-warn-fg'
                : 'shrink-0 rounded bg-status-idle-bg px-1.5 text-status-idle-fg'
            }
            data-testid="scheduled-status"
            title={row.error ?? undefined}
          >
            {STATUS_LABEL[row.status]}
          </span>
          {row.error && (
            <span
              className="max-w-[40%] truncate text-danger"
              data-testid="scheduled-error"
            >
              {row.error}
            </span>
          )}
          {(row.status === 'scheduled' || row.status === 'failed') && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                row.status === 'failed' ? void cancel(row) : setConfirming(row)
              }
              data-testid="scheduled-cancel"
            >
              {row.status === 'failed' ? 'Dismiss' : 'Cancel'}
            </Button>
          )}
        </div>
      ))}
      {confirming && (
        <ConfirmDialog
          title="Cancel this scheduled message?"
          message="It will not be sent. You can schedule it again later."
          confirmLabel="Cancel message"
          busy={busy}
          onConfirm={() => void cancel(confirming)}
          onCancel={() => setConfirming(undefined)}
          testId="scheduled-confirm"
        />
      )}
    </div>
  )
}
