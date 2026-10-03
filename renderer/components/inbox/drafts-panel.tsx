'use client'

import { Bot } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { useIpcEvent, useIpcQuery } from '@renderer/hooks/useIpc'

/**
 * AI replies for the open chat that did not go straight out: waiting for a
 * person's approval, or held by quiet hours. Approving sends it as the user's
 * own reply; discarding drops it.
 */
export function DraftsPanel({ chatId }: { chatId: string }) {
  const drafts = useIpcQuery('aiDraft:list', { chatId })
  const toast = useToast()
  const [editing, setEditing] = useState<{ id: string; text: string }>()
  const [busyId, setBusyId] = useState<string>()

  useIpcEvent('chat:updated', (payload) => {
    if (payload.chatId === chatId) drafts.refetch()
  })

  async function approve(id: string, text?: string) {
    setBusyId(id)
    const result = await window.api.invoke('aiDraft:approve', {
      id,
      ...(text !== undefined ? { text } : {}),
    })
    setBusyId(undefined)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    setEditing(undefined)
    toast('success', 'Reply sent')
    drafts.refetch()
  }

  async function discard(id: string) {
    setBusyId(id)
    const result = await window.api.invoke('aiDraft:discard', { id })
    setBusyId(undefined)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    drafts.refetch()
  }

  const items = drafts.data ?? []
  if (items.length === 0) return null

  return (
    <div
      className="flex flex-col gap-2 border-b border-line bg-app-bg px-4 py-2.5"
      data-testid="drafts-panel"
    >
      {items.map((d) => {
        const isEditing = editing?.id === d.id
        const busy = busyId === d.id
        return (
          <div
            key={d.id}
            data-testid="ai-draft"
            data-status={d.status}
            className="rounded-card border border-line bg-surface p-2.5"
          >
            <p className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
              <Bot className="size-3.5" aria-hidden />
              {d.status === 'held'
                ? `AI reply held${d.reason ? ` (${d.reason})` : ''} — it sends automatically when sending resumes`
                : 'AI reply waiting for your approval'}
            </p>
            {isEditing ? (
              <textarea
                data-testid="draft-edit-text"
                value={editing.text}
                onChange={(e) => setEditing({ id: d.id, text: e.target.value })}
                className="min-h-16 w-full resize-y rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary"
              />
            ) : (
              <p
                className="whitespace-pre-wrap text-sm text-ink"
                data-testid="draft-text"
              >
                {d.text}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              {isEditing ? (
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy || editing.text.trim() === ''}
                    onClick={() => void approve(d.id, editing.text.trim())}
                    data-testid="draft-save-approve"
                  >
                    Send edited reply
                  </Button>
                  <Button size="sm" onClick={() => setEditing(undefined)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy}
                    onClick={() => void approve(d.id)}
                    data-testid="draft-approve"
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => setEditing({ id: d.id, text: d.text })}
                    data-testid="draft-edit"
                  >
                    Edit &amp; approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void discard(d.id)}
                    data-testid="draft-discard"
                  >
                    Discard
                  </Button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
