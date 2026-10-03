import {
  CalendarDays,
  FaceSlightlySmiling,
  ListChecks,
  MapPin,
  ShoppingBag,
  UserRound,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'
import { BubbleAction, BubbleText, safeSrc } from './bubble-parts'
import type { PreviewMessage } from './types'

type Of<K extends PreviewMessage['kind']> = Extract<PreviewMessage, { kind: K }>

export function LocationBody({
  message,
  meta,
}: {
  message: Of<'location'>
  meta: ReactNode
}) {
  return (
    <>
      {/* A stylised map tile: streets as a grid, the pin in the middle. */}
      <div
        className="relative m-[3px] h-32 w-[210px] overflow-hidden rounded-[9px] bg-wa-media"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-wa-divider) 1px, transparent 1px), linear-gradient(90deg, var(--color-wa-divider) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      >
        <MapPin
          className="absolute inset-0 m-auto size-9 fill-[#e5252a] text-[#8e1014] drop-shadow"
          aria-hidden
        />
      </div>
      <div className="px-2 pt-1 pb-1">
        {message.name && (
          <p className="text-[14px] font-medium text-wa-text">{message.name}</p>
        )}
        <p className="text-[12.5px] text-wa-meta">
          {message.address ??
            `${message.latitude.toFixed(4)}, ${message.longitude.toFixed(4)}`}
        </p>
        <div className="flex justify-end">{meta}</div>
      </div>
    </>
  )
}

export function ContactBody({
  message,
  meta,
}: {
  message: Of<'contact'>
  meta: ReactNode
}) {
  const [first] = message.contacts
  const others = message.contacts.length - 1
  return (
    <>
      <div className="flex w-[216px] items-center gap-3 px-2.5 pt-2.5 pb-1">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-wa-media text-wa-meta">
          <UserRound className="size-6" aria-hidden />
        </span>
        <p className="min-w-0 truncate text-[14.5px] font-medium text-wa-text">
          {first?.name ?? 'Contact'}
          {others > 0 && (
            <span className="font-normal text-wa-meta">
              {' '}
              and {others} other contact{others === 1 ? '' : 's'}
            </span>
          )}
        </p>
      </div>
      <div className="flex justify-end px-2 pb-1">{meta}</div>
      <div className="grid grid-cols-2 border-t border-wa-divider text-center text-[14px] font-medium text-wa-link">
        {others > 0 ? (
          <span className="col-span-2 py-2">View all</span>
        ) : (
          <>
            <span className="border-r border-wa-divider py-2">Message</span>
            <span className="py-2">Add contact</span>
          </>
        )}
      </div>
    </>
  )
}

export function PollBody({ message, meta }: { message: Of<'poll'>; meta: ReactNode }) {
  const multi = message.selectableCount === 0 || (message.selectableCount ?? 1) > 1
  return (
    <>
      <div className="w-[216px] px-2.5 pt-2">
        <p className="text-[14.5px] leading-snug font-semibold text-wa-text">
          {message.question}
        </p>
        <p className="mt-1 flex items-center gap-1 text-[12px] text-wa-meta">
          <ListChecks className="size-3.5" aria-hidden />
          {multi ? 'Select one or more' : 'Select one'}
        </p>
        <ul className="mt-2 flex flex-col gap-2.5">
          {message.options.map((option, i) => (
            <li key={`${option}-${i}`} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 size-[18px] shrink-0 border-2 border-wa-meta/70',
                  multi ? 'rounded-[4px]' : 'rounded-full',
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] text-wa-text">{option}</span>
                <span
                  className="mt-1.5 block h-[5px] rounded-full bg-wa-divider"
                  aria-hidden
                />
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end pt-1 pb-1">{meta}</div>
      </div>
      <BubbleAction label="View votes" />
    </>
  )
}

function formatWhen(startAt: string, endAt?: string): string {
  const start = new Date(startAt)
  if (Number.isNaN(start.getTime())) return startAt
  const day = start.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const time = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const end = endAt ? new Date(endAt) : undefined
  return end && !Number.isNaN(end.getTime())
    ? `${day}, ${time(start)} – ${time(end)}`
    : `${day}, ${time(start)}`
}

export function EventBody({ message, meta }: { message: Of<'event'>; meta: ReactNode }) {
  return (
    <>
      <div className="flex w-[216px] gap-3 px-2.5 pt-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-wa-tick/15 text-wa-tick">
          <CalendarDays className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[14.5px] leading-snug font-semibold text-wa-text">
            {message.name}
          </p>
          <p className="mt-0.5 text-[12.5px] text-wa-text">
            {formatWhen(message.startAt, message.endAt)}
          </p>
          {message.location && (
            <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-wa-meta">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{message.location}</span>
            </p>
          )}
        </div>
      </div>
      {message.description ? (
        <BubbleText
          text={message.description}
          meta={meta}
          className="px-2.5 text-[13.5px]"
        />
      ) : (
        <div className="flex justify-end px-2 pb-1">{meta}</div>
      )}
      <BubbleAction label="View event" />
    </>
  )
}

function formatPrice(amount1000?: number, currency?: string): string | undefined {
  if (amount1000 === undefined) return undefined
  const value = amount1000 / 1000
  try {
    return currency
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value)
      : value.toLocaleString()
  } catch (err) {
    // An unknown ISO code throws a RangeError; fall back to the plain number.
    console.warn('preview: unknown currency', currency, err)
    return `${currency ?? ''} ${value.toLocaleString()}`.trim()
  }
}

export function ProductBody({
  message,
  meta,
}: {
  message: Of<'product'>
  meta: ReactNode
}) {
  const { product } = message
  const src = safeSrc(product.imageUrl)
  const price = formatPrice(product.priceAmount1000, product.currency)
  return (
    <>
      <div className="m-[3px] flex aspect-square max-h-48 items-center justify-center overflow-hidden rounded-[9px] bg-wa-media text-wa-meta">
        {src ? (
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <ShoppingBag className="size-12 opacity-70" strokeWidth={1.4} aria-hidden />
        )}
      </div>
      <div className="w-[216px] px-2 pt-1">
        <p className="text-[14.5px] font-semibold text-wa-text">{product.title}</p>
        {price && <p className="text-[13.5px] text-wa-text">{price}</p>}
        {product.description && (
          <p className="line-clamp-2 text-[12.5px] text-wa-meta">{product.description}</p>
        )}
      </div>
      {message.text ? (
        <BubbleText text={message.text} meta={meta} />
      ) : (
        <div className="flex justify-end px-2 pb-1">{meta}</div>
      )}
      <BubbleAction icon={ShoppingBag} label="View" />
    </>
  )
}

/** Stickers are drawn without a bubble, the way WhatsApp shows them. */
export function Sticker({ src, meta }: { src?: string; meta: ReactNode }) {
  const safe = safeSrc(src)
  return (
    <div className="flex flex-col items-end gap-1">
      {safe ? (
        <img src={safe} alt="Sticker" className="size-32 object-contain" />
      ) : (
        <span className="flex size-32 items-center justify-center rounded-[28px] bg-wa-bubble-in/70 text-wa-meta shadow-card">
          <FaceSlightlySmiling
            className="size-16"
            strokeWidth={1.3}
            aria-label="Sticker"
          />
        </span>
      )}
      <span className="rounded-full bg-wa-bubble-in px-1.5 shadow-card">{meta}</span>
    </div>
  )
}
