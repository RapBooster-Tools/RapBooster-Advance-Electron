'use client'

import { useMemo, useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import { cn } from '@renderer/lib/cn'
import type { GroupRow } from './shared'

/** The group list (select / manage) and the bulk-send panel. */
export function GroupsTab({
  list,
  devices,
  deviceFilter,
  onDeviceFilter,
  selected,
  onSelected,
  onManage,
}: {
  list: GroupRow[]
  devices: Array<{ id: string; name: string }>
  deviceFilter: string
  onDeviceFilter: (deviceId: string) => void
  selected: string[]
  onSelected: (update: (current: string[]) => string[]) => void
  onManage: (group: GroupRow) => void
}) {
  const templates = useIpcQuery('template:list')
  const toast = useToast()
  const [templateId, setTemplateId] = useState('')
  const [delaySeconds, setDelaySeconds] = useState(2)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const template = templates.data?.find((t) => t.id === templateId)
  const allSelected = useMemo(
    () => list.length > 0 && list.every((g) => selected.includes(g.id)),
    [list, selected],
  )

  async function send() {
    setError(undefined)
    setBusy(true)
    const result = await window.api.invoke('groupSend:create', {
      templateId,
      groupIds: selected,
      delaySeconds,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }
    toast('success', `Sending to ${selected.length} group(s)`)
    onSelected(() => [])
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[320px] shrink-0 flex-col border-r border-line">
        <div className="flex flex-col gap-2 border-b border-line p-3">
          <label htmlFor="group-device" className="text-xs font-semibold text-ink">
            Filter by Device
          </label>
          <select
            id="group-device"
            data-testid="group-device-filter"
            value={deviceFilter}
            onChange={(e) => onDeviceFilter(e.target.value)}
            className="rounded-control border border-line px-2 py-1.5 text-sm outline-none focus:border-primary"
          >
            <option value="">-- All Devices --</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={() => onSelected(() => (allSelected ? [] : list.map((g) => g.id)))}
            disabled={list.length === 0}
            data-testid="select-all-groups"
          >
            {allSelected ? 'Select none' : 'Select All'}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="group-list">
          {list.length === 0 ? (
            <p className="p-3 text-xs text-ink-muted">
              No groups yet. Connect a device and press Sync.
            </p>
          ) : (
            list.map((group) => {
              const isSelected = selected.includes(group.id)
              return (
                <div
                  key={group.id}
                  data-testid="group-row"
                  className={cn(
                    'mb-1 flex items-center rounded-card border',
                    isSelected
                      ? 'border-selected bg-status-ok-bg'
                      : 'border-line bg-surface hover:bg-wa-in',
                  )}
                >
                  <button
                    type="button"
                    data-testid="group-item"
                    aria-pressed={isSelected}
                    onClick={() =>
                      onSelected((c) =>
                        c.includes(group.id)
                          ? c.filter((x) => x !== group.id)
                          : [...c, group.id],
                      )
                    }
                    className="min-w-0 flex-1 px-2.5 py-2 text-left text-sm text-ink"
                  >
                    <span className="block truncate font-medium">{group.name}</span>
                    <span className="text-xs text-ink-muted" data-testid="group-meta">
                      {group.memberCount} members{group.isAdmin ? ' · admin' : ''}
                      {group.announce ? ' · admins only' : ''}
                      {group.parentId ? ' · in community' : ''}
                    </span>
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mr-1.5"
                    onClick={() => onManage(group)}
                    data-testid="manage-group"
                    aria-label={`Manage ${group.name}`}
                  >
                    Manage
                  </Button>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-6">
        <h2 className="text-sm font-semibold text-ink">Send Messages to Groups</h2>

        <div className="rounded-card border border-line bg-surface p-3">
          <p className="text-xs font-semibold text-ink" data-testid="selected-count">
            Selected Groups ({selected.length})
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {selected.length === 0
              ? 'No groups selected'
              : list
                  .filter((g) => selected.includes(g.id))
                  .map((g) => g.name)
                  .join(', ')}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="group-template" className="text-xs font-semibold text-ink">
            Select Template
          </label>
          <select
            id="group-template"
            data-testid="group-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">-- Choose template --</option>
            {(templates.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-bubble bg-wa-out px-3 py-2 text-sm whitespace-pre-wrap text-ink">
          {template?.content ?? (
            <span className="text-ink-subtle">(Select a template to preview)</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="group-delay" className="text-xs font-semibold text-ink">
            Delay Between Messages (seconds)
          </label>
          <input
            id="group-delay"
            type="number"
            min={0}
            max={300}
            data-testid="group-delay"
            value={delaySeconds}
            onChange={(e) => setDelaySeconds(Number(e.target.value))}
            className="w-32 rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        <Button
          variant="primary"
          className="self-start"
          onClick={() => void send()}
          disabled={busy}
          data-testid="send-to-groups"
        >
          Send to Selected Groups
        </Button>

        {error && (
          <p className="text-xs text-danger" role="alert" data-testid="group-send-error">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
