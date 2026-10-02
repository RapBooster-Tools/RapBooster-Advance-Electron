'use client'

import { useState } from 'react'
import type { TagInfo } from '@renderer/components/contacts/contact-table'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'

const MAX_IDS_PER_REQUEST = 10_000

/** Tag or untag the selected contacts. */
export function BulkTagBar({
  selected,
  tags,
  onDone,
  onClear,
}: {
  selected: string[]
  tags: TagInfo[]
  onDone: () => void
  onClear: () => void
}) {
  const toast = useToast()
  const [tagId, setTagId] = useState('')
  const chosen = tags.find((t) => t.id === tagId) ?? tags[0]

  async function apply(add: boolean) {
    if (!chosen) {
      toast('error', 'Create a tag first with Manage tags.')
      return
    }
    let count = 0
    // The contract caps one request at 10,000 ids; a select-all on a large list
    // can exceed that, so it goes in slices.
    for (let i = 0; i < selected.length; i += MAX_IDS_PER_REQUEST) {
      const contactIds = selected.slice(i, i + MAX_IDS_PER_REQUEST)
      const result = add
        ? await window.api.invoke('tag:assign', { tagId: chosen.id, contactIds })
        : await window.api.invoke('tag:unassign', { tagId: chosen.id, contactIds })
      if (!result.ok) {
        toast('error', result.error.userMessage)
        onDone()
        return
      }
      count += 'assigned' in result.data ? result.data.assigned : result.data.removed
    }
    toast(
      'success',
      add
        ? `Tagged ${count} contact${count === 1 ? '' : 's'} "${chosen.name}"`
        : `Removed "${chosen.name}" from ${count} contact${count === 1 ? '' : 's'}`,
    )
    onDone()
  }

  return (
    <div
      className="mx-6 mb-2 flex flex-wrap items-center gap-2 rounded-card border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm"
      data-testid="bulk-tag-bar"
    >
      <span className="text-ink" data-testid="selected-count">
        {selected.length.toLocaleString()} selected
      </span>
      <select
        value={chosen?.id ?? ''}
        onChange={(e) => setTagId(e.target.value)}
        aria-label="Tag"
        data-testid="bulk-tag-select"
        className="rounded-control border border-line px-2 py-1 text-sm outline-none focus:border-primary"
      >
        {tags.length === 0 && <option value="">No tags yet</option>}
        {tags.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="primary"
        onClick={() => void apply(true)}
        data-testid="bulk-tag-apply"
      >
        Tag selected
      </Button>
      <Button size="sm" onClick={() => void apply(false)} data-testid="bulk-tag-remove">
        Remove tag
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear} data-testid="bulk-clear">
        Clear selection
      </Button>
    </div>
  )
}
