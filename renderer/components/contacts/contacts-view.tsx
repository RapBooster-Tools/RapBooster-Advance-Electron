'use client'

import { useMemo, useState } from 'react'
import type { IpcResponse } from '@shared/ipc'
import type { WaNumberStatus } from '@shared/types'
import { WA_STATUS_OPTIONS } from '@renderer/components/contacts/badges'
import { BulkTagBar } from '@renderer/components/contacts/bulk-tag-bar'
import { ContactTable, type TagInfo } from '@renderer/components/contacts/contact-table'
import { ImportDialog } from '@renderer/components/contacts/import-dialog'
import { AddContactDialog } from '@renderer/components/contacts/list-dialogs'
import {
  VerifyDialog,
  VerifyProgressBar,
  type VerifyProgress,
} from '@renderer/components/contacts/verify-numbers'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { useIpcEvent } from '@renderer/hooks/useIpc'

type ContactList = IpcResponse<'contactList:list'>[number]

const FILTER =
  'rounded-control border border-line px-2 py-1.5 text-sm outline-none focus:border-primary'

/** Toolbar, filters, selection and the table for one contact list. */
export function ContactsView({
  list,
  tags,
  onChanged,
  onImportFromWhatsApp,
}: {
  list: ContactList
  tags: TagInfo[]
  /** Counts changed: lists and tags should refetch. */
  onChanged: () => void
  /** Opens the WhatsApp grabber, which always creates a new list. */
  onImportFromWhatsApp: () => void
}) {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState('')
  const [waStatus, setWaStatus] = useState<WaNumberStatus | ''>('')
  const [reloadKey, setReloadKey] = useState(0)
  const [dialog, setDialog] = useState<'add' | 'import' | 'verify'>()
  const [progress, setProgress] = useState<Record<string, VerifyProgress>>({})

  // Selection belongs to one view of one list. Keying it on the view means a
  // filter change cannot leave invisible rows selected for a bulk action.
  const viewKey = `${list.id}|${search}|${tagId}|${waStatus}`
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({
    key: '',
    ids: new Set(),
  })
  const selected = useMemo(
    () => (selection.key === viewKey ? selection.ids : new Set<string>()),
    [selection, viewKey],
  )

  const tagMap = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])

  function reload() {
    setReloadKey((k) => k + 1)
    onChanged()
  }

  function select(ids: string[], on: boolean) {
    const next = new Set(selected)
    for (const id of ids) {
      if (on) next.add(id)
      else next.delete(id)
    }
    setSelection({ key: viewKey, ids: next })
  }

  useIpcEvent('contacts:verifyProgress', (event) => {
    setProgress((current) => ({ ...current, [event.listId]: event }))
    if (!event.done) return
    if (event.error) toast('error', event.error)
    else
      toast(
        'success',
        `Checked ${event.checked} numbers: ${event.valid} on WhatsApp, ${event.invalid} not.`,
      )
    if (event.listId === list.id) setReloadKey((k) => k + 1)
  })

  async function exportList() {
    const result = await window.api.invoke('contacts:export', {
      listId: list.id,
      search: search || undefined,
    })
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    toast('success', `Exported ${result.data.rows} contacts`)
    await window.api.invoke('system:openPath', { path: result.data.filePath })
  }

  async function remove(id: string) {
    const result = await window.api.invoke('contacts:delete', { id })
    if (!result.ok) toast('error', result.error.userMessage)
    reload()
  }

  const current = progress[list.id]

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts..."
          data-testid="contact-search"
          className="w-56 rounded-control border border-line px-2.5 py-1.5 text-sm outline-none focus:border-primary"
        />
        <select
          value={tagId}
          onChange={(e) => setTagId(e.target.value)}
          aria-label="Filter by tag"
          data-testid="tag-filter"
          className={FILTER}
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={waStatus}
          onChange={(e) => setWaStatus(e.target.value as WaNumberStatus | '')}
          aria-label="Filter by WhatsApp status"
          data-testid="wa-filter"
          className={FILTER}
        >
          <option value="">Any WhatsApp status</option>
          {WA_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={() => setDialog('add')} data-testid="add-contact">
          + Add Contact
        </Button>
        <Button
          size="sm"
          onClick={() => setDialog('import')}
          data-testid="import-contacts"
        >
          Import
        </Button>
        <Button size="sm" onClick={onImportFromWhatsApp} data-testid="import-whatsapp">
          Import from WhatsApp
        </Button>
        <Button size="sm" onClick={() => void exportList()} data-testid="export-contacts">
          Export CSV
        </Button>
        <Button
          size="sm"
          onClick={() => {
            // Forget the last run, so this run's first event is not mistaken
            // for a stale one.
            setProgress(({ [list.id]: _dropped, ...rest }) => rest)
            setDialog('verify')
          }}
          disabled={current !== undefined && !current.done}
          data-testid="verify-numbers"
        >
          Verify numbers
        </Button>
      </div>

      {current && <VerifyProgressBar progress={current} />}

      {selected.size > 0 && (
        <BulkTagBar
          selected={Array.from(selected)}
          tags={tags}
          onDone={reload}
          onClear={() => setSelection({ key: viewKey, ids: new Set() })}
        />
      )}

      <ContactTable
        listId={list.id}
        fields={list.fields}
        search={search}
        tagId={tagId || undefined}
        waStatus={waStatus || undefined}
        tags={tagMap}
        selected={selected}
        onSelect={select}
        reloadKey={reloadKey}
        onDelete={(id) => void remove(id)}
      />

      {dialog === 'add' && (
        <AddContactDialog
          listId={list.id}
          fields={list.fields}
          onAdded={reload}
          onClose={() => setDialog(undefined)}
        />
      )}

      {dialog === 'import' && (
        <ImportDialog
          listId={list.id}
          fields={list.fields}
          onClose={() => setDialog(undefined)}
          onImported={(summary) => {
            toast('success', summary)
            reload()
          }}
        />
      )}

      {dialog === 'verify' && (
        <VerifyDialog
          listId={list.id}
          listName={list.name}
          onClose={() => setDialog(undefined)}
          onStarted={(total) =>
            setProgress((cur) =>
              cur[list.id]
                ? cur
                : {
                    ...cur,
                    [list.id]: {
                      listId: list.id,
                      total,
                      checked: 0,
                      valid: 0,
                      invalid: 0,
                      done: false,
                      error: null,
                    },
                  },
            )
          }
        />
      )}
    </>
  )
}
