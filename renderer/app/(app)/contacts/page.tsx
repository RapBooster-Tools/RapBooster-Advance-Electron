'use client'

import { Contact as ContactIcon } from 'lucide-react'
import { useState } from 'react'
import { ContactsView } from '@renderer/components/contacts/contacts-view'
import { CreateListDialog } from '@renderer/components/contacts/list-dialogs'
import { OptOutPanel } from '@renderer/components/contacts/optout-panel'
import { TagManagerDialog } from '@renderer/components/contacts/tag-manager-dialog'
import { WaImportDialog } from '@renderer/components/contacts/wa-import-dialog'
import { PageHeader } from '@renderer/components/layout/page-header'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import { cn } from '@renderer/lib/cn'

type View = 'contacts' | 'optouts'

const VIEWS: Array<[View, string]> = [
  ['contacts', 'Contacts'],
  ['optouts', 'Opt-outs'],
]

/**
 * The last value a query produced, kept while it refetches. Without it every
 * refetch would briefly empty the lists, unmounting the open list along with
 * its filters, selection and verification progress.
 */
function useLatest<T>(value: T | undefined): T | undefined {
  const [latest, setLatest] = useState(value)
  if (value !== undefined && value !== latest) setLatest(value)
  return value ?? latest
}

export default function ContactsPage() {
  const lists = useIpcQuery('contactList:list')
  const tags = useIpcQuery('tag:list')
  const listData = useLatest(lists.data)
  const tagData = useLatest(tags.data)

  const [view, setView] = useState<View>('contacts')
  const [activeId, setActiveId] = useState<string>()
  const [creatingList, setCreatingList] = useState(false)
  const [managingTags, setManagingTags] = useState(false)
  const [grabbing, setGrabbing] = useState(false)

  const all = listData ?? []
  const allTags = tagData ?? []
  // Falls back to the first list rather than storing a default, so deleting the
  // selected list cannot leave the screen pointing at nothing.
  const active = all.find((l) => l.id === activeId) ?? all[0]

  return (
    <>
      <PageHeader
        title="Contact Lists"
        description="Import, organise and export your recipients."
        actions={
          <>
            <Button onClick={() => setManagingTags(true)} data-testid="manage-tags">
              Manage tags
            </Button>
            <Button
              variant="primary"
              onClick={() => setCreatingList(true)}
              data-testid="new-list"
            >
              + New List
            </Button>
          </>
        }
      />

      <div className="flex gap-1 px-6 pt-3" role="tablist" aria-label="Contacts view">
        {VIEWS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={view === value}
            data-testid={`view-${value}`}
            onClick={() => setView(value)}
            className={cn(
              'rounded-control px-3 py-1 text-xs',
              view === value
                ? 'bg-ink font-medium text-surface'
                : 'border border-line text-ink-muted hover:bg-wa-in',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'optouts' ? (
        <OptOutPanel />
      ) : all.length === 0 ? (
        <EmptyState
          icon={ContactIcon}
          title="No contact lists yet."
          description="Create a list, then add contacts by hand or import a CSV, Excel or contact-card file or a Google Sheet — or copy the contacts and chats of a linked WhatsApp number."
          action={
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => setCreatingList(true)}>
                + New List
              </Button>
              <Button
                onClick={() => setGrabbing(true)}
                data-testid="empty-import-whatsapp"
              >
                Import from WhatsApp
              </Button>
            </div>
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex gap-1 border-b border-line px-6 pt-3" role="tablist">
            {all.map((list) => (
              <button
                key={list.id}
                type="button"
                role="tab"
                aria-selected={list.id === active?.id}
                data-testid={`list-tab-${list.name}`}
                onClick={() => setActiveId(list.id)}
                className={cn(
                  'rounded-t-control px-3 py-1.5 text-sm',
                  list.id === active?.id
                    ? 'bg-primary font-medium text-on-primary'
                    : 'text-ink-muted hover:bg-wa-in hover:text-ink',
                )}
              >
                {list.name}{' '}
                <span className="opacity-70">({list.contactCount.toLocaleString()})</span>
              </button>
            ))}
          </div>

          {active && (
            // Keyed on the list so its search, filters and selection start fresh.
            <ContactsView
              key={active.id}
              list={active}
              tags={allTags}
              onChanged={() => {
                lists.refetch()
                tags.refetch()
              }}
              onImportFromWhatsApp={() => setGrabbing(true)}
            />
          )}
        </div>
      )}

      {creatingList && (
        <CreateListDialog
          onCreated={(id) => {
            setActiveId(id)
            setView('contacts')
            lists.refetch()
          }}
          onClose={() => setCreatingList(false)}
        />
      )}

      {grabbing && (
        <WaImportDialog
          onClose={() => setGrabbing(false)}
          onImported={(id) => {
            setActiveId(id)
            setView('contacts')
            lists.refetch()
          }}
        />
      )}

      {managingTags && (
        <TagManagerDialog
          tags={allTags}
          onChanged={tags.refetch}
          onClose={() => setManagingTags(false)}
        />
      )}
    </>
  )
}
