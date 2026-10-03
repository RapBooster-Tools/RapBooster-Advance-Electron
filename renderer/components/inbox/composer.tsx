'use client'

/**
 * The message box under an open chat: emoji, the attach menu, "/" quick
 * replies, Send and Schedule.
 */
import { useCallback, useRef, useState, type KeyboardEvent } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import type { InboxMessage } from './inbox-types'
import {
  matchQuickReplies,
  QuickReplyPicker,
  slashQuery,
  type QuickReply,
} from './quick-reply-picker'
import { RichComposer } from './rich-composer'
import { ScheduleDialog } from './schedule-dialog'

/** The prototype's emoji set (SPRINTS.md §2.2). */
const EMOJI = ['😊', '😂', '❤️', '👍', '🎉', '🔥', '💯', '✨', '😍', '🤔', '😢', '😡']

export function Composer({
  chatId,
  onSent,
  onManageQuickReplies,
}: {
  chatId: string
  onSent: (message: InboxMessage) => void
  onManageQuickReplies: () => void
}) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [pickIndex, setPickIndex] = useState(0)
  // Esc closes the picker for exactly this text; typing on reopens it.
  const [dismissedFor, setDismissedFor] = useState<string>()

  const query = slashQuery(draft)
  const pickerOpen = query !== undefined && draft !== dismissedFor
  const replies = useIpcQuery('quickReply:list', undefined, { enabled: pickerOpen })
  const matches = pickerOpen ? matchQuickReplies(replies.data ?? [], query) : []
  const activeIndex = Math.min(pickIndex, Math.max(0, matches.length - 1))

  function edit(next: string) {
    setDraft(next)
    setPickIndex(0)
  }

  async function insert(reply: QuickReply) {
    const result = await window.api.invoke('quickReply:use', { id: reply.id, chatId })
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    // Replace the "/shortcut" being typed, keeping anything written before it.
    setDraft((current) => {
      const token = slashQuery(current)
      const head =
        token === undefined
          ? current
          : current.slice(0, current.length - token.length - 1)
      return head + result.data.text
    })
    setPickIndex(0)
    inputRef.current?.focus()
  }

  async function send() {
    const body = draft.trim()
    if (body === '') return
    setDraft('')
    const result = await window.api.invoke('chat:send', { chatId, body })
    if (!result.ok) {
      toast('error', result.error.userMessage)
      // Give the text back rather than losing what the user typed.
      setDraft(body)
      return
    }
    onSent(result.data)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (pickerOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (matches.length === 0) return
        const step = e.key === 'ArrowDown' ? 1 : -1
        setPickIndex((activeIndex + step + matches.length) % matches.length)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissedFor(draft)
        return
      }
      const chosen = matches[activeIndex]
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && chosen) {
        e.preventDefault()
        void insert(chosen)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const closeSchedule = useCallback(() => setScheduling(false), [])
  const scheduled = useCallback(() => {
    setScheduling(false)
    setDraft('')
  }, [])

  return (
    <div className="border-t border-line p-3" data-tour="inbox-composer">
      {emojiOpen && (
        <div className="mb-2 flex flex-wrap gap-1" data-testid="emoji-picker">
          {EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                setDraft((d) => d + e)
                setEmojiOpen(false)
              }}
              className="rounded px-1.5 py-0.5 text-lg hover:bg-wa-in"
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => setEmojiOpen((o) => !o)}
          data-testid="emoji-toggle"
        >
          😊
        </Button>
        <RichComposer chatId={chatId} onSent={onSent} />
        <div className="relative flex-1">
          {pickerOpen && (
            <QuickReplyPicker
              query={query}
              items={matches}
              loading={replies.loading}
              activeIndex={activeIndex}
              onPick={(reply) => void insert(reply)}
              onHover={setPickIndex}
              onManage={onManageQuickReplies}
            />
          )}
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => edit(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a message, or / for quick replies..."
            data-testid="message-input"
            aria-autocomplete="list"
            aria-expanded={pickerOpen}
            className="w-full rounded-control border border-line bg-surface px-2.5 py-2 text-sm text-ink outline-none focus:border-primary"
          />
        </div>
        <Button
          onClick={() => setScheduling(true)}
          title="Send this message later"
          data-testid="schedule-open"
        >
          Schedule
        </Button>
        <Button variant="primary" onClick={() => void send()} data-testid="send-message">
          Send
        </Button>
      </div>
      {scheduling && (
        <ScheduleDialog
          chatId={chatId}
          initialBody={draft}
          onClose={closeSchedule}
          onScheduled={scheduled}
        />
      )}
    </div>
  )
}
