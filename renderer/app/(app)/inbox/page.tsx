'use client'

import { MessageSquare, PanelRight } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { ChatList } from '@renderer/components/inbox/chat-list'
import type { ChatFilter } from '@renderer/components/inbox/chat-filter-tabs'
import { Composer } from '@renderer/components/inbox/composer'
import { ContactPanel } from '@renderer/components/inbox/contact-panel'
import { DraftsPanel } from '@renderer/components/inbox/drafts-panel'
import type { InboxMessage } from '@renderer/components/inbox/inbox-types'
import { MessageThread } from '@renderer/components/inbox/message-thread'
import { QuickRepliesDialog } from '@renderer/components/inbox/quick-replies-dialog'
import { ScheduledStrip } from '@renderer/components/inbox/scheduled-strip'
import { PageHeader } from '@renderer/components/layout/page-header'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { useIpcEvent, useIpcQuery } from '@renderer/hooks/useIpc'
import { displayPhone } from '@shared/phone-display'

/** Opened from a notification or another screen: `/inbox?chat=<chatId>`. */
function useDeepLinkedChat(select: (chatId: string) => void) {
  const linked = useSearchParams().get('chat')
  useEffect(() => {
    if (linked) select(linked)
  }, [linked, select])
}

function Inbox() {
  const devices = useIpcQuery('device:list')
  const [deviceFilter, setDeviceFilter] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ChatFilter>('all')
  const [activeId, setActiveId] = useState<string>()
  const [panelOpen, setPanelOpen] = useState(false)
  const [managingReplies, setManagingReplies] = useState(false)
  const [thread, setThread] = useState<{ chatId: string; messages: InboxMessage[] }>({
    chatId: '',
    messages: [],
  })
  const toast = useToast()

  useDeepLinkedChat(setActiveId)

  const chats = useIpcQuery('chat:list', {
    ...(deviceFilter ? { deviceId: deviceFilter } : {}),
    ...(search ? { search } : {}),
    filter,
    limit: 100,
  })

  const list = chats.data?.items ?? []
  const listed = list.find((c) => c.id === activeId)
  // A deep-linked chat can sit outside the loaded page or the current filter.
  const fetched = useIpcQuery(
    'chat:get',
    { id: activeId ?? '' },
    { enabled: activeId !== undefined && chats.data !== undefined && !listed },
  )
  const active = listed ?? fetched.data
  const loaded = activeId !== undefined && thread.chatId === activeId

  // Load history when the selected chat changes. State is keyed by chatId so a
  // slow response for a previous chat cannot overwrite the current one.
  useEffect(() => {
    if (!activeId) return
    let cancelled = false

    void window.api
      .invoke('chat:messages', { chatId: activeId, limit: 100 })
      .then((result) => {
        if (cancelled) return
        // The channel returns newest-first for cursor paging; display is oldest-first.
        setThread({
          chatId: activeId,
          messages: result.ok ? [...result.data.items].reverse() : [],
        })
      })

    void window.api
      .invoke('chat:markRead', { chatId: activeId })
      .then(() => chats.refetch())

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  const append = useCallback((chatId: string, message: InboxMessage) => {
    // Deduplicated by id: a reply this window sent itself can also arrive as an
    // event (an approved AI draft, a scheduled message).
    setThread((current) =>
      current.chatId === chatId && !current.messages.some((m) => m.id === message.id)
        ? { ...current, messages: [...current.messages, message] }
        : current,
    )
  }, [])

  // Live ingestion: append to the open chat, and refresh the list either way so
  // ordering and unread badges stay correct.
  useIpcEvent('message:received', ({ chatId, message }) => {
    if (chatId === activeId) {
      append(chatId, message)
      if (message.direction === 'in') void window.api.invoke('chat:markRead', { chatId })
    }
    chats.refetch()
  })

  // Escalation, drafts and bot state change server-side; badges follow.
  useIpcEvent('chat:updated', () => chats.refetch())

  useIpcEvent('message:status', ({ messageId, status }) => {
    setThread((current) => ({
      ...current,
      messages: current.messages.map((m) => (m.id === messageId ? { ...m, status } : m)),
    }))
  })

  // Escalation pauses auto-reply for this chat until a person hands it back.
  async function resumeBot(chatId: string) {
    const result = await window.api.invoke('chat:resumeBot', { chatId })
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    toast('success', 'Auto-reply resumed for this chat')
    chats.refetch()
  }

  const openReplies = useCallback(() => setManagingReplies(true), [])
  const closeReplies = useCallback(() => setManagingReplies(false), [])

  const header = (
    <PageHeader
      title="Unified inbox"
      description="Conversations from every connected device appear here."
      actions={
        <Button onClick={openReplies} data-testid="quick-replies-open">
          Quick replies
        </Button>
      }
    />
  )

  if ((devices.data ?? []).length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={MessageSquare}
          title="No devices connected."
          description="Link a WhatsApp account and its conversations appear here."
        />
        {managingReplies && <QuickRepliesDialog onClose={closeReplies} />}
      </>
    )
  }

  return (
    <>
      {header}

      <div className="flex min-h-0 flex-1" data-help="inbox">
        <ChatList
          chats={list}
          devices={devices.data ?? []}
          activeId={activeId}
          onSelect={setActiveId}
          search={search}
          onSearch={setSearch}
          deviceFilter={deviceFilter}
          onDeviceFilter={setDeviceFilter}
          filter={filter}
          onFilter={setFilter}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {!active ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-ink-muted" data-testid="no-chat-selected">
                Select a chat
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-semibold text-ink"
                    data-testid="chat-name"
                  >
                    {displayPhone(active.name)}
                  </p>
                  <p className="text-xs text-ink-muted">{displayPhone(active.phone)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {active.isEscalated && (
                    <>
                      <span
                        className="rounded bg-status-warn-bg px-2 py-0.5 text-xs text-status-warn-fg"
                        data-testid="chat-escalated"
                      >
                        Escalated
                      </span>
                      <Button
                        size="sm"
                        onClick={() => void resumeBot(active.id)}
                        data-testid="resume-bot"
                      >
                        Resume bot
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant={panelOpen ? 'primary' : 'secondary'}
                    aria-pressed={panelOpen}
                    onClick={() => setPanelOpen((o) => !o)}
                    title="Show contact details and notes"
                    data-testid="contact-panel-toggle"
                  >
                    <PanelRight className="size-3.5" aria-hidden />
                    Contact info
                  </Button>
                </div>
              </div>

              <DraftsPanel chatId={active.id} />

              <MessageThread messages={loaded ? thread.messages : []} loaded={loaded} />

              <ScheduledStrip chatId={active.id} />

              <Composer
                key={active.id}
                chatId={active.id}
                onManageQuickReplies={openReplies}
                onSent={(sent) => {
                  append(active.id, sent)
                  chats.refetch()
                }}
              />
            </>
          )}
        </div>

        {active && panelOpen && <ContactPanel chatId={active.id} />}
      </div>

      {managingReplies && <QuickRepliesDialog onClose={closeReplies} />}
    </>
  )
}

export default function InboxPage() {
  // NOTE: useSearchParams needs a Suspense boundary in a static export, or the
  // build bails out of prerendering the whole route.
  return (
    <Suspense fallback={null}>
      <Inbox />
    </Suspense>
  )
}
