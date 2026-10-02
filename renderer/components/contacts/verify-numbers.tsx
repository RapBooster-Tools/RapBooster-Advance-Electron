'use client'

import { useState } from 'react'
import type { IpcEventPayload } from '@shared/ipc'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { useIpcQuery } from '@renderer/hooks/useIpc'

export type VerifyProgress = IpcEventPayload<'contacts:verifyProgress'>

/** Choose the device that asks WhatsApp, then start the background check. */
export function VerifyDialog({
  listId,
  listName,
  onStarted,
  onClose,
}: {
  listId: string
  listName: string
  onStarted: (total: number) => void
  onClose: () => void
}) {
  const devices = useIpcQuery('device:list')
  const connected = (devices.data ?? []).filter((d) => d.status === 'connected')
  const [deviceId, setDeviceId] = useState('')
  const [recheck, setRecheck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const chosen = deviceId || connected[0]?.id || ''

  async function start() {
    if (!chosen) {
      setError('Connect a device first — the check runs through a WhatsApp account.')
      return
    }
    setBusy(true)
    setError(undefined)
    const result = await window.api.invoke('contacts:verifyNumbers', {
      listId,
      deviceId: chosen,
      recheck,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }
    onStarted(result.data.total)
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Check numbers in "${listName}"`}
      testId="verify-dialog"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void start()}
            disabled={busy}
            data-testid="verify-start"
          >
            {busy ? 'Starting…' : 'Start check'}
          </Button>
        </>
      }
    >
      <p className="text-xs text-ink-muted">
        Asks WhatsApp which numbers have an account, at a paced rate. Numbers that are not
        on WhatsApp can then be skipped by campaigns.
      </p>
      <div className="mt-3 flex flex-col gap-1.5">
        <label htmlFor="verify-device" className="text-xs font-semibold text-ink">
          Check with device
        </label>
        <select
          id="verify-device"
          data-testid="verify-device"
          value={chosen}
          onChange={(e) => setDeviceId(e.target.value)}
          className="rounded-control border border-line px-2 py-1.5 text-sm outline-none focus:border-primary"
        >
          {connected.length === 0 && <option value="">No connected device</option>}
          {connected.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.phone ? ` (${d.phone})` : ''}
            </option>
          ))}
        </select>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={recheck}
          onChange={(e) => setRecheck(e.target.checked)}
          data-testid="verify-recheck"
        />
        Re-check numbers that were already checked
      </label>
      {error && (
        <p className="mt-3 text-xs text-danger" role="alert" data-testid="verify-error">
          {error}
        </p>
      )}
    </Dialog>
  )
}

/** A live bar fed by `contacts:verifyProgress` — the page never polls. */
export function VerifyProgressBar({ progress }: { progress: VerifyProgress }) {
  const pct =
    progress.total === 0 ? 100 : Math.round((progress.checked / progress.total) * 100)
  return (
    <div
      className="mx-6 mb-2 rounded-card border border-line bg-surface px-3 py-2"
      data-testid="verify-progress"
      data-done={progress.done ? 'true' : 'false'}
    >
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span data-testid="verify-progress-text">
          {progress.done ? 'Check finished' : 'Checking numbers'} —{' '}
          {progress.checked.toLocaleString()} of {progress.total.toLocaleString()} ·{' '}
          {progress.valid.toLocaleString()} on WhatsApp ·{' '}
          {progress.invalid.toLocaleString()} not
        </span>
        <span>{pct}%</span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-wa-in"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      {progress.error && (
        <p className="mt-1.5 text-xs text-danger" role="alert">
          {progress.error}
        </p>
      )}
    </div>
  )
}
