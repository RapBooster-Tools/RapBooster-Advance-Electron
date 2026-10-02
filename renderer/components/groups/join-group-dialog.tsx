'use client'

import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import { inputClass } from './shared'

/** Join a group with one device from a chat.whatsapp.com link or code. */
export function JoinGroupDialog({
  onClose,
  onJoined,
}: {
  onClose: () => void
  onJoined: () => void
}) {
  const devices = useIpcQuery('device:list')
  const connected = (devices.data ?? []).filter((d) => d.status === 'connected')
  const [deviceId, setDeviceId] = useState('')
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function submit() {
    setError(undefined)
    if (deviceId === '') {
      setError('Choose a connected device.')
      return
    }
    if (invite.trim().length < 4) {
      setError('Paste a chat.whatsapp.com invite link or its code.')
      return
    }
    setBusy(true)
    const result = await window.api.invoke('group:join', {
      deviceId,
      invite: invite.trim(),
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }
    onJoined()
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Join via link"
      testId="join-group-dialog"
      width={460}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={busy}
            data-testid="submit-join"
          >
            {busy ? 'Joining…' : 'Join group'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="join-device" className="text-xs font-semibold text-ink">
            Join with device
          </label>
          <select
            id="join-device"
            data-testid="join-device"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className={inputClass}
          >
            <option value="">-- Choose device --</option>
            {connected.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {devices.data && connected.length === 0 && (
            <p className="text-xs text-ink-subtle">No device is connected.</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="join-invite" className="text-xs font-semibold text-ink">
            Invite link
          </label>
          <input
            id="join-invite"
            data-testid="join-invite"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            placeholder="https://chat.whatsapp.com/…"
            className={inputClass}
          />
        </div>
        {error && (
          <p className="text-xs text-danger" role="alert" data-testid="join-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
