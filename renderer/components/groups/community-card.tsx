'use client'

import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { inputClass, splitPhones, type CommunityRow, type GroupRow } from './shared'

/** One community: its linked groups, linking, and creating a group inside it. */
export function CommunityCard({
  community,
  deviceName,
  groups,
  onChanged,
}: {
  community: CommunityRow
  deviceName: string
  /** Groups on the community's device. */
  groups: GroupRow[]
  onChanged: () => void
}) {
  const toast = useToast()
  const [linkId, setLinkId] = useState('')
  const [groupName, setGroupName] = useState('')
  const [phonesText, setPhonesText] = useState('')
  const [busy, setBusy] = useState(false)

  const linked = new Set(community.linkedGroupIds)
  const linkable = groups.filter((g) => !linked.has(g.id))
  const nameOf = (id: string) => groups.find((g) => g.id === id)?.name ?? id

  async function invoke(
    work: () => Promise<{ ok: true } | { ok: false; error: { userMessage: string } }>,
    success: string,
  ) {
    setBusy(true)
    const result = await work()
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return false
    }
    toast('success', success)
    onChanged()
    return true
  }

  async function createGroup() {
    if (groupName.trim() === '') {
      toast('error', 'Enter a group name.')
      return
    }
    const { valid, invalid } = splitPhones(phonesText)
    if (invalid.length > 0) {
      toast('error', `Not in international format: ${invalid.slice(0, 3).join(', ')}`)
      return
    }
    const ok = await invoke(
      () =>
        window.api.invoke('community:createGroup', {
          communityId: community.id,
          name: groupName.trim(),
          phones: valid,
        }),
      `Group "${groupName.trim()}" created in ${community.name}`,
    )
    if (ok) {
      setGroupName('')
      setPhonesText('')
    }
  }

  return (
    <section
      className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3"
      data-testid="community-card"
      aria-label={community.name}
    >
      <div>
        <h3 className="text-sm font-semibold text-ink" data-testid="community-title">
          {community.name}
        </h3>
        <p className="text-xs text-ink-muted">
          {deviceName} · {community.linkedGroupIds.length} linked group(s)
        </p>
      </div>

      <ul className="flex flex-col gap-1">
        {community.linkedGroupIds.map((id) => (
          <li
            key={id}
            data-testid="community-linked-group"
            className="flex items-center gap-2 rounded-control bg-app-bg px-2.5 py-1 text-sm"
          >
            <span className="flex-1 truncate">{nameOf(id)}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              data-testid="unlink-group"
              onClick={() =>
                void invoke(
                  () =>
                    window.api.invoke('community:unlinkGroup', {
                      communityId: community.id,
                      groupId: id,
                    }),
                  `Unlinked ${nameOf(id)}`,
                )
              }
            >
              Unlink
            </Button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <select
          aria-label="Group to link"
          data-testid="link-group-select"
          value={linkId}
          onChange={(e) => setLinkId(e.target.value)}
          className={`${inputClass} min-w-0 flex-1 py-1.5`}
        >
          <option value="">-- Link an existing group --</option>
          {linkable.map((g) => (
            <option key={g.id} value={g.id} disabled={!g.isAdmin}>
              {g.name}
              {g.isAdmin ? '' : ' (not admin — cannot link)'}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          className="h-auto"
          disabled={busy || linkId === ''}
          data-testid="link-group"
          onClick={() =>
            void invoke(
              () =>
                window.api.invoke('community:linkGroup', {
                  communityId: community.id,
                  groupId: linkId,
                }),
              `Linked ${nameOf(linkId)}`,
            ).then((ok) => ok && setLinkId(''))
          }
        >
          Link
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-2">
        <input
          aria-label="New group name"
          data-testid="community-group-name"
          value={groupName}
          maxLength={100}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="New group in this community"
          className={`${inputClass} py-1.5`}
        />
        <textarea
          aria-label="Starting members"
          data-testid="community-group-phones"
          rows={2}
          value={phonesText}
          onChange={(e) => setPhonesText(e.target.value)}
          placeholder="Starting members (optional), e.g. +919876543210"
          className={inputClass}
        />
        <Button
          size="sm"
          className="self-start"
          disabled={busy}
          data-testid="create-community-group"
          onClick={() => void createGroup()}
        >
          Create group
        </Button>
      </div>
    </section>
  )
}
