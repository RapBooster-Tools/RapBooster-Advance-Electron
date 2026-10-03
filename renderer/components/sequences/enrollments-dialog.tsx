'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/cn'
import type { IpcResponse } from '@shared/ipc'
import type { EnrollmentStatus } from '@shared/types'

type Enrollment = IpcResponse<'sequence:enrollments'>['items'][number]
type Filter = EnrollmentStatus | 'all'

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'failed', label: 'Failed' },
]

const TONE: Record<EnrollmentStatus, string> = {
  active: 'text-ink',
  sending: 'text-status-warn-fg',
  completed: 'text-success',
  stopped: 'text-ink-subtle',
  failed: 'text-danger',
}

const PAGE = 200

/** Who is in a sequence, where each contact is, and removing contacts from it. */
export function EnrollmentsDialog({
  sequenceId,
  sequenceName,
  stepCount,
  onClose,
  onChanged,
}: {
  sequenceId: string
  sequenceName: string
  stepCount: number
  onClose: () => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [filter, setFilter] = useState<Filter>('all')
  const [nonce, setNonce] = useState(0)
  const [page, setPage] = useState<{
    key: string
    rows: Enrollment[]
    total: number
    cursor: string | null
  }>({ key: '', rows: [], total: 0, cursor: null })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const key = `${sequenceId}|${filter}|${nonce}`
  // Derived, as in the campaign recipients dialog: the previous filter's rows
  // never render as if they were the new result.
  const loading = page.key !== key

  useEffect(() => {
    let cancelled = false
    void window.api
      .invoke('sequence:enrollments', {
        id: sequenceId,
        ...(filter === 'all' ? {} : { status: filter }),
        limit: PAGE,
      })
      .then((result) => {
        if (cancelled) return
        if (!result.ok) toast('error', result.error.userMessage)
        setPage({
          key,
          rows: result.ok ? result.data.items : [],
          total: result.ok ? result.data.total : 0,
          cursor: result.ok ? result.data.nextCursor : null,
        })
      })
    return () => {
      cancelled = true
    }
    // `key` encodes every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  async function loadMore() {
    if (!page.cursor) return
    setBusy(true)
    const result = await window.api.invoke('sequence:enrollments', {
      id: sequenceId,
      ...(filter === 'all' ? {} : { status: filter }),
      cursor: page.cursor,
      limit: PAGE,
    })
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    setPage((current) => ({
      ...current,
      rows: [...current.rows, ...result.data.items],
      cursor: result.data.nextCursor,
    }))
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function unenroll() {
    setBusy(true)
    const result = await window.api.invoke('sequence:unenroll', {
      enrollmentIds: [...selected],
    })
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    toast('success', `Removed ${selected.size} contact(s) from the sequence`)
    setSelected(new Set())
    setNonce((n) => n + 1)
    onChanged()
  }

  const { rows, total, cursor } = page

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Enrollments — ${sequenceName}`}
      testId="enrollments-dialog"
      width={760}
      footer={
        <>
          <Button
            variant="danger"
            onClick={() => void unenroll()}
            disabled={busy || selected.size === 0}
            data-testid="unenroll-selected"
          >
            Unenroll selected ({selected.size})
          </Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            data-testid={`enrollment-filter-${f.value}`}
            onClick={() => {
              setFilter(f.value)
              setSelected(new Set())
            }}
            className={cn(
              'rounded-control px-2.5 py-1 text-xs',
              filter === f.value
                ? 'bg-primary text-white'
                : 'border border-line text-ink hover:bg-wa-in',
            )}
          >
            {f.label}
          </button>
        ))}
        <Button
          size="sm"
          onClick={() => setNonce((n) => n + 1)}
          data-testid="enrollments-refresh"
        >
          Refresh
        </Button>
        <span className="ml-auto text-xs text-ink-muted" data-testid="enrollment-total">
          {total.toLocaleString()} enrolled
        </span>
      </div>

      {rows.length === 0 && !loading ? (
        <p className="py-6 text-center text-sm text-ink-muted">
          No enrollments match that filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full text-xs">
            <thead className="bg-app-bg">
              <tr>
                {['', 'Phone', 'Name', 'Status', 'Sent', 'Next send', 'Note'].map(
                  (h, i) => (
                    <th
                      key={i}
                      className="px-2 py-1.5 text-left font-medium text-ink-muted"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const waiting = r.status === 'active' || r.status === 'sending'
                return (
                  <tr
                    key={r.id}
                    className="border-t border-line"
                    data-testid="enrollment-row"
                  >
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.contactName}`}
                        data-testid={`enrollment-select-${r.id}`}
                        checked={selected.has(r.id)}
                        disabled={!waiting}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className="px-2 py-1.5 font-mono text-ink">{r.phone}</td>
                    <td className="max-w-32 truncate px-2 py-1.5 text-ink">
                      {r.contactName}
                    </td>
                    <td
                      className={cn('px-2 py-1.5 font-medium', TONE[r.status])}
                      data-testid="enrollment-status"
                    >
                      {r.status}
                    </td>
                    <td className="px-2 py-1.5 text-ink">
                      {Math.min(r.nextStep, stepCount)} / {stepCount}
                    </td>
                    <td className="px-2 py-1.5 text-ink-muted">
                      {waiting && r.nextRunAt
                        ? new Date(r.nextRunAt).toLocaleString()
                        : '—'}
                    </td>
                    <td
                      className="max-w-48 truncate px-2 py-1.5 text-ink-muted"
                      title={r.stoppedReason ?? ''}
                    >
                      {r.stoppedReason ?? ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {cursor && (
        <Button
          className="mt-3"
          onClick={() => void loadMore()}
          disabled={busy || loading}
        >
          Load more
        </Button>
      )}
    </Dialog>
  )
}
