'use client'

import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { inputClass, type GroupRow } from './shared'

/** Show, copy and reset a group's invite link. */
export function GroupInvitePanel({ group }: { group: GroupRow }) {
  const toast = useToast()
  const [url, setUrl] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function load() {
    setBusy(true)
    const result = await window.api.invoke('group:inviteLink', { groupId: group.id })
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    setUrl(result.data.url)
  }

  async function revoke() {
    setConfirming(false)
    setBusy(true)
    const result = await window.api.invoke('group:revokeInvite', { groupId: group.id })
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    setUrl(result.data.url)
    toast('success', 'Invite link reset. The old link no longer works.')
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast('success', 'Invite link copied')
    } catch (err) {
      // Clipboard access can be refused by the OS; the link stays selectable.
      console.warn('clipboard write refused', err)
      toast('warning', 'Could not copy — select the link and copy it manually.')
    }
  }

  const disabled = !group.isAdmin || busy

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-muted">
        Anyone with the link can join (or request to join, when join approval is on).
      </p>

      {url ? (
        <div className="flex gap-2">
          <input
            readOnly
            value={url}
            data-testid="invite-url"
            aria-label="Invite link"
            className={`${inputClass} min-w-0 flex-1`}
            onFocus={(e) => e.target.select()}
          />
          <Button onClick={() => void copy(url)} data-testid="copy-invite">
            Copy
          </Button>
        </div>
      ) : (
        <Button
          className="self-start"
          onClick={() => void load()}
          disabled={disabled}
          data-testid="show-invite"
        >
          {busy ? 'Loading…' : 'Show invite link'}
        </Button>
      )}

      {confirming ? (
        <div className="flex items-center gap-2 rounded-card bg-status-warn-bg px-3 py-2">
          <span className="flex-1 text-xs text-status-warn-fg">
            Reset the link? Everyone holding the current link loses access to it.
          </span>
          <Button size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => void revoke()}
            data-testid="confirm-revoke"
          >
            Reset link
          </Button>
        </div>
      ) : (
        <Button
          variant="danger"
          className="self-start"
          onClick={() => setConfirming(true)}
          disabled={disabled}
          data-testid="revoke-invite"
        >
          Reset invite link
        </Button>
      )}
    </div>
  )
}
