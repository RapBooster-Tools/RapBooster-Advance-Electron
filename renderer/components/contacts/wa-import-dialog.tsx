'use client'

import { Smartphone } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  WaContactsPreview,
  type WaSource,
} from '@renderer/components/contacts/wa-contacts-preview'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import { cn } from '@renderer/lib/cn'

const SOURCES: Array<{ value: WaSource; label: string; hint: string }> = [
  {
    value: 'all',
    label: 'Everyone',
    hint: 'Saved contacts and everyone you have a chat with.',
  },
  {
    value: 'addressBook',
    label: 'Saved contacts',
    hint: "Only the people saved in the phone's address book.",
  },
  {
    value: 'chats',
    label: 'Chats (incl. unsaved numbers)',
    hint: "Everyone you have a one-to-one chat with — including people who messaged you but aren't saved in your phone.",
  },
]

const INPUT =
  'rounded-control border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-primary'

function defaultListName(): string {
  return `WhatsApp contacts ${new Date().toISOString().slice(0, 10)}`
}

/**
 * Copy the numbers a linked phone already knows into a new contact list.
 *
 * Those numbers come from the phone itself: WhatsApp syncs its address book
 * and chat list when the device is linked, and the inbox adds every new chat.
 */
export function WaImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: (listId: string) => void
}) {
  const toast = useToast()
  const devices = useIpcQuery('device:list')
  const all = useMemo(() => devices.data ?? [], [devices.data])

  const [source, setSource] = useState<WaSource>('all')
  const [onlyNamed, setOnlyNamed] = useState(false)
  const [recentOnly, setRecentOnly] = useState(false)
  const [days, setDays] = useState('30')
  const [picked, setPicked] = useState<string[] | null>(null)
  const [previewId, setPreviewId] = useState('')
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [listName, setListName] = useState(defaultListName)
  const [busy, setBusy] = useState(false)

  // Every phone starts selected; `null` means "not touched yet".
  const selected = picked ?? all.map((d) => d.id)
  const previewDevice = selected.includes(previewId) ? previewId : (selected[0] ?? '')

  // The cut-off is measured from when the dialog opened: it only has to be
  // right to the day, and a ticking clock would re-query for nothing.
  const [openedAt] = useState(() => Date.now())
  const dayCount = Math.max(1, Math.min(3650, Number.parseInt(days, 10) || 30))
  const chattedSince =
    source === 'chats' && recentOnly
      ? new Date(openedAt - dayCount * 86_400_000).toISOString()
      : null

  // How many numbers each phone has for the current choice, fetched when that
  // choice changes — one count query per linked phone.
  useEffect(() => {
    let cancelled = false
    void Promise.all(
      all.map(async (d) => {
        const r = await window.api.invoke('waContacts:list', {
          deviceId: d.id,
          source,
          onlyNamed,
          limit: 1,
        })
        return [d.id, r.ok ? r.data.total : 0] as const
      }),
    ).then((entries) => {
      if (!cancelled) setCounts(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [all, source, onlyNamed])

  function toggle(id: string) {
    setPicked(
      selected.includes(id) ? selected.filter((d) => d !== id) : [...selected, id],
    )
  }

  async function runImport() {
    if (selected.length === 0) {
      toast('error', 'Tick at least one phone to import from.')
      return
    }
    if (listName.trim() === '') {
      toast('error', 'Give the new list a name.')
      return
    }
    setBusy(true)
    const result = await window.api.invoke('waContacts:export', {
      deviceIds: selected,
      source,
      onlyNamed,
      listName: listName.trim(),
      ...(chattedSince ? { chattedSince } : {}),
    })
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    const { imported, skipped } = result.data
    toast(
      'success',
      `Imported ${imported} ${imported === 1 ? 'contact' : 'contacts'} into "${listName.trim()}".` +
        (skipped > 0 ? ` ${skipped} duplicates skipped.` : ''),
    )
    onImported(result.data.listId)
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Import from WhatsApp"
      testId="wa-import-dialog"
      width={680}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void runImport()}
            disabled={busy || all.length === 0}
            data-testid="wa-import"
          >
            {busy ? 'Importing…' : 'Import into a new list'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-help="contacts-wa-import">
        <p className="text-xs text-ink-muted">
          These are the numbers your linked phones already know — their saved contacts and
          their chats — synced from the phone when it was linked, and kept up to date as
          new chats arrive.
        </p>

        {devices.data && all.length === 0 ? (
          <EmptyState
            icon={Smartphone}
            title="No phone linked yet."
            description="Link a WhatsApp number on the Devices screen first. Its contacts appear here a minute after it connects."
          />
        ) : (
          <>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-xs font-semibold text-ink">
                Who to import
              </legend>
              <div className="flex flex-wrap gap-1" role="radiogroup">
                {SOURCES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={source === s.value}
                    data-testid={`wa-source-${s.value}`}
                    onClick={() => setSource(s.value)}
                    className={cn(
                      'rounded-control px-3 py-1 text-xs',
                      source === s.value
                        ? 'bg-primary font-medium text-on-primary'
                        : 'border border-line text-ink-muted hover:bg-wa-in',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-ink-muted">
                {SOURCES.find((s) => s.value === source)?.hint}
              </p>
              {source === 'chats' && (
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={recentOnly}
                    onChange={(e) => setRecentOnly(e.target.checked)}
                    data-testid="wa-recent-only"
                  />
                  Only chats active in the last
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    disabled={!recentOnly}
                    aria-label="Number of days"
                    data-testid="wa-recent-days"
                    className={cn(INPUT, 'w-20')}
                  />
                  days
                </label>
              )}
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={onlyNamed}
                  onChange={(e) => setOnlyNamed(e.target.checked)}
                  data-testid="wa-only-named"
                />
                Only people with a name
              </label>
            </fieldset>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-xs font-semibold text-ink">
                From which phones
              </legend>
              {all.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={selected.includes(d.id)}
                    onChange={() => toggle(d.id)}
                    data-testid={`wa-device-${d.id}`}
                  />
                  <span className="truncate">{d.name}</span>
                  {d.phone && <span className="text-xs text-ink-muted">{d.phone}</span>}
                  <span
                    className="ml-auto text-xs text-ink-muted"
                    data-testid={`wa-device-count-${d.id}`}
                  >
                    {(counts[d.id] ?? 0).toLocaleString()} numbers
                  </span>
                </label>
              ))}
              <p className="text-[11px] text-ink-muted">
                A number known to more than one phone is imported once.
              </p>
            </fieldset>

            {previewDevice && (
              <section className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-ink">Preview</span>
                  {selected.length > 1 && (
                    <select
                      value={previewDevice}
                      onChange={(e) => setPreviewId(e.target.value)}
                      aria-label="Phone to preview"
                      data-testid="wa-preview-device"
                      className={cn(INPUT, 'py-1 text-xs')}
                    >
                      {all
                        .filter((d) => selected.includes(d.id))
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
                <WaContactsPreview
                  deviceId={previewDevice}
                  source={source}
                  onlyNamed={onlyNamed}
                  chattedSince={chattedSince}
                />
              </section>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="wa-list-name" className="text-xs font-semibold text-ink">
                Name of the new list
              </label>
              <input
                id="wa-list-name"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                maxLength={100}
                data-testid="wa-list-name"
                className={INPUT}
              />
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
