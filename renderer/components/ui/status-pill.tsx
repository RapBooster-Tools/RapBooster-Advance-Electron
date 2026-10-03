'use client'

import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import type { CampaignStatus, DeviceStatus } from '@shared/types'

/**
 * Status colours from the prototype (SPRINTS.md §7): green for healthy, amber
 * for paused, grey for idle, red for terminal failure, blue for informational.
 * Colour is never the only signal — the pill always carries a word, and the
 * dot is decorative.
 */
export type StatusTone = 'ok' | 'warn' | 'idle' | 'danger' | 'info'
type Tone = StatusTone

const TONES: Record<Tone, string> = {
  ok: 'bg-status-ok-bg text-status-ok-fg',
  warn: 'bg-status-warn-bg text-status-warn-fg',
  idle: 'bg-status-idle-bg text-status-idle-fg',
  danger: 'bg-danger/12 text-danger',
  info: 'bg-status-info-bg text-status-info-fg',
}

const DEVICE_TONES: Record<DeviceStatus, Tone> = {
  connected: 'ok',
  connecting: 'warn',
  qr_pending: 'warn',
  pairing_pending: 'warn',
  disconnected: 'idle',
  logged_out: 'danger',
  banned: 'danger',
}

const DEVICE_LABELS: Record<DeviceStatus, string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  qr_pending: 'Awaiting scan',
  pairing_pending: 'Awaiting code',
  disconnected: 'Disconnected',
  logged_out: 'Logged out',
  banned: 'Banned',
}

const CAMPAIGN_TONES: Record<CampaignStatus, Tone> = {
  running: 'ok',
  scheduled: 'warn',
  paused: 'warn',
  draft: 'idle',
  completed: 'idle',
  failed: 'danger',
}

export function StatusPill({
  tone,
  children,
  dot = true,
  testId,
}: {
  tone: Tone
  children: ReactNode
  /** A leading dot helps scanning a column of pills; off for dense chips. */
  dot?: boolean
  testId?: string
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone],
      )}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

export function DeviceStatusPill({ status }: { status: DeviceStatus }) {
  return <StatusPill tone={DEVICE_TONES[status]}>{DEVICE_LABELS[status]}</StatusPill>
}

export function CampaignStatusPill({ status }: { status: CampaignStatus }) {
  return (
    <StatusPill tone={CAMPAIGN_TONES[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </StatusPill>
  )
}
