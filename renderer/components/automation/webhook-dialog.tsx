'use client'

import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { useToast } from '@renderer/components/providers/toast-provider'
import { webhookEvent, type WebhookEvent } from '@shared/types'
import { Field, INPUT_CLASS } from './field'

export const EVENT_LABEL: Record<WebhookEvent, string> = {
  'message.received': 'A message is received',
  'reply.attributed': 'A reply is credited to a campaign',
  'optout.added': 'A contact opts out',
  'chat.escalated': 'A chat is escalated to a human',
  'campaign.completed': 'A campaign completes',
  'sequence.completed': 'A contact completes a sequence',
  'call.rejected': 'A call is auto-rejected',
}

/** Shown once: the secret is never readable again after this dialog closes. */
function SecretView({ secret, onDone }: { secret: string; onDone: () => void }) {
  const toast = useToast()
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret)
      toast('success', 'Secret copied')
    } catch (err) {
      console.warn('clipboard write refused', err)
      toast('warning', 'Copy failed — select the secret and copy it by hand.')
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink">
        Copy this signing secret now. It is shown only once — use it to verify the{' '}
        <code className="text-xs">X-RapBooster-Signature</code> header (HMAC-SHA256 of the
        raw body).
      </p>
      <code
        data-testid="webhook-secret"
        className="break-all rounded-control border border-line bg-app-bg p-2 font-mono text-xs text-ink select-all"
      >
        {secret}
      </code>
      <div className="flex gap-2">
        <Button onClick={() => void copy()} data-testid="webhook-secret-copy">
          Copy secret
        </Button>
        <Button variant="primary" onClick={onDone} data-testid="webhook-secret-done">
          Done
        </Button>
      </div>
    </div>
  )
}

export function WebhookDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<WebhookEvent[]>(['message.received'])
  const [secret, setSecret] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function create() {
    setError(undefined)
    if (!/^https?:\/\//i.test(url.trim())) return setError('Enter an http(s) URL.')
    if (events.length === 0) return setError('Choose at least one event.')
    setBusy(true)
    const res = await window.api.invoke('webhook:create', { url: url.trim(), events })
    setBusy(false)
    if (!res.ok) return setError(res.error.userMessage)
    setSecret(res.data.secret)
    onCreated()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="New webhook"
      testId="webhook-dialog"
      width={520}
      footer={
        secret ? undefined : (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void create()}
              disabled={busy}
              data-testid="webhook-save"
            >
              {busy ? 'Creating…' : 'Create webhook'}
            </Button>
          </>
        )
      }
    >
      {secret ? (
        <SecretView secret={secret} onDone={onClose} />
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Endpoint URL" htmlFor="webhook-url">
            <input
              id="webhook-url"
              data-testid="webhook-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/hooks/whatsapp"
              className={INPUT_CLASS}
            />
          </Field>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1.5 text-xs font-semibold text-ink">Send when…</legend>
            {webhookEvent.options.map((e) => (
              <label key={e} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  data-testid={`webhook-event-${e}`}
                  checked={events.includes(e)}
                  onChange={() =>
                    setEvents((c) =>
                      c.includes(e) ? c.filter((x) => x !== e) : [...c, e],
                    )
                  }
                />
                {EVENT_LABEL[e]} <span className="text-xs text-ink-subtle">({e})</span>
              </label>
            ))}
          </fieldset>
          {error && (
            <p className="text-sm text-danger" role="alert" data-testid="webhook-error">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}
