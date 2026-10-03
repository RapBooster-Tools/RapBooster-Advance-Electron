'use client'

import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { useIpcQuery } from '@renderer/hooks/useIpc'

/** Private notes on a conversation — seen only inside this app, never sent. */
export function ChatNotes({ chatId }: { chatId: string }) {
  const notes = useIpcQuery('chat:notes', { chatId })
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState<string>()

  async function add() {
    const body = text.trim()
    if (body === '' || busy) return
    setBusy(true)
    const result = await window.api.invoke('chat:addNote', { chatId, body })
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    setText('')
    toast('success', 'Note saved')
    notes.refetch()
  }

  async function remove(id: string) {
    const result = await window.api.invoke('chat:deleteNote', { id })
    setConfirmId(undefined)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    toast('success', 'Note deleted')
    notes.refetch()
  }

  const items = notes.data ?? []

  return (
    <section className="flex flex-col gap-2" data-testid="chat-notes">
      <h3 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
        Notes
      </h3>
      <p className="text-xs text-ink-subtle">
        Private to your team — the customer never sees these.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={4096}
        placeholder="e.g. Prefers a call after 5 pm"
        data-testid="note-input"
        className="rounded-control border border-line bg-surface px-2.5 py-2 text-sm text-ink outline-none focus:border-primary"
      />
      <Button
        size="sm"
        variant="primary"
        disabled={busy || text.trim() === ''}
        onClick={() => void add()}
        data-testid="note-add"
        className="self-end"
      >
        Add note
      </Button>
      {items.length === 0 ? (
        <p className="text-xs text-ink-subtle">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li
              key={n.id}
              className="rounded-control border border-line bg-surface px-2.5 py-2"
              data-testid="note-item"
            >
              <p className="text-sm whitespace-pre-wrap text-ink" data-testid="note-body">
                {n.body}
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-[10px] text-ink-subtle">
                  {formatDistanceToNow(new Date(n.createdAt))} ago
                </span>
                {confirmId === n.id ? (
                  <span className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void remove(n.id)}
                      data-testid="note-confirm-delete"
                    >
                      Delete
                    </Button>
                    <Button size="sm" onClick={() => setConfirmId(undefined)}>
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmId(n.id)}
                    data-testid="note-delete"
                  >
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
