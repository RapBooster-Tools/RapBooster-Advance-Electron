'use client'

import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { useIpcQuery } from '@renderer/hooks/useIpc'

const FIELD =
  'rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary'
const LABEL = 'text-xs font-semibold text-ink'

function DeviceSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  const devices = useIpcQuery('device:list')
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="channel-device" className={LABEL}>
        Device
      </label>
      <select
        id="channel-device"
        data-testid="channel-device"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={FIELD}
      >
        <option value="">-- Choose a device --</option>
        {(devices.data ?? []).map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} ({d.status === 'connected' ? 'connected' : d.status})
          </option>
        ))}
      </select>
    </div>
  )
}

export function CreateChannelDialog({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: () => void
}) {
  const [deviceId, setDeviceId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function submit() {
    setBusy(true)
    setError(undefined)
    const result = await window.api.invoke('channel:create', {
      deviceId,
      name,
      description,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }
    onDone()
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Create Channel"
      testId="channel-create-dialog"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={busy || !deviceId || !name.trim()}
            data-testid="channel-create-submit"
          >
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <DeviceSelect value={deviceId} onChange={setDeviceId} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="channel-name" className={LABEL}>
            Channel name
          </label>
          <input
            id="channel-name"
            data-testid="channel-name"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="channel-description" className={LABEL}>
            Description
          </label>
          <textarea
            id="channel-description"
            data-testid="channel-description"
            value={description}
            maxLength={2048}
            onChange={(e) => setDescription(e.target.value)}
            className={`${FIELD} min-h-16 resize-y`}
          />
        </div>
        {error && (
          <p className="text-sm text-danger" data-testid="channel-dialog-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}

export function FollowChannelDialog({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: () => void
}) {
  const [deviceId, setDeviceId] = useState('')
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function submit() {
    setBusy(true)
    setError(undefined)
    const result = await window.api.invoke('channel:follow', { deviceId, invite })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }
    onDone()
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Follow Channel"
      testId="channel-follow-dialog"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={busy || !deviceId || invite.trim().length < 4}
            data-testid="channel-follow-submit"
          >
            Follow
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <DeviceSelect value={deviceId} onChange={setDeviceId} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="channel-invite" className={LABEL}>
            Channel link
          </label>
          <input
            id="channel-invite"
            data-testid="channel-invite"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            placeholder="https://whatsapp.com/channel/…"
            className={`${FIELD} font-mono text-xs`}
          />
        </div>
        {error && (
          <p className="text-sm text-danger" data-testid="channel-dialog-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
