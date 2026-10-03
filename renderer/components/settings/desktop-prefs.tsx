'use client'

import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import type { IpcResponse } from '@shared/ipc'

type AppPrefs = IpcResponse<'app:getPrefs'>
type Toggle = 'notifications' | 'runInBackground' | 'startAtLogin'

const TOGGLES: ReadonlyArray<readonly [Toggle, string, string]> = [
  [
    'notifications',
    'Notify me about new messages',
    'Shows a desktop notification when a customer writes and RapBooster is not in front.',
  ],
  [
    'runInBackground',
    'Keep running when the window is closed',
    'Closing the window keeps campaigns sending. Quit from the tray icon to stop everything.',
  ],
  [
    'startAtLogin',
    'Start RapBooster when the computer starts',
    'Opens quietly in the tray, so campaigns and replies continue after a restart.',
  ],
]

/**
 * Settings → Desktop. Each switch saves the moment it changes — there is
 * nothing to review before applying a yes/no preference.
 */
export function DesktopPrefsSection() {
  const prefs = useIpcQuery('app:getPrefs')
  const version = useIpcQuery('system:version')
  const toast = useToast()
  const [pending, setPending] = useState<Partial<AppPrefs>>({})
  const platform = version.data?.platform

  /** Why a switch cannot be changed here, shown in place of its hint. */
  function lockedReason(key: Toggle): string | null {
    // macOS and Windows support login items; anywhere else the switch would lie.
    if (
      key === 'startAtLogin' &&
      platform &&
      platform !== 'darwin' &&
      platform !== 'win32'
    )
      return 'Not available on this operating system — add RapBooster to your startup applications instead.'
    // The Mac convention: closing a window never quits an app.
    if (key === 'runInBackground' && platform === 'darwin')
      return 'On a Mac, closing the window always keeps RapBooster running. Choose Quit (⌘Q) to stop it.'
    return null
  }

  async function toggle(key: Toggle, value: boolean) {
    setPending((p) => ({ ...p, [key]: value }))
    const result = await window.api.invoke('app:setPrefs', { [key]: value })
    if (result.ok) {
      toast('success', 'Saved')
      prefs.refetch()
    } else {
      toast('error', result.error.userMessage)
    }
    setPending((p) => {
      const next = { ...p }
      delete next[key]
      return next
    })
  }

  const current = prefs.data ? { ...prefs.data, ...pending } : undefined

  return (
    <section
      className="rounded-card border border-line bg-surface p-4"
      data-testid="desktop-prefs"
      data-help="settings-desktop"
    >
      <h2 className="mb-2 text-sm font-semibold text-ink">Desktop</h2>
      <p className="mb-3 text-xs text-ink-muted">
        How RapBooster behaves on this computer.
      </p>

      {current && (
        <div className="flex flex-col gap-3">
          {TOGGLES.map(([key, label, hint]) => {
            const locked = lockedReason(key)
            return (
              <label key={key} className="flex items-start justify-between gap-4 text-sm">
                <span>
                  <span className="font-semibold text-ink">{label}</span>
                  <span className="block text-xs text-ink-muted">{locked ?? hint}</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                  checked={
                    platform === 'darwin' && key === 'runInBackground'
                      ? true
                      : current[key]
                  }
                  disabled={locked !== null || key in pending}
                  onChange={(e) => void toggle(key, e.target.checked)}
                  data-testid={`pref-${key}`}
                />
              </label>
            )
          })}
        </div>
      )}
    </section>
  )
}
