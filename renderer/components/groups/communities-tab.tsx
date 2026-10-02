'use client'

import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import { CommunityCard } from './community-card'
import { inputClass } from './shared'

/** Communities: list, create, and manage the groups inside each. */
export function CommunitiesTab({
  deviceFilter,
  onChanged,
}: {
  deviceFilter: string
  onChanged: () => void
}) {
  const toast = useToast()
  const devices = useIpcQuery('device:list')
  const communities = useIpcQuery(
    'community:list',
    deviceFilter ? { deviceId: deviceFilter } : {},
  )
  const groups = useIpcQuery('group:list', {})

  const [creating, setCreating] = useState(false)
  const [deviceId, setDeviceId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const connected = (devices.data ?? []).filter((d) => d.status === 'connected')
  const deviceName = (id: string) => devices.data?.find((d) => d.id === id)?.name ?? id

  function refresh() {
    communities.refetch()
    groups.refetch()
    onChanged()
  }

  async function create() {
    if (deviceId === '' || name.trim() === '') {
      toast('error', 'Choose a device and enter a community name.')
      return
    }
    setBusy(true)
    const result = await window.api.invoke('community:create', {
      deviceId,
      name: name.trim(),
      description,
    })
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    toast('success', `Community "${result.data.name}" created`)
    setCreating(false)
    setName('')
    setDescription('')
    refresh()
  }

  const list = communities.data ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Communities</h2>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setCreating((c) => !c)}
          data-testid="new-community"
        >
          + New community
        </Button>
      </div>

      {creating && (
        <div
          className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3"
          data-testid="new-community-form"
        >
          <select
            aria-label="Device"
            data-testid="community-device"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className={inputClass}
          >
            <option value="">-- Choose connected device --</option>
            {connected.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Community name"
            data-testid="community-name"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder="Community name"
            className={inputClass}
          />
          <textarea
            aria-label="Community description"
            data-testid="community-description"
            rows={2}
            value={description}
            maxLength={2048}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className={inputClass}
          />
          <Button
            variant="primary"
            className="self-start"
            disabled={busy}
            onClick={() => void create()}
            data-testid="submit-community"
          >
            {busy ? 'Creating…' : 'Create community'}
          </Button>
        </div>
      )}

      {communities.error && (
        <p className="text-xs text-danger">{communities.error.userMessage}</p>
      )}
      {!communities.loading && list.length === 0 && (
        <p className="text-sm text-ink-muted" data-testid="no-communities">
          No communities yet. Create one, or connect a device that belongs to one.
        </p>
      )}

      {list.map((c) => (
        <CommunityCard
          key={c.id}
          community={c}
          deviceName={deviceName(c.deviceId)}
          groups={(groups.data ?? []).filter((g) => g.deviceId === c.deviceId)}
          onChanged={refresh}
        />
      ))}
    </div>
  )
}
