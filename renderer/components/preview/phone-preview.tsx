'use client'

import {
  ArrowLeft,
  Camera,
  CheckCheck,
  EllipsisVertical,
  FaceSlightlySmiling,
  Mic,
  Paperclip,
  Phone,
  Video,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'
import {
  BubbleText,
  ButtonsBody,
  DocumentBody,
  ListBody,
  ListSheet,
  MediaBody,
  VoiceBody,
} from './bubble-parts'
import {
  ContactBody,
  EventBody,
  LocationBody,
  PollBody,
  ProductBody,
  Sticker,
} from './rich-parts'
import type { PreviewMessage, PreviewPerspective } from './types'

export type { PreviewKind, PreviewMessage, PreviewPerspective } from './types'
export { renderWhatsAppFormatting } from './whatsapp-format'

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-wa-media font-semibold text-wa-meta',
        size === 'sm' ? 'size-8 text-sm' : 'size-9 text-[15px]',
      )}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

function Meta({ time, ticks }: { time: string; ticks: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5 align-bottom text-[11px] leading-4 whitespace-nowrap text-wa-meta">
      {time}
      {ticks && <CheckCheck className="size-4 text-wa-tick" aria-label="Read" />}
    </span>
  )
}

/** WhatsApp's bubble tail, drawn for the first bubble in a run. */
function Tail({ side }: { side: 'left' | 'right' }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 13"
      className={cn(
        'absolute top-0 h-[13px] w-2',
        side === 'left' ? '-left-2 fill-wa-bubble-in' : '-right-2 fill-wa-bubble-out',
      )}
    >
      {side === 'left' ? (
        <path d="M1.533 3.568 8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z" />
      ) : (
        <path d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z" />
      )}
    </svg>
  )
}

function Body({
  message,
  meta,
  senderName,
}: {
  message: PreviewMessage
  meta: ReactNode
  senderName: string
}) {
  switch (message.kind) {
    case 'text':
      return <BubbleText text={message.text} meta={meta} />
    case 'image':
    case 'video':
      return <MediaBody message={message} meta={meta} />
    case 'document':
      return <DocumentBody message={message} meta={meta} />
    case 'buttons':
      return <ButtonsBody message={message} meta={meta} />
    case 'list':
      return <ListBody message={message} meta={meta} />
    case 'voice':
      return (
        <VoiceBody
          durationSec={message.durationSec}
          meta={meta}
          avatar={<Avatar name={senderName} size="sm" />}
        />
      )
    case 'location':
      return <LocationBody message={message} meta={meta} />
    case 'contact':
      return <ContactBody message={message} meta={meta} />
    case 'poll':
      return <PollBody message={message} meta={meta} />
    case 'event':
      return <EventBody message={message} meta={meta} />
    case 'product':
      return <ProductBody message={message} meta={meta} />
    case 'sticker':
      return null
  }
}

/**
 * A WhatsApp-style phone showing messages the way the recipient sees them.
 *
 * Pure presentation: give it `messages` (see PreviewMessage) and it draws
 * them — formatted text, media, buttons, lists, voice notes, stickers,
 * locations, contact cards, polls, events and products. It follows the app
 * theme using WhatsApp's own light and dark palettes; `theme` pins one.
 *
 *   <PhonePreview messages={{ kind: 'text', text: 'Hi *Priya*!' }} />
 */
export function PhonePreview({
  messages,
  senderName = 'Your Business',
  time = '10:30',
  perspective = 'recipient',
  theme,
  frame = true,
  emptyHint = 'Your message preview appears here',
  testId = 'phone-preview',
  className,
}: {
  messages: PreviewMessage | readonly PreviewMessage[]
  /** Name in the chat header — the business, as the customer has it saved. */
  senderName?: string
  time?: string
  perspective?: PreviewPerspective
  /** Pin WhatsApp's light or dark palette regardless of the app theme. */
  theme?: 'light' | 'dark'
  /** Draw the phone body; false gives just the chat panel for tight spaces. */
  frame?: boolean
  emptyHint?: string
  testId?: string
  className?: string
}) {
  const list: readonly PreviewMessage[] = Array.isArray(messages)
    ? messages
    : [messages as PreviewMessage]
  const outgoing = perspective === 'sender'
  const meta = <Meta time={time} ticks={outgoing} />

  const chat = (
    <div className="flex h-full flex-col">
      {/* WhatsApp chat header */}
      <div className="flex shrink-0 items-center gap-2 bg-wa-header px-2 py-2 text-wa-on-header">
        <ArrowLeft className="size-5 shrink-0" aria-hidden />
        <Avatar name={senderName} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-medium">{senderName}</p>
          <p className="text-[11.5px] opacity-80">online</p>
        </div>
        <Video className="size-5 shrink-0" aria-hidden />
        <Phone className="size-[18px] shrink-0" aria-hidden />
        <EllipsisVertical className="size-5 shrink-0" aria-hidden />
      </div>

      <div className="wa-wallpaper flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
        <span className="mx-auto mb-1 rounded-[7px] bg-wa-bubble-in px-2 py-0.5 text-[11.5px] text-wa-meta shadow-card">
          Today
        </span>
        {list.length === 0 && (
          <p
            className="m-auto max-w-[80%] rounded-[8px] bg-wa-bubble-in/80 px-3 py-2 text-center text-[12.5px] text-wa-meta"
            data-testid="phone-preview-empty"
          >
            {emptyHint}
          </p>
        )}
        {list.map((message, i) => {
          const first = i === 0
          return (
            <div
              key={i}
              className={cn(
                'flex flex-col',
                outgoing ? 'items-end' : 'items-start',
                !first && 'mt-0.5',
              )}
            >
              {message.kind === 'sticker' ? (
                <div data-testid="preview-bubble" data-kind="sticker">
                  <Sticker src={message.src} meta={meta} />
                </div>
              ) : (
                <div
                  data-testid="preview-bubble"
                  data-kind={message.kind}
                  className="relative max-w-[85%] min-w-[96px]"
                >
                  {/* Outside the clipped bubble, or overflow-hidden would cut it off. */}
                  {first && <Tail side={outgoing ? 'right' : 'left'} />}
                  <div
                    className={cn(
                      'overflow-hidden rounded-[8px] text-wa-text shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]',
                      outgoing ? 'bg-wa-bubble-out' : 'bg-wa-bubble-in',
                      first && (outgoing ? 'rounded-tr-none' : 'rounded-tl-none'),
                    )}
                  >
                    <Body message={message} meta={meta} senderName={senderName} />
                  </div>
                </div>
              )}
              {message.kind === 'list' && <ListSheet message={message} />}
            </div>
          )
        })}
      </div>

      {/* Composer bar, for recognisability only. */}
      <div
        className="flex shrink-0 items-center gap-1.5 bg-wa-composer px-2 py-1.5"
        aria-hidden
      >
        <div className="flex h-9 flex-1 items-center gap-2 rounded-full bg-wa-input px-3 text-[14px] text-wa-meta">
          <FaceSlightlySmiling className="size-5 shrink-0" />
          <span className="flex-1">Message</span>
          <Paperclip className="size-[18px] shrink-0 -rotate-45" />
          <Camera className="size-[18px] shrink-0" />
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white">
          <Mic className="size-[18px]" />
        </span>
      </div>
    </div>
  )

  return (
    <figure
      data-testid={testId}
      data-theme={theme}
      data-perspective={perspective}
      className={cn('m-0 select-none', className)}
    >
      <figcaption className="sr-only">
        Preview of how this message appears in WhatsApp
      </figcaption>
      {frame ? (
        <div className="mx-auto w-[300px] rounded-[2.4rem] bg-[#1b1f23] p-[9px] shadow-overlay ring-1 ring-black/10">
          <div className="relative flex h-[560px] flex-col overflow-hidden rounded-[1.9rem] bg-wa-chat">
            {/* Status bar with the camera notch */}
            <div className="relative flex h-7 shrink-0 items-center justify-between bg-wa-header px-5 text-[11px] font-semibold text-wa-on-header">
              <span>9:41</span>
              <span
                className="absolute inset-x-0 top-1.5 mx-auto h-4 w-20 rounded-full bg-[#1b1f23]"
                aria-hidden
              />
              <span className="flex items-center gap-1" aria-hidden>
                <span className="h-2 w-3 rounded-[2px] border border-current" />
              </span>
            </div>
            <div className="min-h-0 flex-1">{chat}</div>
          </div>
        </div>
      ) : (
        <div className="flex h-[480px] flex-col overflow-hidden rounded-card border border-line bg-wa-chat">
          {chat}
        </div>
      )}
    </figure>
  )
}
