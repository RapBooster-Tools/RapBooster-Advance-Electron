/**
 * Shared setup for the AI suite: one local HTTP stub that answers as OpenAI,
 * Anthropic or Gemini depending on the path, a launcher that points every
 * provider at it, and helpers that drive inbound WhatsApp traffic through the
 * mock transport. Nothing here talks to a real provider or a real account.
 */
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { APP_READY_TIMEOUT_MS } from './constants'

export interface StubRequest {
  method: string
  path: string
  headers: IncomingHttpHeaders
  body: unknown
}

export const STUB_USAGE = { prompt: 11, completion: 7 }

/** Answers in each provider's own response shape, with fixed token counts. */
export class AiStub {
  requests: StubRequest[] = []
  reply = 'Stub reply.'
  private server: Server | undefined
  base = ''

  /** Model calls only — key probes (GET …/models) are not completions. */
  get completions(): StubRequest[] {
    return this.requests.filter((r) => r.method === 'POST')
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let raw = ''
      req.on('data', (c: Buffer) => (raw += c.toString()))
      req.on('end', () => {
        const path = req.url ?? ''
        this.requests.push({
          method: req.method ?? 'GET',
          path,
          headers: req.headers,
          body: raw === '' ? null : (JSON.parse(raw) as unknown),
        })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(this.answer(req.method ?? 'GET', path)))
      })
    })
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve))
    this.base = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()))
  }

  reset(): void {
    this.requests = []
    this.reply = 'Stub reply.'
  }

  private answer(method: string, path: string): unknown {
    if (method === 'GET') return { data: [], models: [] }
    if (path.endsWith('/v1/messages')) {
      return {
        id: 'msg_stub',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: this.reply }],
        usage: { input_tokens: STUB_USAGE.prompt, output_tokens: STUB_USAGE.completion },
      }
    }
    if (path.includes(':generateContent')) {
      return {
        candidates: [{ content: { role: 'model', parts: [{ text: this.reply }] } }],
        usageMetadata: {
          promptTokenCount: STUB_USAGE.prompt,
          candidatesTokenCount: STUB_USAGE.completion,
        },
      }
    }
    return {
      id: 'chatcmpl-stub',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'stub',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: this.reply },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: STUB_USAGE.prompt,
        completion_tokens: STUB_USAGE.completion,
        total_tokens: STUB_USAGE.prompt + STUB_USAGE.completion,
      },
    }
  }
}

export interface AiApp {
  app: ElectronApplication
  win: Page
  dir: string
  injectFile: string
  sendLogFile: string
}

export async function launchAiApp(
  dir: string,
  stub: AiStub,
  extraEnv: Record<string, string> = {},
): Promise<AiApp> {
  const injectFile = join(dir, 'inject.jsonl')
  const sendLogFile = join(dir, 'sends.jsonl')
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${dir}`],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: undefined,
      LICENSE_SERVICE: 'mock',
      WA_TRANSPORT: 'mock',
      WA_MOCK_INJECT: injectFile,
      WA_MOCK_SEND_LOG: sendLogFile,
      OPENAI_BASE_URL: `${stub.base}/v1`,
      ANTHROPIC_BASE_URL: stub.base,
      GEMINI_BASE_URL: stub.base,
      NODE_ENV: 'test',
      ...extraEnv,
    } as NodeJS.ProcessEnv,
  })

  const win = await app.firstWindow()
  await win
    .locator('[data-testid="license-key"], [data-testid="nav-dashboard"]')
    .first()
    .waitFor({ state: 'visible', timeout: APP_READY_TIMEOUT_MS })
  if (await win.getByTestId('license-key').isVisible()) {
    const field = win.getByTestId('license-key')
    await field.fill('VALID-E2E-0001')
    await expect(field).toHaveValue('VALID-E2E-0001')
    await win.getByTestId('license-activate').click()
  }
  await win
    .getByTestId('nav-dashboard')
    .waitFor({ state: 'visible', timeout: APP_READY_TIMEOUT_MS })
  return { app, win, dir, injectFile, sendLogFile }
}

export interface ArmOptions {
  ai?: Record<string, unknown>
  bot?: Record<string, unknown>
  key?: { setting: string; value: string }
}

/**
 * Enable the bot with no human-realism delays — pacing is not what these specs
 * measure — then apply the spec's own AI and chatbot settings.
 */
export async function armBot(win: Page, options: ArmOptions = {}): Promise<void> {
  await win.evaluate(async ({ ai, bot, key }) => {
    const current = await window.api.invoke('chatbot:get')
    if (!current.ok) throw new Error('chatbot:get failed')
    const saved = await window.api.invoke('chatbot:save', {
      ...current.data,
      enabled: true,
      systemInstructions: 'Be brief and kind.',
      responseDelay: 0,
      ...(bot ?? {}),
    })
    if (!saved.ok) throw new Error(`chatbot:save failed: ${saved.error.userMessage}`)

    const config = await window.api.invoke('ai:getConfig')
    if (!config.ok) throw new Error('ai:getConfig failed')
    const set = await window.api.invoke('ai:setConfig', {
      ...config.data.config,
      coalesceSeconds: 0,
      ...(ai ?? {}),
    })
    if (!set.ok) throw new Error(`ai:setConfig failed: ${set.error.userMessage}`)

    if (key)
      await window.api.invoke('settings:set', { key: key.setting, value: key.value })
    await window.api.invoke('settings:setSendingDefaults', { delayFrom: 0, delayTo: 0 })
  }, options)
}

/** Create and connect one mock device; resolves once it reports connected. */
export async function connectDevice(win: Page): Promise<string> {
  const id = await win.evaluate(async () => {
    const created = await window.api.invoke('device:create', { name: 'AI Device' })
    if (!created.ok) throw new Error('device:create failed')
    await window.api.invoke('device:connect', { id: created.data.id })
    return created.data.id
  })
  await expect
    .poll(
      () =>
        win.evaluate(async (deviceId) => {
          const list = await window.api.invoke('device:list')
          return list.ok ? list.data.find((d) => d.id === deviceId)?.status : undefined
        }, id),
      { timeout: 30_000 },
    )
    .toBe('connected')
  return id
}

export function inject(ctx: AiApp, from: string, ...bodies: string[]): void {
  appendFileSync(
    ctx.injectFile,
    bodies
      .map(
        (body) => `${JSON.stringify({ type: 'message', deviceId: '*', from, body })}\n`,
      )
      .join(''),
  )
}

export interface SentEntry {
  deviceId: string
  to: string
  message: { kind: string; body?: string }
}

export function sends(ctx: AiApp): SentEntry[] {
  if (!existsSync(ctx.sendLogFile)) return []
  return readFileSync(ctx.sendLogFile, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as SentEntry)
}

export function sentBodies(ctx: AiApp): string[] {
  return sends(ctx).map((s) => s.message.body ?? '')
}

export function query<T>(
  ctx: AiApp,
  sql: string,
  ...params: Array<string | number>
): T[] {
  const db = new DatabaseSync(join(ctx.dir, 'rapbooster.db'), { readOnly: true })
  try {
    return db.prepare(sql).all(...params) as unknown as T[]
  } finally {
    db.close()
  }
}

export function inboundCount(ctx: AiApp): number {
  return Number(
    query<{ n: number }>(
      ctx,
      `SELECT COUNT(*) AS n FROM Message WHERE direction = 'in'`,
    )[0]?.n ?? 0,
  )
}
