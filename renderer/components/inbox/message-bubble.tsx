'use client'

/**
 * One message in the thread. Photos, documents, voice notes, locations, contact
 * cards, polls and the rest render as a labelled card rather than raw text, so
 * a person can tell at a glance what the customer sent.
 */
import { cn } from '@renderer/lib/cn'
import type { MessageType } from '@shared/types'
import { fileNameOf, formatFileSize, type InboxMessage } from './inbox-types'

interface RichKind {
  icon: string
  label: string
}

const RICH: Partial<Record<MessageType, RichKind>> = {
  media: { icon: '🖼️', label: 'Photo or video' },
  attachment: { icon: '📄', label: 'Document' },
  voice: { icon: '🎤', label: 'Voice note' },
  sticker: { icon: '🏷️', label: 'Sticker' },
  location: { icon: '📍', label: 'Location' },
  contact: { icon: '👤', label: 'Contact card' },
  poll: { icon: '📊', label: 'Poll' },
  event: { icon: '📅', label: 'Event' },
  product: { icon: '🛍️', label: 'Product' },
}

const IMAGE = /\.(jpe?g|png|webp|gif)$/i
const VIDEO = /\.(mp4|3gp|mkv|mov)$/i
const COORDS = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/

/** A photo and a video arrive as the same type; the file name tells them apart. */
function richKind(m: InboxMessage): RichKind | undefined {
  const base = RICH[m.type]
  if (m.type !== 'media') return base
  const name = m.fileName ?? m.mediaPath ?? ''
  if (IMAGE.test(name)) return { icon: '📷', label: 'Photo' }
  if (VIDEO.test(name)) return { icon: '🎥', label: 'Video' }
  return base
}

/** What the card says under its label, and what is left over as a caption. */
function richText(
  m: InboxMessage,
  kind: RichKind,
): { title: string; detail: string | null; caption: string | null } {
  const body = m.body?.trim() || null
  // Messages this app sent store a ready-made summary ("📍 Head office").
  if (body?.startsWith(kind.icon)) return { title: body, detail: null, caption: null }

  const file = m.fileName ?? (m.mediaPath ? fileNameOf(m.mediaPath) : null)
  const size = formatFileSize(m.fileSize)
  switch (m.type) {
    case 'media':
    case 'voice':
    case 'sticker':
      return {
        title: `${kind.icon} ${kind.label}`,
        detail: [file, size].filter(Boolean).join(' · ') || null,
        caption: body,
      }
    case 'attachment':
      return {
        title: `${kind.icon} ${file ?? kind.label}`,
        detail: size || (file ? kind.label : null),
        caption: body,
      }
    case 'location': {
      const coords = body?.match(COORDS)
      return {
        title: `${kind.icon} ${kind.label}`,
        detail: coords ? `Pinned at ${coords[1]}, ${coords[2]}` : body,
        caption: null,
      }
    }
    default:
      return { title: `${kind.icon} ${kind.label}`, detail: body, caption: null }
  }
}

function RichCard({ m, kind }: { m: InboxMessage; kind: RichKind }) {
  const { title, detail, caption } = richText(m, kind)
  return (
    <>
      <div
        className="mb-1 flex min-w-[180px] flex-col rounded-control border border-line bg-surface px-2.5 py-1.5"
        data-testid="message-rich"
        data-kind={m.type}
      >
        <span className="text-sm font-medium break-words text-ink">{title}</span>
        {detail && (
          <span
            className="text-xs break-words text-ink-muted"
            data-testid="message-rich-detail"
          >
            {detail}
          </span>
        )}
      </div>
      {caption && <span className="whitespace-pre-wrap">{caption}</span>}
    </>
  )
}

export function MessageBubble({ message: m }: { message: InboxMessage }) {
  const kind = richKind(m)
  return (
    <div
      data-testid="message-bubble"
      className={cn('mb-2 flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[70%] rounded-bubble px-3 py-2 text-sm text-ink',
          m.direction === 'out' ? 'bg-wa-out' : 'bg-wa-in',
        )}
      >
        {kind ? (
          <RichCard m={m} kind={kind} />
        ) : (
          m.body && <span className="whitespace-pre-wrap">{m.body}</span>
        )}
        {m.buttons && m.buttons.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1">
            {m.buttons.map((b, i) => (
              <span
                key={`${b.type}-${b.label}-${i}`}
                data-testid="message-button"
                className="rounded-control border border-line bg-surface px-2 py-1 text-center text-xs text-primary"
              >
                {b.label}
              </span>
            ))}
          </div>
        )}
        <span className="mt-1 block text-right text-[10px] text-ink-subtle">
          {m.isAiReply && 'AI · '}
          {new Date(m.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
          {m.direction === 'out' && ` · ${m.status}`}
        </span>
      </div>
    </div>
  )
}
