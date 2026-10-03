import {
  Copy,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  List,
  Mic,
  Phone,
  Play,
  Reply,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { TemplateButtonType } from '@shared/types'
import { cn } from '@renderer/lib/cn'
import type { PreviewMessage } from './types'
import { renderWhatsAppFormatting } from './whatsapp-format'

/** Only URLs the renderer can actually load (see PreviewMessage). */
export function safeSrc(src: string | undefined): string | undefined {
  return src && /^(data:|blob:)/.test(src) ? src : undefined
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Formatted message text; the time stamp floats into the last line. */
export function BubbleText({
  text,
  meta,
  className,
}: {
  text: string
  meta?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'px-2 pt-1.5 pb-1.5 text-[14.2px] leading-[19px] break-words whitespace-pre-wrap',
        className,
      )}
    >
      {renderWhatsAppFormatting(text)}
      {meta && <span className="float-right mt-1.5 ml-3 -mb-1">{meta}</span>}
    </div>
  )
}

/** Tappable rows along the bottom of a bubble (buttons, "View options", …). */
export function BubbleAction({
  icon: Icon,
  label,
}: {
  icon?: LucideIcon
  label: string
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 border-t border-wa-divider px-2 py-2 text-[14px] font-medium text-wa-link">
      {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
      <span className="truncate">{label}</span>
    </div>
  )
}

const BUTTON_ICON: Record<TemplateButtonType, LucideIcon> = {
  reply: Reply,
  url: ExternalLink,
  call: Phone,
  copy: Copy,
}

export function ButtonsBody({
  message,
  meta,
}: {
  message: Extract<PreviewMessage, { kind: 'buttons' }>
  meta: ReactNode
}) {
  return (
    <>
      <BubbleText text={message.text} meta={message.footer ? undefined : meta} />
      {message.footer && (
        <div className="px-2 pb-1.5 text-[13px] text-wa-meta">
          {message.footer}
          <span className="float-right ml-3">{meta}</span>
        </div>
      )}
      {message.buttons.map((button, i) => (
        <BubbleAction
          key={`${button.type}-${i}`}
          icon={BUTTON_ICON[button.type]}
          label={button.label}
        />
      ))}
    </>
  )
}

export function ListBody({
  message,
  meta,
}: {
  message: Extract<PreviewMessage, { kind: 'list' }>
  meta: ReactNode
}) {
  return (
    <>
      <BubbleText text={message.text} meta={message.footer ? undefined : meta} />
      {message.footer && (
        <div className="px-2 pb-1.5 text-[13px] text-wa-meta">
          {message.footer}
          <span className="float-right ml-3">{meta}</span>
        </div>
      )}
      <BubbleAction icon={List} label={message.buttonText || 'View options'} />
    </>
  )
}

/** The sheet WhatsApp opens from a list message, shown under the bubble. */
export function ListSheet({
  message,
}: {
  message: Extract<PreviewMessage, { kind: 'list' }>
}) {
  if (message.rows.length === 0) return null
  return (
    <div className="mt-1 w-[85%] overflow-hidden rounded-[10px] bg-wa-bubble-in shadow-card">
      <p className="border-b border-wa-divider px-3 py-2 text-center text-[13px] font-semibold text-wa-text">
        {message.buttonText || 'View options'}
      </p>
      <ul>
        {message.rows.map((row, i) => (
          <li
            key={`${row}-${i}`}
            className="flex items-center justify-between gap-3 border-b border-wa-divider px-3 py-2 text-[13.5px] text-wa-text last:border-b-0"
          >
            <span className="truncate">{row}</span>
            <span
              className="size-4 shrink-0 rounded-full border-2 border-wa-meta/70"
              aria-hidden
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Image or video tile with its caption. */
export function MediaBody({
  message,
  meta,
}: {
  message: Extract<PreviewMessage, { kind: 'image' | 'video' }>
  meta: ReactNode
}) {
  const src = safeSrc(message.src)
  const video = message.kind === 'video'
  return (
    <>
      <div className="relative m-[3px] aspect-[4/3] w-[210px] overflow-hidden rounded-[9px] bg-wa-media">
        {src && !video ? (
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-wa-meta">
            <ImageIcon className="size-10 opacity-70" strokeWidth={1.5} aria-hidden />
          </div>
        )}
        {video && (
          <>
            <span className="absolute inset-0 m-auto flex size-12 items-center justify-center rounded-full bg-black/45 text-white">
              <Play className="ml-0.5 size-6 fill-current" aria-hidden />
            </span>
            {message.durationSec !== undefined && (
              <span className="absolute bottom-1.5 left-2 text-[11px] font-medium text-white drop-shadow">
                {formatDuration(message.durationSec)}
              </span>
            )}
          </>
        )}
        {!message.caption && (
          <span className="absolute right-1.5 bottom-1 rounded-full bg-black/35 px-1.5 text-white [&_*]:!text-white">
            {meta}
          </span>
        )}
      </div>
      {message.caption && <BubbleText text={message.caption} meta={meta} />}
    </>
  )
}

const DOC_COLOURS: Record<string, string> = {
  pdf: 'bg-[#e5252a]',
  doc: 'bg-[#2b579a]',
  docx: 'bg-[#2b579a]',
  xls: 'bg-[#217346]',
  xlsx: 'bg-[#217346]',
  csv: 'bg-[#217346]',
  ppt: 'bg-[#d24726]',
  pptx: 'bg-[#d24726]',
}

export function DocumentBody({
  message,
  meta,
}: {
  message: Extract<PreviewMessage, { kind: 'document' }>
  meta: ReactNode
}) {
  const ext = message.fileName.split('.').pop()?.toLowerCase() ?? ''
  return (
    <>
      <div className="m-[3px] flex items-center gap-2.5 rounded-[9px] bg-wa-divider/60 p-2.5">
        <span
          className={cn(
            'flex h-10 w-8 shrink-0 items-center justify-center rounded-[4px] text-[9px] font-bold text-white uppercase',
            DOC_COLOURS[ext] ?? 'bg-wa-meta',
          )}
          aria-hidden
        >
          {ext ? ext.slice(0, 4) : <FileText className="size-4" />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] text-wa-text">{message.fileName}</p>
          <p className="text-[12px] text-wa-meta">
            {[ext.toUpperCase(), message.detail].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      {message.caption ? (
        <BubbleText text={message.caption} meta={meta} />
      ) : (
        <div className="flex justify-end px-2 pb-1">{meta}</div>
      )}
    </>
  )
}

/** Deterministic "waveform" so the preview does not shimmer between renders. */
const WAVE = [
  4, 7, 12, 9, 15, 11, 6, 14, 18, 10, 7, 13, 16, 9, 5, 11, 17, 12, 8, 14, 10, 6, 12, 15,
  9, 7, 11, 5,
]

export function VoiceBody({
  durationSec = 12,
  meta,
  avatar,
}: {
  durationSec?: number
  meta: ReactNode
  avatar: ReactNode
}) {
  return (
    <div className="flex w-[216px] items-center gap-2 px-2 pt-2 pb-1">
      <div className="relative shrink-0">
        {avatar}
        <Mic
          className="absolute -right-1 -bottom-0.5 size-4 rounded-full bg-wa-bubble-in p-0.5 text-wa-tick"
          aria-hidden
        />
      </div>
      <Play className="size-6 shrink-0 fill-current text-wa-meta" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex h-6 items-center gap-[2px] overflow-hidden" aria-hidden>
          {WAVE.map((h, i) => (
            <span
              key={i}
              className={cn(
                'w-[3px] rounded-full',
                i < 3 ? 'bg-wa-tick' : 'bg-wa-meta/60',
              )}
              style={{ height: h + 2 }}
            />
          ))}
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[11px] text-wa-meta">
          <span>{formatDuration(durationSec)}</span>
          {meta}
        </div>
      </div>
    </div>
  )
}
