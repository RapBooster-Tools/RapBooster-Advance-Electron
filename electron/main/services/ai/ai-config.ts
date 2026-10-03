/**
 * AI configuration (D89): provider, model, request shaping and guard-rails, plus
 * the auto-responder's business settings from the AI Bot screen.
 *
 * WHY an in-memory cache: before this, every inbound message read six or more
 * Setting rows and the ChatbotConfig row before deciding anything. Both are
 * cached here and dropped whenever their own save path runs. API keys are the
 * exception — they are written through the generic `settings:set` channel, so
 * the key for the active provider is read fresh on every call (one row).
 */
import { z } from 'zod'
import type { IpcResponse } from '../../../../shared/ipc'
import type { AiProvider } from '../../../../shared/types'
import { getPrisma } from '../../db/client'
import { decryptValue } from '../secure-store'
import type { ChatbotSettings } from './prompt'

export type AiConfig = IpcResponse<'ai:setConfig'>
export type AiKeyStatus = IpcResponse<'ai:getConfig'>['keys']

/** Until REQUIREMENTS §5 names one — assumption A5. */
export const DEFAULT_MODEL = 'gpt-4o-mini'

/** The cheap, fast tier of each provider. `compatible` has no sensible default. */
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: DEFAULT_MODEL,
  anthropic: 'claude-haiku-4-5',
  gemini: 'gemini-2.5-flash',
  compatible: '',
}

/** Where each provider's key is stored. `ai.apiKey` predates multi-provider support. */
export const KEY_SETTING: Record<AiProvider, string> = {
  openai: 'ai.apiKey',
  anthropic: 'ai.anthropicKey',
  gemini: 'ai.geminiKey',
  compatible: 'ai.compatibleKey',
}

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  compatible: 'OpenAI-compatible',
}

const NUMERIC_DEFAULTS = {
  maxTokens: 500,
  temperature: 0.7,
  historyDepth: 10,
  dailyCapPerDevice: 500,
  dailyCapPerChat: 20,
  coalesceSeconds: 5,
} as const

const CONFIG_KEYS = [
  'provider',
  'model',
  'baseUrl',
  ...Object.keys(NUMERIC_DEFAULTS),
  'approveBeforeSend',
].map((k) => `ai.${k}`)

const providerSchema = z.enum(['openai', 'anthropic', 'gemini', 'compatible'])

/** Mirrors secure-store's marker for a value it could not encrypt. */
const PLAINTEXT_PREFIX = 'plain:'

let cachedConfig: AiConfig | undefined

function numberOr(raw: string | undefined, fallback: number): number {
  const parsed = raw === undefined ? NaN : Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function getAiConfig(): Promise<AiConfig> {
  if (cachedConfig) return cachedConfig

  const rows = await getPrisma().setting.findMany({
    where: { key: { in: CONFIG_KEYS } },
    take: CONFIG_KEYS.length,
  })
  const raw = new Map(rows.map((r) => [r.key.slice('ai.'.length), r.value]))

  const provider = providerSchema.safeParse(raw.get('provider'))
  const resolved: AiProvider = provider.success ? provider.data : 'openai'
  const model = raw.get('model')?.trim()
  const baseUrl = raw.get('baseUrl')?.trim()

  cachedConfig = {
    provider: resolved,
    model: model || DEFAULT_MODELS[resolved] || DEFAULT_MODEL,
    baseUrl: baseUrl ? baseUrl : null,
    maxTokens: numberOr(raw.get('maxTokens'), NUMERIC_DEFAULTS.maxTokens),
    temperature: numberOr(raw.get('temperature'), NUMERIC_DEFAULTS.temperature),
    historyDepth: numberOr(raw.get('historyDepth'), NUMERIC_DEFAULTS.historyDepth),
    dailyCapPerDevice: numberOr(
      raw.get('dailyCapPerDevice'),
      NUMERIC_DEFAULTS.dailyCapPerDevice,
    ),
    dailyCapPerChat: numberOr(
      raw.get('dailyCapPerChat'),
      NUMERIC_DEFAULTS.dailyCapPerChat,
    ),
    approveBeforeSend: raw.get('approveBeforeSend') === 'true',
    coalesceSeconds: numberOr(
      raw.get('coalesceSeconds'),
      NUMERIC_DEFAULTS.coalesceSeconds,
    ),
  }
  return cachedConfig
}

export async function saveAiConfig(config: AiConfig): Promise<AiConfig> {
  const prisma = getPrisma()
  const entries = Object.entries(config).map(([field, value]) => ({
    key: `ai.${field}`,
    value: value === null ? '' : String(value),
  }))
  await prisma.$transaction(
    entries.map(({ key, value }) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value, isEncrypted: false },
        update: { value, isEncrypted: false },
      }),
    ),
  )
  cachedConfig = undefined
  return getAiConfig()
}

/** Drop the cached config — for anything that writes `ai.*` rows directly. */
export function invalidateAiConfig(): void {
  cachedConfig = undefined
}

/** The decrypted key for a provider, or null. Never cached: see the file comment. */
export async function readKey(provider: AiProvider): Promise<string | null> {
  const row = await getPrisma().setting.findUnique({
    where: { key: KEY_SETTING[provider] },
  })
  if (!row) return null
  // WHY the prefix check: when the OS keychain is unavailable, secure-store
  // writes `plain:<key>` with isEncrypted=false. Reading that row raw sent the
  // prefix to the provider as part of the key, so every call was rejected.
  // decryptValue strips the prefix without touching safeStorage.
  const value =
    row.isEncrypted || row.value.startsWith(PLAINTEXT_PREFIX)
      ? decryptValue(row.value)
      : row.value
  return value && value.trim() !== '' ? value.trim() : null
}

/** Which providers have a key stored — never the key itself. */
export async function keyStatus(): Promise<AiKeyStatus> {
  const rows = await getPrisma().setting.findMany({
    where: { key: { in: Object.values(KEY_SETTING) } },
    select: { key: true, value: true },
    take: 4,
  })
  const present = new Set(rows.filter((r) => r.value.trim() !== '').map((r) => r.key))
  return {
    openai: present.has(KEY_SETTING.openai),
    anthropic: present.has(KEY_SETTING.anthropic),
    gemini: present.has(KEY_SETTING.gemini),
    compatible: present.has(KEY_SETTING.compatible),
  }
}

export type BotSettings = ChatbotSettings & {
  enabled: boolean
  responseDelay: number
  escalationMessage: string | null
  escalateAfterMessages: number
  escalateAfterMinutes: number
}

let cachedBot: BotSettings | null | undefined

export function parseKeywords(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((k): k is string => typeof k === 'string')
      : []
  } catch (err) {
    // Written only by chatbot:save as JSON; an unreadable value means no
    // custom keywords, and the defaults in `shouldEscalate` apply.
    console.debug('chatbot: unreadable escalation keywords, using defaults', err)
    return []
  }
}

export async function loadBotSettings(): Promise<BotSettings | null> {
  if (cachedBot !== undefined) return cachedBot

  const config = await getPrisma().chatbotConfig.findUnique({
    where: { id: 'singleton' },
  })
  cachedBot = config
    ? {
        enabled: config.enabled,
        responseDelay: config.responseDelay,
        systemInstructions: config.systemInstructions,
        businessName: config.businessName,
        businessEmail: config.businessEmail,
        businessPhone: config.businessPhone,
        tone: config.tone,
        industry: config.industry,
        primaryGoal: config.primaryGoal,
        responseStyle: config.responseStyle,
        language: config.language,
        escalationTrigger: config.escalationTrigger,
        escalationKeywords: parseKeywords(config.escalationKeywords),
        products: config.products,
        knowledgeBase: config.knowledgeBase,
        escalationMessage: config.escalationMessage,
        escalateAfterMessages: config.escalateAfterMessages,
        escalateAfterMinutes: config.escalateAfterMinutes,
      }
    : null
  return cachedBot
}

export function invalidateBotSettings(): void {
  cachedBot = undefined
}
