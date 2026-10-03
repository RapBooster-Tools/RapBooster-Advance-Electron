'use client'

import { ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { StatusPill } from '@renderer/components/ui/status-pill'
import type { IpcResponse } from '@shared/ipc'
import { UsageBar } from './usage-bar'

export type DeviceRow = IpcResponse<'device:list'>[number]

/** Matches WARMUP_RAMP's length in main: after day 10 the global cap applies. */
const RAMP_DAYS = 10

function warmupCaption(device: DeviceRow): string {
  if (!device.warmupEnabled || device.warmupDay === null) {
    return 'Turning warmup on starts the ramp at day 1.'
  }
  const cap =
    device.effectiveCap === null ? 'no cap' : `today's cap ${device.effectiveCap}`
  if (device.warmupDay > RAMP_DAYS) return `Ramp complete · ${cap}`
  return `Day ${device.warmupDay} · ${cap}`
}

/**
 * The anti-ban controls for one device: warmup, today's usage against its cap,
 * a safety pause the health breaker set, and Business-account detection.
 * Everything here changes through main and comes back as `device:updated`.
 */
export function DeviceSafety({
  device,
  onChanged,
}: {
  device: DeviceRow
  onChanged: () => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  // The switch follows the click at once and settles when main's answer comes
  // back as a refreshed row; a switch that lags its own click reads as broken.
  const [pendingWarmup, setPendingWarmup] = useState<boolean>()
  if (pendingWarmup !== undefined && pendingWarmup === device.warmupEnabled) {
    setPendingWarmup(undefined)
  }

  async function setWarmup(enabled: boolean) {
    setBusy(true)
    setPendingWarmup(enabled)
    const result = await window.api.invoke('device:setWarmup', { id: device.id, enabled })
    setBusy(false)
    if (!result.ok) {
      setPendingWarmup(undefined)
      toast('error', result.error.userMessage)
    } else
      toast(
        'success',
        enabled ? 'Warmup on — starting at day 1' : 'Warmup off — the normal cap applies',
      )
    onChanged()
  }

  async function resume() {
    setBusy(true)
    const result = await window.api.invoke('device:clearHealthPause', { id: device.id })
    setBusy(false)
    if (!result.ok) toast('error', result.error.userMessage)
    onChanged()
  }

  async function recheck() {
    setBusy(true)
    const result = await window.api.invoke('device:syncLabels', { id: device.id })
    setBusy(false)
    if (!result.ok) toast('error', result.error.userMessage)
    else
      toast(
        'info',
        result.data.isBusiness
          ? 'This is a WhatsApp Business account.'
          : 'This is a regular WhatsApp account.',
      )
    onChanged()
  }

  const paused = device.healthPausedUntil !== null

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      {paused && (
        <div
          className="flex items-start gap-2 rounded bg-status-warn-bg px-2 py-1.5 text-xs text-status-warn-fg"
          data-testid="health-paused"
          role="status"
        >
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Paused for safety</p>
            <p>
              {device.healthReason ?? 'Recent sends failed at an unusual rate.'} Resumes{' '}
              {new Date(device.healthPausedUntil ?? '').toLocaleString()}.
            </p>
          </div>
          <Button size="sm" onClick={resume} disabled={busy} data-testid="resume-device">
            Resume now
          </Button>
        </div>
      )}

      <UsageBar
        sent={device.dailySentCount}
        cap={device.effectiveCap}
        paused={paused}
        testId="device-usage"
      />

      <label className="flex items-center justify-between gap-2 text-xs">
        <span className="flex flex-col">
          <span className="font-semibold text-ink">Warmup</span>
          <span className="text-ink-muted" data-testid="warmup-caption">
            {warmupCaption(device)}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="size-4 accent-primary"
          checked={pendingWarmup ?? device.warmupEnabled}
          disabled={busy}
          onChange={(e) => void setWarmup(e.target.checked)}
          data-testid="warmup-toggle"
        />
      </label>

      <div className="flex items-center justify-between gap-2 text-xs">
        {device.isBusiness ? (
          <span data-testid="business-badge">
            <StatusPill tone="ok">Business</StatusPill>
          </span>
        ) : (
          <span className="text-ink-muted">Regular account</span>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={recheck}
          disabled={busy || device.status !== 'connected'}
          data-testid="recheck-business"
        >
          Re-check
        </Button>
      </div>
    </div>
  )
}
