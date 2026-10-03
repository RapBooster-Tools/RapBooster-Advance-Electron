'use client'

import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { StatusPill } from '@renderer/components/ui/status-pill'
import type { IpcResponse } from '@shared/ipc'
import type { PostStatus } from '@shared/types'

type PostDto = IpcResponse<'post:list'>[number]

const TONES: Record<PostStatus, 'ok' | 'warn' | 'idle' | 'danger'> = {
  scheduled: 'warn',
  posting: 'warn',
  posted: 'ok',
  failed: 'danger',
  cancelled: 'idle',
}

function summary(post: PostDto): string {
  const file = post.mediaPath?.split(/[\\/]/).pop()
  if (post.kind === 'text') return post.body
  const label = post.kind === 'image' ? 'Image' : 'Video'
  return [`${label}${file ? ` (${file})` : ''}`, post.body].filter(Boolean).join(' · ')
}

export function PostsTable({
  posts,
  onChanged,
}: {
  posts: PostDto[]
  onChanged: () => void
}) {
  const toast = useToast()
  const [busyId, setBusyId] = useState<string>()

  async function cancel(id: string) {
    setBusyId(id)
    const result = await window.api.invoke('post:cancel', { id })
    setBusyId(undefined)
    if (!result.ok) toast('error', result.error.userMessage)
    onChanged()
  }

  if (posts.length === 0) {
    return (
      <p
        className="px-1 py-6 text-center text-sm text-ink-muted"
        data-testid="posts-empty"
      >
        Nothing posted or scheduled yet.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full text-left text-sm" data-testid="posts-table">
        <thead className="border-b border-line text-xs text-ink-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">Target</th>
            <th className="px-3 py-2 font-semibold">Device</th>
            <th className="px-3 py-2 font-semibold">Content</th>
            <th className="px-3 py-2 font-semibold">Scheduled</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Error</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr
              key={post.id}
              data-testid="post-row"
              data-post-id={post.id}
              className="border-b border-line last:border-0"
            >
              <td className="px-3 py-2 whitespace-nowrap">
                {post.target === 'status' ? 'Status' : (post.channelName ?? 'Channel')}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{post.deviceName}</td>
              <td className="max-w-72 truncate px-3 py-2" title={summary(post)}>
                {post.backgroundColor && (
                  <span
                    aria-hidden
                    className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
                    style={{ backgroundColor: post.backgroundColor }}
                  />
                )}
                {summary(post)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-ink-muted">
                {new Date(post.scheduledAt).toLocaleString()}
              </td>
              <td className="px-3 py-2" data-testid="post-status">
                <StatusPill tone={TONES[post.status]}>
                  {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
                </StatusPill>
              </td>
              <td
                className="max-w-56 truncate px-3 py-2 text-xs text-danger"
                title={post.error ?? undefined}
                data-testid="post-error"
              >
                {post.error}
              </td>
              <td className="px-3 py-2 text-right">
                {post.status === 'scheduled' && (
                  <Button
                    size="sm"
                    onClick={() => void cancel(post.id)}
                    disabled={busyId === post.id}
                    data-testid="post-cancel"
                  >
                    Cancel
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
