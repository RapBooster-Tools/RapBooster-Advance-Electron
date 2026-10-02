'use client'

import { useState } from 'react'
import { ChannelsPanel } from '@renderer/components/broadcast/channels-panel'
import { PostComposer } from '@renderer/components/broadcast/post-composer'
import { PostsTable } from '@renderer/components/broadcast/posts-table'
import { PageHeader } from '@renderer/components/layout/page-header'
import { useIpcEvent, useIpcQuery } from '@renderer/hooks/useIpc'
import { cn } from '@renderer/lib/cn'

type Tab = 'status' | 'channels'

export default function BroadcastPage() {
  const [tab, setTab] = useState<Tab>('status')
  const posts = useIpcQuery('post:list', {
    target: tab === 'status' ? 'status' : 'channel',
  })
  const channels = useIpcQuery('channel:list', {}, { enabled: tab === 'channels' })

  // Posting happens in main on the scheduler's clock; every transition is
  // pushed, so the table never polls (CLAUDE.md §2.7).
  useIpcEvent('post:changed', () => posts.refetch())

  return (
    <>
      <PageHeader
        title="Status & Channels"
        description="Post status updates and channel messages, now or on a schedule"
      />

      <div className="flex gap-1 border-b border-line px-6 pt-3" role="tablist">
        {(['status', 'channels'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            data-testid={`tab-${value}`}
            onClick={() => setTab(value)}
            className={cn(
              'px-3 py-1.5 text-sm',
              tab === value
                ? 'border-b-2 border-primary font-medium text-ink'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {value === 'status' ? 'Status' : 'Channels'}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
        {tab === 'status' ? (
          <PostComposer key="status" target="status" onCreated={posts.refetch} />
        ) : (
          <>
            <ChannelsPanel channels={channels.data ?? []} onChanged={channels.refetch} />
            <PostComposer
              key="channel"
              target="channel"
              channels={channels.data ?? []}
              onCreated={posts.refetch}
            />
          </>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-ink">
            {tab === 'status' ? 'Status posts' : 'Channel posts'}
          </h2>
          <PostsTable posts={posts.data ?? []} onChanged={posts.refetch} />
        </section>
      </div>
    </>
  )
}
