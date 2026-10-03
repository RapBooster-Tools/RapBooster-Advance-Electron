'use client'

import { Users } from 'lucide-react'
import { useState } from 'react'
import { BulkCreateGroupsDialog } from '@renderer/components/groups/bulk-create-dialog'
import { CommunitiesTab } from '@renderer/components/groups/communities-tab'
import { ExportMembersDialog } from '@renderer/components/groups/export-members-dialog'
import { GroupsTab } from '@renderer/components/groups/groups-tab'
import { JoinGroupDialog } from '@renderer/components/groups/join-group-dialog'
import { ManageGroupDialog } from '@renderer/components/groups/manage-group-dialog'
import type { GroupRow } from '@renderer/components/groups/shared'
import { PageHeader } from '@renderer/components/layout/page-header'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { useIpcEvent, useIpcQuery } from '@renderer/hooks/useIpc'
import { cn } from '@renderer/lib/cn'

type Tab = 'groups' | 'communities'
type OpenDialog = 'create' | 'join' | 'export' | null

export default function WAGroupsPage() {
  const devices = useIpcQuery('device:list')
  const [deviceFilter, setDeviceFilter] = useState('')
  const groups = useIpcQuery('group:list', deviceFilter ? { deviceId: deviceFilter } : {})
  const toast = useToast()

  const [tab, setTab] = useState<Tab>('groups')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [managing, setManaging] = useState<GroupRow>()

  useIpcEvent('groupJob:progress', ({ status }) => {
    if (status === 'completed') {
      groups.refetch()
      toast('success', 'Group job finished')
    }
  })

  const list = groups.data ?? []
  // The list is briefly empty while it refetches; fall back to the row the
  // dialog opened with so a settings change does not close it.
  const managed = managing
    ? (list.find((g) => g.id === managing.id) ?? managing)
    : undefined

  async function sync() {
    setBusy(true)
    const result = await window.api.invoke(
      'group:sync',
      deviceFilter ? { deviceId: deviceFilter } : {},
    )
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    toast('success', `Synced ${result.data.synced} group(s)`)
    groups.refetch()
  }

  return (
    <>
      <PageHeader
        title="WhatsApp Groups"
        description="Sync, manage and message your groups and communities, or create groups in bulk."
        actions={
          <>
            <Button onClick={() => void sync()} disabled={busy} data-testid="sync-groups">
              Sync
            </Button>
            <Button onClick={() => setDialog('join')} data-testid="join-group">
              Join via link
            </Button>
            <Button
              onClick={() => setDialog('export')}
              disabled={selected.length === 0}
              title={selected.length === 0 ? 'Select groups first' : undefined}
              data-testid="export-members"
            >
              Export members
            </Button>
            <Button
              variant="primary"
              onClick={() => setDialog('create')}
              data-testid="bulk-create-groups"
            >
              + Create Bulk
            </Button>
          </>
        }
      />

      <div className="flex gap-1 border-b border-line px-6" role="tablist">
        {(['groups', 'communities'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            data-testid={`groups-tab-${value}`}
            onClick={() => setTab(value)}
            className={cn(
              'px-3 py-2 text-sm',
              tab === value
                ? 'border-b-2 border-primary font-medium text-ink'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {value === 'groups' ? 'Groups' : 'Communities'}
          </button>
        ))}
      </div>

      {tab === 'groups' ? (
        <GroupsTab
          list={list}
          devices={devices.data ?? []}
          deviceFilter={deviceFilter}
          onDeviceFilter={(id) => {
            setDeviceFilter(id)
            setSelected([])
          }}
          selected={selected}
          onSelected={setSelected}
          onManage={setManaging}
        />
      ) : (
        <CommunitiesTab deviceFilter={deviceFilter} onChanged={groups.refetch} />
      )}

      {list.length === 0 && (devices.data ?? []).length === 0 && (
        <EmptyState
          icon={Users}
          title="No devices connected."
          description="Link a WhatsApp account first, then sync its groups."
        />
      )}

      {dialog === 'create' && (
        <BulkCreateGroupsDialog
          onClose={() => setDialog(null)}
          onStarted={() => toast('success', 'Creating groups…')}
        />
      )}
      {dialog === 'join' && (
        <JoinGroupDialog
          onClose={() => setDialog(null)}
          onJoined={() => {
            toast('success', 'Joined the group')
            groups.refetch()
          }}
        />
      )}
      {dialog === 'export' && (
        <ExportMembersDialog
          groups={list.filter((g) => selected.includes(g.id))}
          onClose={() => setDialog(null)}
        />
      )}
      {managed && (
        <ManageGroupDialog
          group={managed}
          onClose={() => setManaging(undefined)}
          onChanged={groups.refetch}
        />
      )}
    </>
  )
}
