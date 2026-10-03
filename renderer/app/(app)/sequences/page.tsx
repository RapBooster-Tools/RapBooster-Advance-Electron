'use client'

import { ListOrdered } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@renderer/components/layout/page-header'
import { useToast } from '@renderer/components/providers/toast-provider'
import { EnrollDialog } from '@renderer/components/sequences/enroll-dialog'
import { EnrollmentsDialog } from '@renderer/components/sequences/enrollments-dialog'
import { SequenceEditorDialog } from '@renderer/components/sequences/sequence-editor-dialog'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { StatusPill } from '@renderer/components/ui/status-pill'
import { useIpcEvent, useIpcQuery } from '@renderer/hooks/useIpc'
import type { IpcResponse } from '@shared/ipc'
import type { SequenceStatus } from '@shared/types'

type Sequence = IpcResponse<'sequence:list'>[number]

const STATUS_TONE: Record<SequenceStatus, 'ok' | 'warn' | 'idle'> = {
  active: 'ok',
  paused: 'warn',
  archived: 'idle',
}

function formatDelay(minutes: number): string {
  if (minutes === 0) return 'immediately'
  if (minutes % 1440 === 0) return `${minutes / 1440}d`
  if (minutes % 60 === 0) return `${minutes / 60}h`
  return `${minutes}m`
}

export default function SequencesPage() {
  const sequences = useIpcQuery('sequence:list')
  const devices = useIpcQuery('device:list')
  // Live: a step sent, a reply stopped someone, or an enrollment changed.
  useIpcEvent('sequence:changed', () => sequences.refetch())
  const toast = useToast()
  const [editing, setEditing] = useState<Sequence | 'new'>()
  const [enrolling, setEnrolling] = useState<Sequence>()
  const [viewing, setViewing] = useState<Sequence>()
  const [deleting, setDeleting] = useState<Sequence>()
  const [busyId, setBusyId] = useState<string>()

  const deviceNames = new Map((devices.data ?? []).map((d) => [d.id, d.name]))

  async function setStatus(sequence: Sequence, status: SequenceStatus) {
    setBusyId(sequence.id)
    const result = await window.api.invoke('sequence:update', { id: sequence.id, status })
    setBusyId(undefined)
    if (!result.ok) toast('error', result.error.userMessage)
    sequences.refetch()
  }

  async function remove(sequence: Sequence) {
    setBusyId(sequence.id)
    const result = await window.api.invoke('sequence:delete', { id: sequence.id })
    setBusyId(undefined)
    setDeleting(undefined)
    if (!result.ok) toast('error', result.error.userMessage)
    else toast('success', 'Sequence deleted')
    sequences.refetch()
  }

  const list = sequences.data ?? []

  return (
    <>
      <PageHeader
        title="Drip Sequences"
        description="Timed follow-ups that stop when a contact replies"
        actions={
          <>
            <Button onClick={() => sequences.refetch()} data-testid="refresh-sequences">
              Refresh
            </Button>
            <Button
              variant="primary"
              onClick={() => setEditing('new')}
              data-testid="new-sequence"
            >
              + New Sequence
            </Button>
          </>
        }
      />

      {sequences.error && (
        <p className="px-6 pt-4 text-sm text-danger" role="alert">
          {sequences.error.userMessage}
        </p>
      )}

      {list.length === 0 && !sequences.loading ? (
        <EmptyState
          icon={ListOrdered}
          title="No sequences yet."
          description="Send a series of templates over days, one step at a time, and stop automatically when the contact replies."
          action={
            <Button variant="primary" onClick={() => setEditing('new')}>
              + New Sequence
            </Button>
          }
        />
      ) : (
        <div
          className="grid gap-4 p-6 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]"
          data-testid="sequence-grid"
        >
          {list.map((sequence) => (
            <div
              key={sequence.id}
              data-testid="sequence-card"
              className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-semibold text-ink"
                    data-testid="sequence-name"
                  >
                    {sequence.name}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {sequence.steps.length} step{sequence.steps.length === 1 ? '' : 's'} ·{' '}
                    {sequence.stopOnReply ? 'stops on reply' : 'continues after replies'}
                  </p>
                </div>
                <span data-testid="sequence-status">
                  <StatusPill tone={STATUS_TONE[sequence.status]}>
                    {sequence.status.charAt(0).toUpperCase() + sequence.status.slice(1)}
                  </StatusPill>
                </span>
              </div>

              <ol className="flex flex-col gap-0.5 text-xs text-ink-muted">
                {sequence.steps.map((step, index) => (
                  <li key={step.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      {index + 1}. {step.templateName}
                    </span>
                    <span className="shrink-0">
                      {index === 0 ? '' : '+'}
                      {formatDelay(step.delayMinutes)}
                    </span>
                  </li>
                ))}
              </ol>

              <p className="truncate text-xs text-ink-muted">
                Devices:{' '}
                {sequence.deviceIds
                  .map((id) => deviceNames.get(id) ?? 'Removed')
                  .join(', ') || 'none'}
              </p>

              <p className="text-xs" data-testid="sequence-counts">
                <span className="text-ink">Active: {sequence.counts.active}</span>
                {' | '}
                <span className="text-success">
                  Completed: {sequence.counts.completed}
                </span>
                {' | '}
                <span className="text-ink-muted">Stopped: {sequence.counts.stopped}</span>
                {' | '}
                <span className="text-danger">Failed: {sequence.counts.failed}</span>
              </p>

              <div className="mt-1 flex flex-wrap gap-2">
                {sequence.status === 'active' ? (
                  <Button
                    size="sm"
                    onClick={() => void setStatus(sequence, 'paused')}
                    disabled={busyId === sequence.id}
                    data-testid="pause-sequence"
                  >
                    Pause
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void setStatus(sequence, 'active')}
                    disabled={busyId === sequence.id}
                    data-testid="resume-sequence"
                  >
                    {sequence.status === 'archived' ? 'Restore' : 'Resume'}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => setEnrolling(sequence)}
                  disabled={sequence.status === 'archived'}
                  data-testid="enroll-sequence"
                >
                  Enroll
                </Button>
                <Button
                  size="sm"
                  onClick={() => setViewing(sequence)}
                  data-testid="view-enrollments"
                >
                  Enrollments
                </Button>
                <Button
                  size="sm"
                  onClick={() => setEditing(sequence)}
                  data-testid="edit-sequence"
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setDeleting(sequence)}
                  disabled={busyId === sequence.id}
                  data-testid="delete-sequence"
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <SequenceEditorDialog
          {...(editing === 'new' ? {} : { sequence: editing })}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            toast('success', editing === 'new' ? 'Sequence created' : 'Sequence saved')
            sequences.refetch()
          }}
        />
      )}

      {enrolling && (
        <EnrollDialog
          sequenceId={enrolling.id}
          sequenceName={enrolling.name}
          onClose={() => setEnrolling(undefined)}
          onEnrolled={() => sequences.refetch()}
        />
      )}

      {viewing && (
        <EnrollmentsDialog
          sequenceId={viewing.id}
          sequenceName={viewing.name}
          stepCount={viewing.steps.length}
          onClose={() => setViewing(undefined)}
          onChanged={() => sequences.refetch()}
        />
      )}

      {deleting && (
        <Dialog
          open
          onClose={() => setDeleting(undefined)}
          title="Delete sequence?"
          testId="delete-sequence-dialog"
          footer={
            <>
              <Button onClick={() => setDeleting(undefined)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => void remove(deleting)}
                disabled={busyId === deleting.id}
                data-testid="confirm-delete-sequence"
              >
                Delete
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink">
            “{deleting.name}” and all{' '}
            {deleting.counts.active +
              deleting.counts.completed +
              deleting.counts.stopped +
              deleting.counts.failed}{' '}
            of its enrollments will be removed. Contacts still waiting will receive no
            further steps.
          </p>
        </Dialog>
      )}
    </>
  )
}
