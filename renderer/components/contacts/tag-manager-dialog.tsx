'use client'

import { useState } from 'react'
import type { IpcResponse } from '@shared/ipc'
import { TagChip } from '@renderer/components/contacts/badges'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'

type Tag = IpcResponse<'tag:list'>[number]

const INPUT =
  'rounded-control border border-line px-2.5 py-1.5 text-sm outline-none focus:border-primary'

/** One editable row; keeps its own draft so typing does not hit IPC per key. */
function TagRow({ tag, onChanged }: { tag: Tag; onChanged: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState(tag.color)
  const dirty = name.trim() !== tag.name || color !== tag.color

  async function save() {
    const result = await window.api.invoke('tag:update', {
      id: tag.id,
      ...(name.trim() !== tag.name ? { name: name.trim() } : {}),
      ...(color !== tag.color ? { color } : {}),
    })
    if (!result.ok) toast('error', result.error.userMessage)
    onChanged()
  }

  async function remove() {
    const result = await window.api.invoke('tag:delete', { id: tag.id })
    if (!result.ok) toast('error', result.error.userMessage)
    onChanged()
  }

  return (
    <li
      className="flex items-center gap-2 border-b border-line py-1.5"
      data-testid="tag-row"
      data-tag={tag.name}
    >
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        aria-label={`Colour of ${tag.name}`}
        data-testid="tag-row-color"
        className="h-7 w-8 shrink-0 cursor-pointer rounded border border-line"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={`Name of ${tag.name}`}
        data-testid="tag-row-name"
        maxLength={40}
        className={`${INPUT} min-w-0 flex-1`}
      />
      <span className="w-20 shrink-0 text-right text-xs text-ink-muted">
        {tag.contactCount.toLocaleString()} contact{tag.contactCount === 1 ? '' : 's'}
      </span>
      <Button
        size="sm"
        onClick={() => void save()}
        disabled={!dirty || name.trim() === ''}
        data-testid="tag-row-save"
      >
        Save
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={() => void remove()}
        data-testid="tag-row-delete"
      >
        Delete
      </Button>
    </li>
  )
}

/** Create, rename, recolour and delete tags. */
export function TagManagerDialog({
  tags,
  onChanged,
  onClose,
}: {
  tags: Tag[]
  onChanged: () => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#0078d4')
  const [error, setError] = useState<string>()

  async function create() {
    setError(undefined)
    if (name.trim() === '') {
      setError('Give the tag a name.')
      return
    }
    const result = await window.api.invoke('tag:create', { name: name.trim(), color })
    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }
    setName('')
    onChanged()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Manage tags"
      testId="tag-manager"
      width={560}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          aria-label="New tag colour"
          data-testid="new-tag-color"
          className="h-8 w-9 shrink-0 cursor-pointer rounded border border-line"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void create()
          }}
          placeholder="New tag, e.g. VIP"
          maxLength={40}
          data-testid="new-tag-name"
          className={`${INPUT} min-w-0 flex-1`}
        />
        <Button
          variant="primary"
          onClick={() => void create()}
          data-testid="new-tag-create"
        >
          Add tag
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-danger" role="alert" data-testid="tag-error">
          {error}
        </p>
      )}

      {tags.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          No tags yet. Tags group contacts across lists — for example{' '}
          <TagChip name="VIP" color="#d83b01" testId="tag-example" />.
        </p>
      ) : (
        <ul className="mt-3 max-h-80 overflow-y-auto" data-testid="tag-rows">
          {tags.map((tag) => (
            // Keyed on name and colour too, so a saved rename resets the draft.
            <TagRow
              key={`${tag.id}|${tag.name}|${tag.color}`}
              tag={tag}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </Dialog>
  )
}
