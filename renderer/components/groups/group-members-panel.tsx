'use client'

import { useMemo, useState } from 'react'
import type { GroupMemberAction } from '@shared/types'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import { inputClass, splitPhones, type GroupRow } from './shared'
import { displayPhone } from '@shared/phone-display'

/** Rendering thousands of rows in a dialog is pointless; search narrows it. */
const VISIBLE_MEMBERS = 200

interface Outcome {
  phone: string
  ok: boolean
  error: string | null
}

/** Members list with promote/demote/remove, and adding by phone or list. */
export function GroupMembersPanel({
  group,
  onChanged,
}: {
  group: GroupRow
  onChanged: () => void
}) {
  const toast = useToast()
  const members = useIpcQuery('group:members', { groupId: group.id })
  const lists = useIpcQuery('contactList:list')

  const [search, setSearch] = useState('')
  const [source, setSource] = useState<'phones' | 'list'>('phones')
  const [phonesText, setPhonesText] = useState('')
  const [listId, setListId] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcomes, setOutcomes] = useState<Outcome[]>([])

  const visible = useMemo(() => {
    const needle = search.replace(/\D/g, '')
    const all = members.data ?? []
    return (needle ? all.filter((m) => m.phone.includes(needle)) : all).slice(
      0,
      VISIBLE_MEMBERS,
    )
  }, [members.data, search])

  async function run(action: GroupMemberAction, phones: string[], fromList?: string) {
    setBusy(true)
    const result = await window.api.invoke('group:updateMembers', {
      groupId: group.id,
      action,
      phones,
      ...(fromList ? { listId: fromList } : {}),
    })
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return null
    }
    members.refetch()
    onChanged()
    return result.data.results
  }

  async function add() {
    if (source === 'list') {
      if (listId === '') {
        toast('error', 'Choose a contact list.')
        return
      }
      const results = await run('add', [], listId)
      if (results) setOutcomes(results)
      return
    }
    const { valid, invalid } = splitPhones(phonesText)
    const rejected = invalid.map((phone) => ({
      phone,
      ok: false,
      error: 'Use international format, e.g. +919876543210',
    }))
    if (valid.length === 0) {
      setOutcomes(rejected)
      if (rejected.length === 0) toast('error', 'Enter at least one phone number.')
      return
    }
    const results = await run('add', valid)
    if (results) setOutcomes([...rejected, ...results])
  }

  async function single(action: GroupMemberAction, phone: string) {
    const results = await run(action, [phone])
    const outcome = results?.[0]
    if (outcome && !outcome.ok) toast('error', `${phone}: ${outcome.error ?? 'refused'}`)
  }

  const added = outcomes.filter((o) => o.ok).length

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2" aria-label="Add members">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-xs font-semibold text-ink">Add members from</span>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="member-source"
              checked={source === 'phones'}
              onChange={() => setSource('phones')}
              data-testid="member-source-phones"
            />
            Phone numbers
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="member-source"
              checked={source === 'list'}
              onChange={() => setSource('list')}
              data-testid="member-source-list"
            />
            A contact list
          </label>
        </div>

        {source === 'phones' ? (
          <textarea
            rows={3}
            data-testid="member-phones"
            aria-label="Phone numbers to add"
            value={phonesText}
            disabled={!group.isAdmin}
            onChange={(e) => setPhonesText(e.target.value)}
            placeholder={'+919876543210\n+447700900123'}
            className={inputClass}
          />
        ) : (
          <select
            data-testid="member-list"
            aria-label="Contact list"
            value={listId}
            disabled={!group.isAdmin}
            onChange={(e) => setListId(e.target.value)}
            className={inputClass}
          >
            <option value="">-- Choose list --</option>
            {(lists.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.contactCount})
              </option>
            ))}
          </select>
        )}

        <Button
          variant="primary"
          className="self-start"
          onClick={() => void add()}
          disabled={!group.isAdmin || busy}
          data-testid="add-members"
        >
          {busy ? 'Working…' : 'Add to group'}
        </Button>

        {outcomes.length > 0 && (
          <div
            className="rounded-card border border-line p-2"
            data-testid="member-results"
          >
            <p className="mb-1 text-xs font-semibold text-ink">
              {added} added, {outcomes.length - added} not added
            </p>
            <ul className="max-h-32 overflow-y-auto text-xs">
              {outcomes.map((o) => (
                <li
                  key={o.phone}
                  data-testid="member-result"
                  data-ok={o.ok}
                  className={o.ok ? 'text-status-ok-fg' : 'text-danger'}
                >
                  {o.phone} — {o.ok ? 'added' : (o.error ?? 'not added')}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-label="Members">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-ink" data-testid="member-count">
            {members.loading
              ? 'Loading members…'
              : `${members.data?.length ?? 0} members`}
          </h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search number"
            aria-label="Search members"
            className={`${inputClass} w-44 py-1`}
          />
        </div>
        {members.error && (
          <p className="text-xs text-danger">{members.error.userMessage}</p>
        )}
        <ul className="max-h-60 overflow-y-auto rounded-card border border-line">
          {visible.map((m) => (
            <li
              key={m.jid}
              data-testid="member-row"
              className="flex items-center gap-2 border-b border-line px-2.5 py-1.5 text-sm last:border-b-0"
            >
              <span className="flex-1 truncate">{displayPhone(m.phone)}</span>
              {m.isAdmin && <span className="text-xs text-ink-muted">admin</span>}
              <Button
                size="sm"
                variant="ghost"
                disabled={!group.isAdmin || busy}
                onClick={() => void single(m.isAdmin ? 'demote' : 'promote', m.phone)}
                data-testid={m.isAdmin ? 'demote-member' : 'promote-member'}
              >
                {m.isAdmin ? 'Demote' : 'Make admin'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!group.isAdmin || busy}
                onClick={() => void single('remove', m.phone)}
                data-testid="remove-member"
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        {(members.data?.length ?? 0) > visible.length && (
          <p className="text-xs text-ink-subtle">
            Showing {visible.length} of {members.data?.length}. Search to narrow.
          </p>
        )}
      </section>
    </div>
  )
}
