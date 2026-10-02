'use client'

/** What a rich template sends, drawn inside its card in the template list. */
import type { IpcResponse } from '@shared/ipc'
import { formatPrice } from './product-picker'

type Template = IpcResponse<'template:list'>[number]

const BOX = 'mb-1 rounded bg-black/5 px-2 py-2 text-xs text-ink-muted'

function when(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function RichSummary({ template }: { template: Template }) {
  const extra = template.extra
  switch (template.type) {
    case 'voice':
      return (
        <div className={BOX} data-testid="rich-summary">
          🎤 Voice note
        </div>
      )
    case 'sticker':
      return (
        <div className={BOX} data-testid="rich-summary">
          🏷️ Sticker
        </div>
      )
    case 'location':
      return extra && 'latitude' in extra ? (
        <div className={BOX} data-testid="rich-summary">
          📍 {extra.name ?? 'Location'}
          {extra.address ? ` · ${extra.address}` : ''}
          <span className="block font-mono text-[10px]">
            {extra.latitude}, {extra.longitude}
          </span>
        </div>
      ) : null
    case 'contact':
      return extra && 'contacts' in extra ? (
        <div className={BOX} data-testid="rich-summary">
          {extra.contacts.map((c) => (
            <span key={`${c.name}-${c.phone}`} className="block">
              👤 {c.name}
            </span>
          ))}
        </div>
      ) : null
    case 'poll':
      return extra && 'options' in extra ? (
        <div className={BOX} data-testid="rich-summary">
          📊 {extra.selectableCount === 1 ? 'Single choice' : 'Multiple choice'}
          {extra.options.map((o) => (
            <span key={o} className="block">
              {extra.selectableCount === 1 ? '○' : '☐'} {o}
            </span>
          ))}
        </div>
      ) : null
    case 'event':
      return extra && 'startAt' in extra ? (
        <div className={BOX} data-testid="rich-summary">
          📅 {when(extra.startAt)}
          {extra.endAt ? ` – ${when(extra.endAt)}` : ''}
          {extra.location && <span className="block">📍 {extra.location}</span>}
        </div>
      ) : null
    case 'product':
      return extra && 'productId' in extra ? (
        <div className={BOX} data-testid="rich-summary">
          🛍️ {extra.title}
          {extra.priceAmount1000 !== undefined && (
            <span className="block">
              {formatPrice(extra.priceAmount1000, extra.currency)}
            </span>
          )}
        </div>
      ) : null
    default:
      return null
  }
}
