'use client'

import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { useIpcQuery } from '@renderer/hooks/useIpc'

const NOTICE_KEY = 'notice.safetyDefaults'

/**
 * One-time notice that the safety defaults (D80) are on. Shown until dismissed;
 * the dismissal is stored, so it never returns on this install.
 */
export function SafetyBanner() {
  const notice = useIpcQuery('settings:get', { key: NOTICE_KEY })
  const toast = useToast()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || notice.loading || notice.error || notice.data?.value !== null) {
    return null
  }

  async function dismiss() {
    setDismissed(true)
    const result = await window.api.invoke('settings:set', {
      key: NOTICE_KEY,
      value: new Date().toISOString(),
    })
    if (!result.ok) toast('error', result.error.userMessage)
  }

  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-card border border-primary/30 bg-primary/5 px-4 py-3"
      role="status"
      data-testid="safety-banner"
    >
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <p className="flex-1 text-sm text-ink">
        New safety defaults are on: 200 messages per device per day and quiet hours
        21:00–09:00. You can change them in Settings.
      </p>
      <Button size="sm" onClick={dismiss} data-testid="dismiss-safety-banner">
        Dismiss
      </Button>
    </div>
  )
}
