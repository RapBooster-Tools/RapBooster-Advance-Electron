/**
 * One completion call, four providers (D89).
 *
 * OpenAI and any OpenAI-compatible endpoint go through the official SDK.
 * Anthropic and Gemini are plain `fetch` calls: each is one POST with a stable
 * shape, and a second and third SDK would add supply-chain surface to the code
 * path that sends model output to the user's customers.
 *
 * Every failure becomes an `AppError` from the shared taxonomy, so the
 * responder can tell "the key is wrong" from "slow down" from "timed out".
 */
import OpenAI from 'openai'
import { AppError } from '../../../../shared/errors'
import type { AiProvider } from '../../../../shared/types'
import { PROVIDER_LABEL } from './ai-config'
import type { HistoryMessage } from './prompt'

const REQUEST_TIMEOUT_MS = 30_000
const ANTHROPIC_VERSION = '2023-06-01'

export interface CompletionRequest {
  provider: AiProvider
  model: string
  /** Only used by `compatible`. */
  baseUrl: string | null
  apiKey: string | null
  system: string
  /** Conversation in order, ending with the customer's latest message. */
  turns: HistoryMessage[]
  maxTokens: number
  temperature: number
}

export interface Completion {
  text: string
  promptTokens: number
  completionTokens: number
}

/**
 * WHY the env overrides exist: without a redirectable endpoint none of this
 * could be tested, and a wrong reply here goes to a real person. They also
 * serve a real gateway or corporate egress proxy. Mirrors LICENSE_API_URL.
 */
function envBase(name: string, fallback: string): string {
  return (process.env[name]?.trim() || fallback).replace(/\/+$/, '')
}

function openAiClient(provider: AiProvider, key: string | null, baseUrl: string | null) {
  const baseURL =
    provider === 'compatible'
      ? (baseUrl ?? undefined)
      : process.env.OPENAI_BASE_URL?.trim() || undefined
  return new OpenAI({
    // A local OpenAI-compatible server often needs no key, but the SDK insists
    // on one; any placeholder is accepted by servers that ignore it.
    apiKey: key ?? 'not-required',
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 1,
    ...(baseURL ? { baseURL } : {}),
  })
}

/** Map a provider failure onto the app's taxonomy so the UI can be specific. */
export function mapProviderError(provider: AiProvider, err: unknown): AppError {
  if (err instanceof AppError) return err
  const status = (err as { status?: number } | undefined)?.status
  const message = err instanceof Error ? err.message : String(err)
  const label = PROVIDER_LABEL[provider]

  if (status === 401 || status === 403) {
    return new AppError('AI_KEY_INVALID', {
      userMessage: `The ${label} API key was rejected. Check it on the AI Bot screen.`,
      detail: message,
    })
  }
  if (status === 429) {
    return new AppError('AI_RATE_LIMITED', {
      userMessage: `${label} is rate limiting requests. Auto-replies will resume shortly.`,
      detail: message,
    })
  }
  if (
    /timeout|timed out|aborted/i.test(message) ||
    (err as Error)?.name === 'TimeoutError'
  ) {
    return new AppError('AI_TIMEOUT', {
      userMessage: `The ${label} request timed out.`,
      detail: message,
    })
  }
  return new AppError('UNKNOWN', {
    userMessage: `The ${label} request failed.`,
    detail: message,
  })
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    // The body is the provider's error description — never the prompt.
    super(`HTTP ${status}: ${body.slice(0, 300)}`)
  }
}

async function httpJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const text = await res.text()
  if (!res.ok) throw new HttpError(res.status, text)
  return text === '' ? {} : (JSON.parse(text) as unknown)
}

/**
 * Anthropic and Gemini reject a conversation that opens with the assistant,
 * and a coalesced burst is several user turns in a row. Merge runs of one role
 * and drop anything before the first customer turn.
 */
function alternate(turns: HistoryMessage[]): HistoryMessage[] {
  const out: HistoryMessage[] = []
  for (const turn of turns) {
    if (out.length === 0 && turn.role !== 'user') continue
    const last = out[out.length - 1]
    if (last && last.role === turn.role) last.content = `${last.content}\n${turn.content}`
    else out.push({ ...turn })
  }
  return out
}

async function completeOpenAi(req: CompletionRequest): Promise<Completion> {
  const completion = await openAiClient(
    req.provider,
    req.apiKey,
    req.baseUrl,
  ).chat.completions.create({
    model: req.model,
    max_tokens: req.maxTokens,
    temperature: req.temperature,
    messages: [{ role: 'system', content: req.system }, ...req.turns],
  })
  return {
    text: completion.choices[0]?.message?.content?.trim() ?? '',
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
  }
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

function anthropicHeaders(key: string | null): Record<string, string> {
  return { 'x-api-key': key ?? '', 'anthropic-version': ANTHROPIC_VERSION }
}

async function completeAnthropic(req: CompletionRequest): Promise<Completion> {
  const base = envBase('ANTHROPIC_BASE_URL', 'https://api.anthropic.com')
  const data = (await httpJson(`${base}/v1/messages`, anthropicHeaders(req.apiKey), {
    model: req.model,
    max_tokens: req.maxTokens,
    // Anthropic's range is 0–1; the shared setting allows OpenAI's 0–2.
    temperature: Math.min(1, req.temperature),
    system: req.system,
    messages: alternate(req.turns),
  })) as AnthropicResponse
  return {
    text: (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')
      .trim(),
    promptTokens: data.usage?.input_tokens ?? 0,
    completionTokens: data.usage?.output_tokens ?? 0,
  }
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

function geminiHeaders(key: string | null): Record<string, string> {
  // NOTE: the key travels in a header, never `?key=` — a URL ends up in proxy
  // logs, crash reports and our own request logging.
  return { 'x-goog-api-key': key ?? '' }
}

async function completeGemini(req: CompletionRequest): Promise<Completion> {
  const base = envBase('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com')
  const model = encodeURIComponent(req.model)
  const data = (await httpJson(
    `${base}/v1beta/models/${model}:generateContent`,
    geminiHeaders(req.apiKey),
    {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: alternate(req.turns).map((t) => ({
        role: t.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: t.content }],
      })),
      generationConfig: {
        maxOutputTokens: req.maxTokens,
        temperature: req.temperature,
        // WHY: 2.5 Flash "thinks" by default and the thinking tokens come out of
        // maxOutputTokens, so a 500-token budget can return an empty reply. A
        // short chat answer gains nothing from it.
        ...(/^gemini-2\.5-flash/.test(req.model)
          ? { thinkingConfig: { thinkingBudget: 0 } }
          : {}),
      },
    },
  )) as GeminiResponse
  const parts = data.candidates?.[0]?.content?.parts ?? []
  return {
    text: parts
      .map((p) => p.text ?? '')
      .join('')
      .trim(),
    promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
    completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  }
}

export async function complete(req: CompletionRequest): Promise<Completion> {
  try {
    switch (req.provider) {
      case 'anthropic':
        return await completeAnthropic(req)
      case 'gemini':
        return await completeGemini(req)
      default:
        return await completeOpenAi(req)
    }
  } catch (err) {
    throw mapProviderError(req.provider, err)
  }
}

/** One call that costs nothing — listing models — to prove a key works. */
export async function probeKey(
  provider: AiProvider,
  key: string | null,
  baseUrl: string | null,
): Promise<void> {
  try {
    if (provider === 'anthropic') {
      const base = envBase('ANTHROPIC_BASE_URL', 'https://api.anthropic.com')
      await httpJson(`${base}/v1/models`, anthropicHeaders(key), undefined)
    } else if (provider === 'gemini') {
      const base = envBase('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com')
      await httpJson(`${base}/v1beta/models`, geminiHeaders(key), undefined)
    } else {
      await openAiClient(provider, key, baseUrl).models.list()
    }
  } catch (err) {
    throw mapProviderError(provider, err)
  }
}
