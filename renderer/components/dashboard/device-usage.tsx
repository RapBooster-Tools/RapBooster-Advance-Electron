'use client'

import { UsageBar } from '@renderer/components/devices/usage-bar'
import { StatusPill } from '@renderer/components/ui/status-pill'
import type { IpcResponse } from '@shared/ipc'

type DeviceUsageRow = IpcResponse<'system:analytics'>['devices'][number]

/** Each device's sends today against its cap, with warmup and safety pauses. */
export function DeviceUsage({ devices }: { devices: DeviceUsageRow[] }) {
  return (
    <section
      className="rounded-card border border-line bg-surface p-4"
      data-testid="device-usage-panel"
      data-tour="dashboard-usage"
    >
      <h2 className="mb-2 text-sm font-semibold text-ink">Device usage today</h2>
      {devices.length === 0 ? (
        <p className="text-xs text-ink-muted">No devices linked yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {devices.map((d) => (
            <li key={d.deviceId} data-testid="dashboard-device">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-sm text-ink">{d.name}</span>
                <span className="flex shrink-0 gap-1">
                  {d.warmupCap !== null && <StatusPill tone="idle">Warmup</StatusPill>}
                  {d.healthPausedUntil && (
                    <StatusPill tone="warn">Paused for safety</StatusPill>
                  )}
                </span>
              </div>
              <UsageBar
                sent={d.sentToday}
                cap={d.cap}
                paused={d.healthPausedUntil !== null}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
