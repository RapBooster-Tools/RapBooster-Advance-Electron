'use client'

import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { inputClass, type GroupRow } from './shared'

/** The member grabber: copy the selected groups' members into a new list. */
export function ExportMembersDialog({
  groups,
  onClose,
}: {
  groups: GroupRow[]
  onClose: () => void
}) {
  const [listName, setListName] = useState(
    groups.length === 1 ? `${groups[0]!.name} members` : 'Group members',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<{ imported: number; skipped: number }>()

  async function submit() {
    setError(undefined)
    if (listName.trim() === '') {
      setError('A list name is required.')
      return
    }
    setBusy(true)
    const result = await window.api.invoke('group:exportMembers', {
      groupIds: groups.map((g) => g.id),
      listName: listName.trim(),
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }
    setDone({ imported: result.data.imported, skipped: result.data.skipped })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Export members to a contact list"
      testId="export-members-dialog"
      width={460}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose} data-testid="export-done">
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void submit()}
              disabled={busy}
              data-testid="submit-export"
            >
              {busy ? 'Exporting…' : 'Export'}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-ink-muted">
          {groups.length} group(s): {groups.map((g) => g.name).join(', ')}. Each number is
          added once, and this account&apos;s own number is left out.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="export-list-name" className="text-xs font-semibold text-ink">
            New list name
          </label>
          <input
            id="export-list-name"
            data-testid="export-list-name"
            value={listName}
            maxLength={100}
            disabled={busy || done !== undefined}
            onChange={(e) => setListName(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-ink-subtle">
            If the name is taken, a number is added, e.g. &quot;{listName} (2)&quot;.
          </p>
        </div>
        {done && (
          <p
            className="rounded-card bg-status-ok-bg px-3 py-2 text-xs text-status-ok-fg"
            data-testid="export-result"
          >
            Imported {done.imported} contact(s); skipped {done.skipped} (duplicates, own
            number, hidden numbers).
          </p>
        )}
        {error && (
          <p className="text-xs text-danger" role="alert" data-testid="export-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
