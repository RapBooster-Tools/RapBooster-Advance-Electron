'use client'

import { Check } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import type { AiProvider } from '@shared/types'
import { Field, INPUT, Panel } from './form'
import {
  KEY_SETTING,
  PROVIDERS,
  providerInfo,
  type AiConfig,
  type AiKeys,
} from './providers'

/**
 * Which model answers, and the key it uses. Keys are write-only: the screen
 * only ever learns whether one is stored, never its value.
 */
export function AiProviderPanel({
  config,
  keys,
  onChange,
  onKeySaved,
}: {
  config: AiConfig
  keys: AiKeys | undefined
  onChange: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void
  onKeySaved: () => void
}) {
  const toast = useToast()
  const [keyDraft, setKeyDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const info = providerInfo(config.provider)

  function switchProvider(next: AiProvider) {
    // Carry a custom model over only when it was not just the old default —
    // "gpt-4o-mini" means nothing to Anthropic.
    const wasDefault = config.model === info.defaultModel || config.model.trim() === ''
    onChange('provider', next)
    if (wasDefault) onChange('model', providerInfo(next).defaultModel)
    setKeyDraft('')
  }

  async function saveKey() {
    if (keyDraft.trim() === '') return
    setBusy(true)
    const stored = await window.api.invoke('settings:set', {
      key: KEY_SETTING[config.provider],
      value: keyDraft.trim(),
      encrypt: true,
    })
    setBusy(false)
    if (!stored.ok) {
      toast('error', stored.error.userMessage)
      return
    }
    setKeyDraft('')
    onKeySaved()

    // The key can be stored unencrypted when the OS keychain is unavailable.
    // Saying "saved" and nothing else would leave the user believing a secret is
    // protected when it is sitting in the clear on disk (CLAUDE.md §5.6).
    if (stored.data.wantedEncryption && !stored.data.encrypted) {
      toast(
        'error',
        'API key saved, but this system has no secure storage available, so it is stored unencrypted on disk.',
      )
      return
    }
    toast('success', 'API key saved')
  }

  async function checkKey() {
    setBusy(true)
    const result = await window.api.invoke('chatbot:testKey', {
      provider: config.provider,
      ...(keyDraft.trim() !== '' ? { apiKey: keyDraft.trim() } : {}),
    })
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    if (result.data.valid) toast('success', 'The API key works.')
    else toast('error', result.data.detail ?? 'The API key was rejected.')
  }

  const hasKey = keys?.[config.provider] ?? false

  return (
    <Panel title="AI Provider">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Provider" htmlFor="ai-provider">
          <select
            id="ai-provider"
            data-testid="ai-provider"
            value={config.provider}
            onChange={(e) => switchProvider(e.target.value as AiProvider)}
            className={INPUT}
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Model" htmlFor="ai-model">
          <input
            id="ai-model"
            data-testid="ai-model"
            value={config.model}
            onChange={(e) => onChange('model', e.target.value)}
            placeholder={info.defaultModel || 'e.g. llama3.1'}
            className={INPUT}
          />
        </Field>
        {config.provider === 'compatible' && (
          <Field
            label="Base URL"
            htmlFor="ai-base-url"
            hint="An OpenAI-compatible endpoint, e.g. http://localhost:11434/v1"
          >
            <input
              id="ai-base-url"
              data-testid="ai-base-url"
              value={config.baseUrl ?? ''}
              onChange={(e) =>
                onChange('baseUrl', e.target.value.trim() === '' ? null : e.target.value)
              }
              placeholder="http://localhost:11434/v1"
              className={INPUT}
            />
          </Field>
        )}
      </div>

      <Field
        label={`${info.label} API key`}
        htmlFor="ai-key"
        hint="Stored encrypted on this computer using the OS keychain, and sent only to the selected provider."
      >
        <input
          id="ai-key"
          type="password"
          data-testid="ai-key"
          value={keyDraft}
          onChange={(e) => setKeyDraft(e.target.value)}
          placeholder={
            hasKey ? 'A key is saved — type to replace it' : info.keyPlaceholder
          }
          className={INPUT}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void saveKey()} disabled={busy} data-testid="save-ai-key">
          Save key
        </Button>
        <Button onClick={() => void checkKey()} disabled={busy} data-testid="test-ai-key">
          Test key
        </Button>
        <ul className="ml-auto flex flex-wrap gap-1.5" aria-label="Saved keys">
          {PROVIDERS.map((p) => (
            <li
              key={p.value}
              data-testid={`ai-key-status-${p.value}`}
              data-saved={keys?.[p.value] ? 'true' : 'false'}
              className={
                keys?.[p.value]
                  ? 'flex items-center gap-1 rounded bg-status-ok-bg px-2 py-0.5 text-xs text-status-ok-fg'
                  : 'rounded bg-status-idle-bg px-2 py-0.5 text-xs text-status-idle-fg'
              }
            >
              {keys?.[p.value] && <Check className="size-3" aria-hidden />}
              {p.short} {keys?.[p.value] ? 'saved' : 'no key'}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}
