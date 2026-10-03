'use client'

import { useCallback, useEffect, useState } from 'react'
import type { IpcResponse } from '@shared/ipc'
import { OptOutConfig } from '@renderer/components/contacts/optout-config'
import { OptOutImport } from '@renderer/components/contacts/optout-import'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { useIpcEvent } from '@renderer/hooks/useIpc'
import { displayPhone } from '@shared/phone-display'

type Suppression = IpcResponse<'suppression:list'>['items'][number]

const PAGE_SIZE = 100

const SOURCE_LABELS: Record<Suppression['source'], string> = {
  manual: 'Added by hand',
  stop_keyword: 'Replied STOP',
  import: 'Imported',
}

const INPUT =
  'rounded-control border border-line px-2.5 py-1.5 text-sm outline-none focus:border-primary'

/**
 * The opt-out list: numbers no campaign, sequence or bot will message.
 *
 * Paged with a "load more" rather than virtualized: it is reviewed, searched
 * and edited a few rows at a time, not scrolled end to end.
 */
export function OptOutPanel() {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<Suppression[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [adding, setAdding] = useState('')
  const [reason, setReason] = useState('')

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    void window.api
      .invoke('suppression:list', { search: search || undefined, limit: PAGE_SIZE })
      .then((result) => {
        if (cancelled || !result.ok) return
        setItems(result.data.items)
        setCursor(result.data.nextCursor)
        setTotal(result.data.total)
      })
    return () => {
      cancelled = true
    }
  }, [search, reloadKey])

  // A STOP reply lands while this screen is open; the event says so.
  useIpcEvent('chat:updated', reload)

  async function loadMore() {
    if (!cursor) return
    const result = await window.api.invoke('suppression:list', {
      search: search || undefined,
      cursor,
      limit: PAGE_SIZE,
    })
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    setItems((current) => [...current, ...result.data.items])
    setCursor(result.data.nextCursor)
  }

  async function add() {
    const phones = adding
      .split(/[\s,;]+/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 3)
    if (phones.length === 0) {
      toast(
        'error',
        'Enter at least one number with its country code, e.g. +919876543210.',
      )
      return
    }
    const result = await window.api.invoke('suppression:add', {
      phones,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    })
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    const { added, invalid } = result.data
    toast(
      invalid > 0 ? 'warning' : 'success',
      `Added ${added}.` +
        (invalid > 0 ? ` ${invalid} skipped — numbers need their country code.` : ''),
    )
    setAdding('')
    setReason('')
    reload()
  }

  async function remove(phone: string) {
    const result = await window.api.invoke('suppression:remove', { phones: [phone] })
    if (!result.ok) toast('error', result.error.userMessage)
    reload()
  }

  async function exportList() {
    const result = await window.api.invoke('suppression:export')
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    toast('success', `Exported ${result.data.rows} opt-outs`)
    await window.api.invoke('system:openPath', { path: result.data.filePath })
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4"
      data-testid="optout-panel"
    >
      <section className="flex flex-wrap items-end gap-2 rounded-card border border-line bg-surface p-4">
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <label htmlFor="optout-add-input" className="text-xs font-semibold text-ink">
            Add numbers (with country code)
          </label>
          <input
            id="optout-add-input"
            data-testid="optout-add-input"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            placeholder="+919876543210, +14155550123"
            className={INPUT}
          />
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          aria-label="Reason"
          maxLength={200}
          data-testid="optout-add-reason"
          className={`${INPUT} w-48`}
        />
        <Button variant="primary" onClick={() => void add()} data-testid="optout-add">
          Add to opt-outs
        </Button>
      </section>

      <OptOutImport onImported={reload} onExport={() => void exportList()} />

      <section className="flex min-h-64 flex-col rounded-card border border-line bg-surface">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search opt-outs..."
            data-testid="optout-search"
            className={`${INPUT} w-56`}
          />
          <span className="text-xs text-ink-muted" data-testid="optout-total">
            {total.toLocaleString()} number{total === 1 ? '' : 's'} opted out
          </span>
        </div>
        {items.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted" data-testid="optout-empty">
            {search ? 'No opt-outs match that search.' : 'Nobody has opted out yet.'}
          </p>
        ) : (
          <ul>
            {items.map((row) => (
              <li
                key={row.phone}
                data-testid="optout-row"
                data-phone={row.phone}
                className="flex items-center gap-3 border-b border-line px-4 py-1.5 text-sm"
              >
                <span className="w-40 shrink-0 font-mono text-xs text-ink">
                  {displayPhone(row.phone)}
                </span>
                <span className="w-32 shrink-0 text-xs text-ink-muted">
                  {SOURCE_LABELS[row.source]}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
                  {row.reason ?? ''}
                </span>
                <span className="w-24 shrink-0 text-xs text-ink-subtle">
                  {new Date(row.createdAt).toLocaleDateString()}
                </span>
                <Button
                  size="sm"
                  onClick={() => void remove(row.phone)}
                  data-testid="optout-remove"
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {cursor && (
          <div className="p-2 text-center">
            <Button size="sm" onClick={() => void loadMore()} data-testid="optout-more">
              Load more
            </Button>
          </div>
        )}
      </section>

      <OptOutConfig />
    </div>
  )
}
