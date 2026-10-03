'use client'

import { useState } from 'react'
import type { IpcResponse } from '@shared/ipc'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { useIpcQuery } from '@renderer/hooks/useIpc'

type Config = IpcResponse<'optout:getConfig'>

function ConfigForm({ initial, onSaved }: { initial: Config; onSaved: () => void }) {
  const toast = useToast()
  const [keywords, setKeywords] = useState(initial.keywords.join(', '))
  const [enabled, setEnabled] = useState(initial.confirmationEnabled)
  const [text, setText] = useState(initial.confirmationText)
  const [busy, setBusy] = useState(false)

  async function save() {
    const list = keywords
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k !== '')
    if (list.length === 0) {
      toast('error', 'Keep at least one opt-out keyword, such as STOP.')
      return
    }
    setBusy(true)
    const result = await window.api.invoke('optout:setConfig', {
      keywords: list,
      confirmationEnabled: enabled,
      confirmationText: text,
    })
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    toast('success', 'Opt-out settings saved')
    onSaved()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="optout-keywords" className="text-xs font-semibold text-ink">
          Opt-out keywords (comma-separated)
        </label>
        <input
          id="optout-keywords"
          data-testid="optout-keywords"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          className="rounded-control border border-line px-2.5 py-1.5 text-sm outline-none focus:border-primary"
        />
        <p className="text-[11px] text-ink-muted">
          A reply that is exactly one of these words, in any letter case, adds the number
          to the opt-out list. Replying START lifts an opt-out the contact made
          themselves.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          data-testid="optout-confirm-enabled"
        />
        Send a confirmation reply
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!enabled}
        rows={2}
        maxLength={500}
        aria-label="Confirmation reply"
        data-testid="optout-confirm-text"
        className="rounded-control border border-line px-2.5 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-50"
      />
      <div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void save()}
          disabled={busy}
          data-testid="optout-config-save"
        >
          Save settings
        </Button>
      </div>
    </div>
  )
}

/** Keyword and confirmation settings for automatic opt-outs. */
export function OptOutConfig() {
  const config = useIpcQuery('optout:getConfig')
  const [version, setVersion] = useState(0)

  return (
    <section
      className="rounded-card border border-line bg-surface p-4"
      data-testid="optout-config"
    >
      <h2 className="mb-3 text-sm font-semibold text-ink">Automatic opt-outs</h2>
      {config.data ? (
        <ConfigForm
          key={version}
          initial={config.data}
          onSaved={() => {
            setVersion((v) => v + 1)
            config.refetch()
          }}
        />
      ) : (
        <p className="text-xs text-ink-muted">Loading…</p>
      )}
    </section>
  )
}
