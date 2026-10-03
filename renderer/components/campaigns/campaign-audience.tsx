'use client'

import { FieldHelp } from '@renderer/components/help/field-help'
import type { QueryState } from '@renderer/hooks/useIpc'
import type { IpcResponse } from '@shared/ipc'

export type Tag = IpcResponse<'tag:list'>[number]

export interface TagAudience {
  includeTagIds: string[]
  excludeTagIds: string[]
}

/**
 * Tag half of a campaign's audience: lists ∪ included tags − excluded tags.
 *
 * WHY one tag cannot sit in both columns: the server rejects it, and letting
 * the user build that state only to be told off on submit is worse than
 * moving the tag across when the other box is ticked.
 */
export function CampaignAudienceTags({
  tags,
  value,
  onChange,
}: {
  tags: QueryState<Tag[]>
  value: TagAudience
  onChange: (next: TagAudience) => void
}) {
  const list = tags.data ?? []

  function toggle(mode: 'include' | 'exclude', id: string) {
    const own = mode === 'include' ? value.includeTagIds : value.excludeTagIds
    const other = mode === 'include' ? value.excludeTagIds : value.includeTagIds
    const nextOwn = own.includes(id) ? own.filter((t) => t !== id) : [...own, id]
    const nextOther = other.filter((t) => t !== id)
    onChange(
      mode === 'include'
        ? { includeTagIds: nextOwn, excludeTagIds: nextOther }
        : { includeTagIds: nextOther, excludeTagIds: nextOwn },
    )
  }

  // NOTE: an unavailable tag service degrades to "lists only" rather than
  // blocking the dialog — a campaign to a plain list must always be possible.
  const notice = tags.error
    ? 'Tags could not be loaded, so only contact lists can be used right now.'
    : !tags.loading && list.length === 0
      ? 'No tags yet. Tag contacts on the Contacts screen to target them here.'
      : null

  return (
    <div className="grid grid-cols-2 gap-3" data-testid="cmp-tags">
      <TagColumn
        legend="Include contacts tagged"
        mode="include"
        tags={list}
        selected={value.includeTagIds}
        onToggle={(id) => toggle('include', id)}
      />
      <TagColumn
        legend="Exclude contacts tagged"
        mode="exclude"
        tags={list}
        selected={value.excludeTagIds}
        onToggle={(id) => toggle('exclude', id)}
      />
      {notice && (
        <p
          className="col-span-2 text-xs text-ink-subtle"
          data-testid={tags.error ? 'cmp-tags-unavailable' : 'cmp-tags-empty'}
        >
          {notice}
        </p>
      )}
    </div>
  )
}

function TagColumn({
  legend,
  mode,
  tags,
  selected,
  onToggle,
}: {
  legend: string
  mode: 'include' | 'exclude'
  tags: Tag[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="flex items-center gap-1 text-xs font-semibold text-ink">
        {legend}
        <FieldHelp id="campaign-tags" />
      </legend>
      <div className="max-h-24 min-h-9 overflow-y-auto rounded-control border border-line p-2">
        {tags.map((tag) => (
          <label key={tag.id} className="flex items-center gap-2 py-0.5 text-sm">
            <input
              type="checkbox"
              data-testid={`cmp-${mode}-tag-${tag.id}`}
              checked={selected.includes(tag.id)}
              onChange={() => onToggle(tag.id)}
            />
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: tag.color }}
              aria-hidden
            />
            <span className="truncate">
              {tag.name} <span className="text-ink-subtle">({tag.contactCount})</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
