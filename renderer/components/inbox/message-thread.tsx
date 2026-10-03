'use client'

import { useEffect, useRef } from 'react'
import type { InboxMessage } from './inbox-types'
import { MessageBubble } from './message-bubble'

/** The open conversation, oldest first, kept scrolled to the newest message. */
export function MessageThread({
  messages,
  loaded,
}: {
  messages: InboxMessage[]
  loaded: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const lastId = messages[messages.length - 1]?.id

  // Follow new messages the way every chat app does; keyed on the newest id so
  // a status tick on an old message does not yank the view.
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lastId])

  return (
    <div
      ref={ref}
      className="min-h-0 flex-1 overflow-y-auto p-4"
      data-testid="message-thread"
    >
      {loaded && messages.length === 0 && (
        <p className="text-center text-xs text-ink-muted">No messages yet.</p>
      )}
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
    </div>
  )
}
