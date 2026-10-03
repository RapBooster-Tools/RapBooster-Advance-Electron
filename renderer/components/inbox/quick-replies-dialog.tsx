'use client'

/**
 * Manage quick replies: saved answers the team inserts by typing "/" and the
 * shortcut in the message box.
 */
import { MessageSquareText } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { useIpcQuery } from '@renderer/hooks/useIpc'

const INPUT =
  'rounded-control border border-line bg-surface px-2.5 py-2 text-sm text-ink outline-none focus:border-primary'

interface Draft {
  id?: string
  shortcut: string
  title: string
  body: string
}

const EMPTY: Draft = { shortcut: '', title: '', body: '' }

function QuickReplyForm({
  draft,
  onChange,
  error,
}: {
  draft: Draft
  onChange: (next: Draft) => void
  error: string | undefined
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="qr-form">
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink">
        Shortcut
        <span className="flex items-center gap-1">
          <span className="text-sm text-ink-muted">/</span>
          <input
            value={draft.shortcut}
            onChange={(e) =>
              onChange({
                ...draft,
                shortcut: e.target.value.toLowerCase().replace(/\s/g, '-'),
              })
            }
            maxLength={30}
            placeholder="prices"
            data-testid="qr-shortcut"
            className={`${INPUT} flex-1`}
          />
        </span>
        <span className="font-normal text-ink-subtle">
          Type “/{draft.shortcut || 'prices'}” in the message box to insert it.
        </span>
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink">
        Title
        <input
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          maxLength={80}
          placeholder="Our price list"
          data-testid="qr-title"
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink">
        Message
        <textarea
          value={draft.body}
          onChange={(e) => onChange({ ...draft, body: e.target.value })}
          maxLength={4096}
          rows={4}
          placeholder="Hi {{Name}}, here are our prices…"
          data-testid="qr-body"
          className={INPUT}
        />
        <span className="font-normal text-ink-subtle">
          {'{{Name}}'} is replaced with the customer’s name. Any column from your contact
          lists works too, such as {'{{City}}'}.
        </span>
      </label>
      {error && (
        <p className="text-xs text-danger" role="alert" data-testid="qr-error">
          {error}
        </p>
      )}
    </div>
  )
}

export function QuickRepliesDialog({ onClose }: { onClose: () => void }) {
  const list = useIpcQuery('quickReply:list')
  const toast = useToast()
  const [draft, setDraft] = useState<Draft>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState<string>()

  async function save() {
    if (!draft || busy) return
    setBusy(true)
    const input = { shortcut: draft.shortcut, title: draft.title, body: draft.body }
    const result = draft.id
      ? await window.api.invoke('quickReply:update', { id: draft.id, ...input })
      : await window.api.invoke('quickReply:create', input)
    setBusy(false)
    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }
    toast('success', draft.id ? 'Quick reply updated' : 'Quick reply saved')
    setDraft(undefined)
    setError(undefined)
    list.refetch()
  }

  async function remove(id: string) {
    const result = await window.api.invoke('quickReply:delete', { id })
    setConfirmId(undefined)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    toast('success', 'Quick reply deleted')
    list.refetch()
  }

  const items = list.data ?? []

  return (
    <Dialog
      open
      onClose={onClose}
      title="Quick replies"
      width={560}
      testId="quick-replies-dialog"
      footer={
        draft ? (
          <>
            <Button
              onClick={() => {
                setDraft(undefined)
                setError(undefined)
              }}
            >
              Back
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void save()}
              data-testid="qr-save"
            >
              Save
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button
              variant="primary"
              onClick={() => setDraft(EMPTY)}
              data-testid="qr-new"
            >
              New quick reply
            </Button>
          </>
        )
      }
    >
      {draft ? (
        <QuickReplyForm draft={draft} onChange={setDraft} error={error} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No quick replies yet"
          description="Save answers you send often — prices, opening hours, directions — then type / in any chat to insert one."
        />
      ) : (
        <ul
          className="flex flex-col divide-y divide-line"
          data-help="inbox-quick-replies"
        >
          {items.map((qr) => (
            <li
              key={qr.id}
              className="flex items-start gap-3 py-2.5"
              data-testid="qr-item"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  <span className="font-mono font-semibold">/{qr.shortcut}</span>{' '}
                  <span className="text-ink-muted">· {qr.title}</span>
                </p>
                <p className="line-clamp-2 text-xs whitespace-pre-wrap text-ink-muted">
                  {qr.body}
                </p>
                <p className="text-[10px] text-ink-subtle" data-testid="qr-use-count">
                  Used {qr.useCount} time{qr.useCount === 1 ? '' : 's'}
                </p>
              </div>
              {confirmId === qr.id ? (
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="text-xs text-ink">Delete?</span>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void remove(qr.id)}
                    data-testid="qr-confirm-delete"
                  >
                    Delete
                  </Button>
                  <Button size="sm" onClick={() => setConfirmId(undefined)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <span className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    onClick={() =>
                      setDraft({
                        id: qr.id,
                        shortcut: qr.shortcut,
                        title: qr.title,
                        body: qr.body,
                      })
                    }
                    data-testid="qr-edit"
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmId(qr.id)}
                    data-testid="qr-delete"
                  >
                    Delete
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
