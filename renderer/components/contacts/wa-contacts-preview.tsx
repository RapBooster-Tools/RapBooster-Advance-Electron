'use client'

import { useEffect, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import type { IpcResponse } from '@shared/ipc'

type WaContact = IpcResponse<'waContacts:list'>['items'][number]
export type WaSource = 'all' | 'addressBook' | 'chats'

const PAGE = 50

/** "Saved" and "Chat" markers, so the user sees where each number came from. */
function SourceBadges({ contact }: { contact: WaContact }) {
  return (
    <span className="flex gap-1">
      {contact.inAddressBook && (
        <span
          data-testid="wa-badge-saved"
          className="rounded-full bg-status-ok-bg px-1.5 py-px text-[11px] text-status-ok-fg"
        >
          Saved
        </span>
      )}
      {contact.hasChat && (
        <span
          data-testid="wa-badge-chat"
          className="rounded-full border border-line px-1.5 py-px text-[11px] text-ink-muted"
        >
          Chat
        </span>
      )}
    </span>
  )
}

/**
 * A searchable page-at-a-time look at one phone's numbers before importing.
 *
 * Paged ("Show more") rather than loading everything: a busy business phone
 * can know tens of thousands of numbers.
 */
export function WaContactsPreview({
  deviceId,
  source,
  onlyNamed,
  chattedSince,
}: {
  deviceId: string
  source: WaSource
  onlyNamed: boolean
  /** ISO; with `chats`, rows older than this are hidden as they would not import. */
  chattedSince: string | null
}) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<WaContact[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  // Searching on every keystroke would send a query per letter typed.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  async function loadMore(after: string) {
    setLoading(true)
    const result = await window.api.invoke('waContacts:list', {
      deviceId,
      source,
      onlyNamed,
      limit: PAGE,
      ...(query ? { search: query } : {}),
      cursor: after,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }
    setError(undefined)
    setRows((prev) => [...prev, ...result.data.items])
    setTotal(result.data.total)
    setCursor(result.data.nextCursor)
  }

  useEffect(() => {
    let cancelled = false
    void window.api
      .invoke('waContacts:list', {
        deviceId,
        source,
        onlyNamed,
        limit: PAGE,
        ...(query ? { search: query } : {}),
      })
      .then((result) => {
        if (cancelled) return
        if (!result.ok) {
          setError(result.error.userMessage)
          return
        }
        setError(undefined)
        setRows(result.data.items)
        setTotal(result.data.total)
        setCursor(result.data.nextCursor)
      })
    return () => {
      cancelled = true
    }
  }, [deviceId, source, onlyNamed, query])

  const visible =
    source === 'chats' && chattedSince
      ? rows.filter((r) => r.lastChatAt && r.lastChatAt >= chattedSince)
      : rows

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or phone number"
        aria-label="Search these contacts"
        data-testid="wa-search"
        className="rounded-control border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-primary"
      />
      <p className="text-[11px] text-ink-muted" data-testid="wa-preview-total">
        {total.toLocaleString()} {total === 1 ? 'number' : 'numbers'} on this phone
        {query ? ' match your search' : ''}.
      </p>
      <div className="max-h-56 overflow-y-auto rounded-card border border-line">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-app-bg">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-ink-muted">Name</th>
              <th className="px-2 py-1.5 text-left font-medium text-ink-muted">
                Phone number
              </th>
              <th className="px-2 py-1.5 text-left font-medium text-ink-muted">From</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr
                key={c.jid}
                className="border-t border-line"
                data-testid="wa-contact-row"
              >
                <td className="truncate px-2 py-1.5 text-ink">
                  {c.name || <span className="text-ink-subtle">No name</span>}
                </td>
                <td className="px-2 py-1.5 font-mono text-ink">{c.phone}</td>
                <td className="px-2 py-1.5">
                  <SourceBadges contact={c} />
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={3} className="px-2 py-4 text-center text-ink-muted">
                  {query ? 'Nobody matches that search.' : 'No numbers to show.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {cursor && (
        <Button
          size="sm"
          onClick={() => void loadMore(cursor)}
          disabled={loading}
          data-testid="wa-load-more"
        >
          {loading ? 'Loading…' : 'Show more'}
        </Button>
      )}
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
