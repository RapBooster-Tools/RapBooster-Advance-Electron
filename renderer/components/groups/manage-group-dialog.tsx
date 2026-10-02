'use client'

import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/cn'
import { GroupInvitePanel } from './group-invite-panel'
import { GroupMembersPanel } from './group-members-panel'
import { GroupRequestsPanel } from './group-requests-panel'
import { GroupSettingsPanel } from './group-settings-panel'
import { NOT_ADMIN_REASON, type GroupRow } from './shared'

type Tab = 'invite' | 'settings' | 'members' | 'requests'

const TAB_LABEL: Record<Tab, string> = {
  invite: 'Invite link',
  settings: 'Settings',
  members: 'Members',
  requests: 'Join requests',
}

/** Per-group admin tools (D89). */
export function ManageGroupDialog({
  group,
  onClose,
  onChanged,
}: {
  group: GroupRow
  onClose: () => void
  /** The group's cached row changed (settings or member count). */
  onChanged: () => void
}) {
  const [tab, setTab] = useState<Tab>(group.isAdmin ? 'invite' : 'members')

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Manage: ${group.name}`}
      testId="manage-group-dialog"
      width={620}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {!group.isAdmin && (
        <p
          className="mb-3 rounded-card bg-status-warn-bg px-3 py-2 text-xs text-status-warn-fg"
          data-testid="not-admin-reason"
        >
          {NOT_ADMIN_REASON}
        </p>
      )}

      <div className="mb-3 flex gap-1 border-b border-line" role="tablist">
        {(Object.keys(TAB_LABEL) as Tab[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            data-testid={`manage-tab-${value}`}
            onClick={() => setTab(value)}
            className={cn(
              'px-3 py-1.5 text-sm',
              tab === value
                ? 'border-b-2 border-primary font-medium text-ink'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {TAB_LABEL[value]}
          </button>
        ))}
      </div>

      {tab === 'invite' && <GroupInvitePanel group={group} />}
      {tab === 'settings' && <GroupSettingsPanel group={group} onChanged={onChanged} />}
      {tab === 'members' && <GroupMembersPanel group={group} onChanged={onChanged} />}
      {tab === 'requests' && <GroupRequestsPanel group={group} onChanged={onChanged} />}
    </Dialog>
  )
}
