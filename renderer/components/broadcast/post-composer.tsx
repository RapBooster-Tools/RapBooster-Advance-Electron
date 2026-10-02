'use client'

import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import { cn } from '@renderer/lib/cn'
import type { IpcResponse } from '@shared/ipc'
import type { PostKind } from '@shared/types'

type ChannelDto = IpcResponse<'channel:list'>[number]

const FIELD =
  'rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary'
const LABEL = 'text-xs font-semibold text-ink'

/** WhatsApp's own text-status palette, so a preview matches what viewers see. */
const BACKGROUNDS = ['#25D366', '#128C7E', '#34B7F1', '#7E57C2', '#EF5350', '#FFA000']

/**
 * One composer for both targets. A status needs a device and an audience; a
 * channel post needs a channel, and the channel decides the device.
 */
export function PostComposer({
  target,
  channels = [],
  onCreated,
}: {
  target: 'status' | 'channel'
  channels?: ChannelDto[]
  onCreated: () => void
}) {
  const toast = useToast()
  const devices = useIpcQuery('device:list')
  const lists = useIpcQuery('contactList:list', undefined, {
    enabled: target === 'status',
  })

  const [deviceId, setDeviceId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [kind, setKind] = useState<PostKind>('text')
  const [body, setBody] = useState('')
  const [background, setBackground] = useState(BACKGROUNDS[0]!)
  const [mediaPath, setMediaPath] = useState('')
  const [everyone, setEveryone] = useState(true)
  const [listIds, setListIds] = useState<string[]>([])
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [busy, setBusy] = useState(false)

  const postable = channels.filter((c) => c.role === 'owner' || c.role === 'admin')
  const channel = postable.find((c) => c.id === channelId)
  const effectiveDevice = target === 'channel' ? (channel?.deviceId ?? '') : deviceId

  async function submit() {
    if (when === 'later' && !scheduledAt) {
      toast('error', 'Pick a date and time, or choose "Post now".')
      return
    }
    setBusy(true)
    const result = await window.api.invoke('post:create', {
      deviceId: effectiveDevice,
      target,
      ...(target === 'channel' ? { channelId } : {}),
      kind,
      body,
      ...(kind !== 'text' ? { mediaSourcePath: mediaPath } : {}),
      ...(target === 'status' && kind === 'text' ? { backgroundColor: background } : {}),
      listIds: target === 'status' && !everyone ? listIds : [],
      ...(when === 'later' ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
    })
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    toast('success', when === 'later' ? 'Post scheduled' : 'Posting now')
    setBody('')
    setMediaPath('')
    onCreated()
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
      data-testid="post-composer"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {target === 'status' ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="post-device" className={LABEL}>
              Device
            </label>
            <select
              id="post-device"
              data-testid="post-device"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className={FIELD}
            >
              <option value="">-- Choose a device --</option>
              {(devices.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.status === 'connected' ? 'connected' : d.status})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="post-channel" className={LABEL}>
              Channel
            </label>
            <select
              id="post-channel"
              data-testid="post-channel"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className={FIELD}
            >
              <option value="">-- Choose a channel you own --</option>
              {postable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {devices.data?.find((d) => d.id === c.deviceId)?.name ?? ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="post-kind" className={LABEL}>
            Type
          </label>
          <select
            id="post-kind"
            data-testid="post-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as PostKind)}
            className={FIELD}
          >
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="post-body" className={LABEL}>
          {kind === 'text' ? 'Text' : 'Caption (optional)'}
        </label>
        <textarea
          id="post-body"
          data-testid="post-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4096}
          className={cn(FIELD, 'min-h-20 resize-y')}
          style={
            target === 'status' && kind === 'text'
              ? { backgroundColor: background, color: '#fff' }
              : undefined
          }
        />
      </div>

      {target === 'status' && kind === 'text' && (
        <fieldset className="flex items-center gap-2">
          <legend className={cn(LABEL, 'mb-1.5')}>Background</legend>
          {BACKGROUNDS.map((colour) => (
            <button
              key={colour}
              type="button"
              aria-label={`Background ${colour}`}
              aria-pressed={background === colour}
              data-testid={`post-bg-${colour.slice(1)}`}
              onClick={() => setBackground(colour)}
              className={cn(
                'size-6 rounded-full border-2',
                background === colour ? 'border-ink' : 'border-transparent',
              )}
              style={{ backgroundColor: colour }}
            />
          ))}
        </fieldset>
      )}

      {kind !== 'text' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="post-media" className={LABEL}>
            {kind === 'image' ? 'Image' : 'Video'} file path
          </label>
          <input
            id="post-media"
            data-testid="post-media"
            value={mediaPath}
            onChange={(e) => setMediaPath(e.target.value)}
            placeholder={
              kind === 'image' ? 'C:\\Users\\you\\promo.jpg' : 'C:\\Users\\you\\promo.mp4'
            }
            className={cn(FIELD, 'font-mono text-xs')}
          />
          <p className="text-xs text-ink-subtle">
            The file is copied into the app, so a scheduled post still works if you move
            the original.
          </p>
        </div>
      )}

      {target === 'status' && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className={cn(LABEL, 'mb-1.5')}>Who can see it</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="post-audience"
              data-testid="post-audience-everyone"
              checked={everyone}
              onChange={() => setEveryone(true)}
            />
            Every contact on file (opted-out numbers are always excluded)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="post-audience"
              data-testid="post-audience-lists"
              checked={!everyone}
              onChange={() => setEveryone(false)}
            />
            Only these contact lists
          </label>
          {!everyone && (
            <div className="max-h-24 overflow-y-auto rounded-control border border-line p-2">
              {(lists.data ?? []).length === 0 && (
                <p className="text-xs text-ink-subtle">Create a contact list first.</p>
              )}
              {(lists.data ?? []).map((list) => (
                <label key={list.id} className="flex items-center gap-2 py-0.5 text-sm">
                  <input
                    type="checkbox"
                    data-testid={`post-list-${list.id}`}
                    checked={listIds.includes(list.id)}
                    onChange={() =>
                      setListIds((current) =>
                        current.includes(list.id)
                          ? current.filter((x) => x !== list.id)
                          : [...current, list.id],
                      )
                    }
                  />
                  <span className="truncate">
                    {list.name}{' '}
                    <span className="text-ink-subtle">({list.contactCount})</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <fieldset className="flex items-center gap-3 text-sm">
          <legend className="sr-only">When</legend>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="post-when"
              data-testid="post-when-now"
              checked={when === 'now'}
              onChange={() => setWhen('now')}
            />
            Post now
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="post-when"
              data-testid="post-when-later"
              checked={when === 'later'}
              onChange={() => setWhen('later')}
            />
            Schedule
          </label>
        </fieldset>
        {when === 'later' && (
          <input
            type="datetime-local"
            aria-label="Post at"
            data-testid="post-scheduled-at"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className={FIELD}
          />
        )}
        <Button
          variant="primary"
          className="ml-auto"
          onClick={() => void submit()}
          disabled={busy || !effectiveDevice}
          data-testid="post-submit"
        >
          {when === 'later' ? 'Schedule post' : 'Post now'}
        </Button>
      </div>
    </section>
  )
}
