import type { IpcResponse } from '@shared/ipc'
import type { AiProvider } from '@shared/types'

export type AiConfig = IpcResponse<'ai:getConfig'>['config']
export type AiKeys = IpcResponse<'ai:getConfig'>['keys']

/**
 * NOTE: the default models mirror `DEFAULT_MODELS` in
 * electron/main/services/ai/ai-config.ts. The renderer cannot import main, and
 * the main process still applies its own default when no model is stored, so a
 * drift here only changes what the field is pre-filled with.
 */
export const PROVIDERS: Array<{
  value: AiProvider
  label: string
  short: string
  defaultModel: string
  keyPlaceholder: string
}> = [
  {
    value: 'openai',
    label: 'OpenAI',
    short: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    keyPlaceholder: 'sk-...',
  },
  {
    value: 'anthropic',
    label: 'Anthropic (Claude)',
    short: 'Anthropic',
    defaultModel: 'claude-haiku-4-5',
    keyPlaceholder: 'sk-ant-...',
  },
  {
    value: 'gemini',
    label: 'Google Gemini',
    short: 'Gemini',
    defaultModel: 'gemini-2.5-flash',
    keyPlaceholder: 'AIza...',
  },
  {
    value: 'compatible',
    label: 'OpenAI-compatible (local or gateway)',
    short: 'Compatible',
    defaultModel: '',
    keyPlaceholder: 'Optional for local servers',
  },
]

/** Where each provider's key is stored — written through `settings:set`. */
export const KEY_SETTING: Record<AiProvider, string> = {
  openai: 'ai.apiKey',
  anthropic: 'ai.anthropicKey',
  gemini: 'ai.geminiKey',
  compatible: 'ai.compatibleKey',
}

export function providerInfo(value: AiProvider) {
  return PROVIDERS.find((p) => p.value === value) ?? PROVIDERS[0]!
}
