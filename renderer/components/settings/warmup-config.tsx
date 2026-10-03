'use client'

import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import type { IpcResponse } from '@shared/ipc'

type WarmupConfig = IpcResponse<'warmup:getConfig'>

/**
 * Warmup conversations: devices with warmup on chat with each other a few
 * times a day. Turning warmup on for a device happens on the Devices screen.
 */
export function WarmupConfigPanel() {
  const config = useIpcQuery('warmup:getConfig')
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [edits, setEdits] = useState<Partial<WarmupConfig>>({})
  const current = config.data ? { ...config.data, ...edits } : undefined

  async function save() {
    if (!current) return
    setBusy(true)
    const result = await window.api.invoke('warmup:setConfig', current)
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    setEdits({})
    config.refetch()
    toast('success', 'Warmup settings saved')
  }

  if (!current) return null

  return (
    <div className="mt-4 rounded-card border border-line p-3" data-testid="warmup-config">
      <h3 className="text-sm font-semibold text-ink">Warmup</h3>
      <p className="mt-1 text-xs text-ink-muted">
        A device in warmup starts at 20 messages a day and ramps up to your daily cap over
        ten days. With two or more warmup devices connected, they also exchange a few
        short, everyday messages with each other — spread across the day and outside quiet
        hours — so each number builds a history of real two-way chat. These count toward
        each device&rsquo;s daily cap.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={current.autoConversations}
            onChange={(e) =>
              setEdits((x) => ({ ...x, autoConversations: e.target.checked }))
            }
            data-testid="warmup-auto"
          />
          Warmup conversations between my devices
        </label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="warmup-per-day" className="text-xs font-semibold text-ink">
            Conversations per day
          </label>
          <input
            id="warmup-per-day"
            type="number"
            min={1}
            max={50}
            value={current.conversationsPerDay}
            disabled={!current.autoConversations}
            onChange={(e) =>
              setEdits((x) => ({ ...x, conversationsPerDay: Number(e.target.value) }))
            }
            data-testid="warmup-per-day"
            className="w-28 rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <Button onClick={save} disabled={busy} data-testid="save-warmup">
          Save warmup
        </Button>
      </div>
    </div>
  )
}
