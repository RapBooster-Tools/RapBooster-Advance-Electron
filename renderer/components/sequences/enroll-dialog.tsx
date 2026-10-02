'use client'

import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { useIpcQuery } from '@renderer/hooks/useIpc'

/**
 * Enroll contact lists and tags into a sequence. Duplicate numbers, opted-out
 * numbers and contacts already in the sequence are skipped by main.
 */
export function EnrollDialog({
  sequenceId,
  sequenceName,
  onClose,
  onEnrolled,
}: {
  sequenceId: string
  sequenceName: string
  onClose: () => void
  onEnrolled: () => void
}) {
  const toast = useToast()
  const lists = useIpcQuery('contactList:list')
  // Tags are optional here: if the tag feature is unavailable the list section
  // still works, so a failed query hides the section instead of blocking.
  const tags = useIpcQuery('tag:list')

  const [listIds, setListIds] = useState<string[]>([])
  const [tagIds, setTagIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  function toggle(setter: (fn: (c: string[]) => string[]) => void, id: string) {
    setter((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )
  }

  async function submit() {
    setError(undefined)
    if (listIds.length === 0 && tagIds.length === 0) {
      setError('Pick at least one list or tag.')
      return
    }
    setBusy(true)
    const result = await window.api.invoke('sequence:enroll', {
      id: sequenceId,
      listIds,
      tagIds,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }
    const { enrolled, skipped } = result.data
    toast(
      'success',
      `Enrolled ${enrolled.toLocaleString()} contact(s)` +
        (skipped > 0 ? `, skipped ${skipped.toLocaleString()}` : ''),
    )
    onEnrolled()
    onClose()
  }

  const tagList = tags.data ?? []

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Enroll into “${sequenceName}”`}
      testId="enroll-dialog"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={busy}
            data-testid="enroll-submit"
          >
            Enroll
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-xs font-semibold text-ink">Contact Lists</legend>
          <div className="max-h-32 overflow-y-auto rounded-control border border-line p-2">
            {(lists.data ?? []).length === 0 && (
              <p className="text-xs text-ink-subtle">No contact lists yet.</p>
            )}
            {(lists.data ?? []).map((list) => (
              <label key={list.id} className="flex items-center gap-2 py-0.5 text-sm">
                <input
                  type="checkbox"
                  data-testid={`enroll-list-${list.id}`}
                  checked={listIds.includes(list.id)}
                  onChange={() => toggle(setListIds, list.id)}
                />
                <span className="truncate">
                  {list.name}{' '}
                  <span className="text-ink-subtle">({list.contactCount})</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {tagList.length > 0 && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs font-semibold text-ink">Tags</legend>
            <div className="max-h-32 overflow-y-auto rounded-control border border-line p-2">
              {tagList.map((tag) => (
                <label key={tag.id} className="flex items-center gap-2 py-0.5 text-sm">
                  <input
                    type="checkbox"
                    data-testid={`enroll-tag-${tag.id}`}
                    checked={tagIds.includes(tag.id)}
                    onChange={() => toggle(setTagIds, tag.id)}
                  />
                  <span
                    className="inline-block size-2.5 rounded-full"
                    style={{ backgroundColor: tag.color }}
                    aria-hidden
                  />
                  <span className="truncate">
                    {tag.name}{' '}
                    <span className="text-ink-subtle">({tag.contactCount})</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <p className="text-xs text-ink-muted">
          Each number is enrolled once. Opted-out numbers and contacts already in this
          sequence are skipped.
        </p>

        {error && (
          <p className="text-sm text-danger" role="alert" data-testid="enroll-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
