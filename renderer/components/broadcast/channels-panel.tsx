'use client'

import { Radio } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { StatusPill } from '@renderer/components/ui/status-pill'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import type { IpcResponse } from '@shared/ipc'
import { CreateChannelDialog, FollowChannelDialog } from './channel-dialogs'

type ChannelDto = IpcResponse<'channel:list'>[number]

export function ChannelsPanel({
  channels,
  onChanged,
}: {
  channels: ChannelDto[]
  onChanged: () => void
}) {
  const toast = useToast()
  const devices = useIpcQuery('device:list')
  const [dialog, setDialog] = useState<'create' | 'follow'>()
  const [busyId, setBusyId] = useState<string>()

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast('success', 'Invite link copied')
    } catch (err) {
      console.warn('clipboard write refused', err)
      toast('error', 'Could not copy the link — select it and copy it manually.')
    }
  }

  async function remove(id: string) {
    setBusyId(id)
    const result = await window.api.invoke('channel:delete', { id })
    setBusyId(undefined)
    if (!result.ok) toast('error', result.error.userMessage)
    onChanged()
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Your channels</h2>
        <div className="flex gap-2">
          <Button onClick={() => setDialog('follow')} data-testid="channel-follow-open">
            Follow channel
          </Button>
          <Button
            variant="primary"
            onClick={() => setDialog('create')}
            data-testid="channel-create-open"
          >
            + Create channel
          </Button>
        </div>
      </div>

      {channels.length === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={Radio}
            title="No channels yet."
            description="Create a WhatsApp Channel from one of your devices, or follow one by its invite link."
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-left text-sm" data-testid="channels-table">
            <thead className="border-b border-line text-xs text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">Channel</th>
                <th className="px-3 py-2 font-semibold">Device</th>
                <th className="px-3 py-2 font-semibold">Role</th>
                <th className="px-3 py-2 font-semibold">Subscribers</th>
                <th className="px-3 py-2 font-semibold">Invite link</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr
                  key={c.id}
                  data-testid="channel-row"
                  data-channel-id={c.id}
                  className="border-b border-line last:border-0"
                >
                  <td className="px-3 py-2">
                    <p className="font-medium text-ink">{c.name}</p>
                    {c.description && (
                      <p className="max-w-64 truncate text-xs text-ink-muted">
                        {c.description}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {devices.data?.find((d) => d.id === c.deviceId)?.name ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill tone={c.role === 'subscriber' ? 'idle' : 'ok'}>
                      {c.role.charAt(0).toUpperCase() + c.role.slice(1)}
                    </StatusPill>
                  </td>
                  <td className="px-3 py-2" data-testid="channel-subscribers">
                    {c.subscribers.toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    {c.inviteUrl ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="max-w-56 truncate font-mono text-xs select-all"
                          data-testid="channel-invite-url"
                        >
                          {c.inviteUrl}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void copy(c.inviteUrl!)}
                          data-testid="channel-copy"
                        >
                          Copy
                        </Button>
                      </div>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Removes it from RapBooster only. The channel on WhatsApp is not deleted."
                      onClick={() => void remove(c.id)}
                      disabled={busyId === c.id}
                      data-testid="channel-delete"
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-3 py-2 text-xs text-ink-subtle">
            Removing a channel only forgets it here. The channel itself stays on WhatsApp
            — delete it from the WhatsApp app if you need to.
          </p>
        </div>
      )}

      {dialog === 'create' && (
        <CreateChannelDialog onClose={() => setDialog(undefined)} onDone={onChanged} />
      )}
      {dialog === 'follow' && (
        <FollowChannelDialog onClose={() => setDialog(undefined)} onDone={onChanged} />
      )}
    </section>
  )
}
