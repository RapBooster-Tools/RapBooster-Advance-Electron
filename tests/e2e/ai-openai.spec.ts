/**
 * The real OpenAI call path, against a local stub server.
 *
 * `services/ai/responder.ts` is the only code in the app that calls a
 * third-party API and then *autonomously sends its output to the user's
 * customers*. Until now nothing executed that call: E4.12 covers the missing-key
 * branch, and every other chatbot spec stops at configuration. Everything from
 * the completion request onward — error mapping, the empty-reply guard, the
 * send, and the persisted record — had never run.
 *
 * These specs point `OPENAI_BASE_URL` at a stub and drive real inbound traffic
 * through the mock WhatsApp transport, so the whole chain runs: message
 * arrives -> stored -> model called -> reply sent through the throttle ->
 * recorded as an AI reply.
 */
import { expect, test, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { APP_READY_TIMEOUT_MS } from './fixtures/constants'
import { cleanupUserDataDir, newUserDataDir } from './fixtures/licensed-app'

interface StubReply {
  status: number
  body: string
}

let server: Server
let baseUrl: string
let reply: StubReply
let hits = 0
/** Raw request bodies, so a spec can assert what the model was actually sent. */
let requests: string[] = []

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      hits += 1
      requests.push(raw)
      res.writeHead(reply.status, { 'Content-Type': 'application/json' })
      res.end(reply.body)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
})

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

test.beforeEach(() => {
  hits = 0
  requests = []
})

function completion(content: string): string {
  return JSON.stringify({
    id: 'chatcmpl-stub',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-stub',
    choices: [
      { index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  })
}

async function launchWithAi(
  dir: string,
): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${dir}`],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: undefined,
      LICENSE_SERVICE: 'mock',
      WA_TRANSPORT: 'mock',
      // The mock transport only produces inbound traffic when asked to.
      WA_MOCK_INCOMING: '1',
      OPENAI_BASE_URL: baseUrl,
      NODE_ENV: 'test',
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
  return { app, win }
}

/** Enable auto-reply, store a key, and connect a device that receives a message. */
async function armAutoReply(win: Page): Promise<void> {
  await win.evaluate(async () => {
    const current = await window.api.invoke('chatbot:get')
    if (!current.ok) throw new Error('chatbot:get failed')
    await window.api.invoke('chatbot:save', {
      ...current.data,
      enabled: true,
      systemInstructions: 'Be brief.',
      // No pause: the delay is a human-realism feature, not what is under test.
      responseDelay: 0,
    })
    await window.api.invoke('settings:set', { key: 'ai.apiKey', value: 'sk-stub-key' })
  })
}

async function receiveMessage(win: Page): Promise<void> {
  await win.evaluate(async () => {
    const created = await window.api.invoke('device:create', { name: 'AI Device' })
    if (!created.ok) throw new Error('device:create failed')
    await window.api.invoke('device:connect', { id: created.data.id })
  })
}

function aiReplies(dir: string): { body: string; isAiReply: number }[] {
  const db = new DatabaseSync(join(dir, 'rapbooster.db'), { readOnly: true })
  try {
    return db
      .prepare(`SELECT body, isAiReply FROM Message WHERE isAiReply = 1`)
      .all() as unknown as { body: string; isAiReply: number }[]
  } finally {
    db.close()
  }
}

test('E4.24 — an inbound message produces a model reply that is sent and recorded', async () => {
  const dir = newUserDataDir()
  reply = { status: 200, body: completion('Thanks for getting in touch!') }
  const { app, win } = await launchWithAi(dir)
  try {
    await armAutoReply(win)
    await receiveMessage(win)

    // The whole chain has to complete: model called, reply sent through
    // wa-service, row persisted.
    await expect.poll(() => aiReplies(dir).length, { timeout: 30_000 }).toBeGreaterThan(0)
    expect(hits).toBeGreaterThan(0)
    expect(aiReplies(dir)[0].body).toBe('Thanks for getting in touch!')
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E4.25 — an empty model reply is never sent to the customer', async () => {
  const dir = newUserDataDir()
  // A model can legitimately return nothing. Sending that would deliver a blank
  // message to a real person from the user's own account.
  reply = { status: 200, body: completion('   ') }
  const { app, win } = await launchWithAi(dir)
  try {
    await armAutoReply(win)
    await receiveMessage(win)

    await expect.poll(() => hits, { timeout: 30_000 }).toBeGreaterThan(0)
    // Give the send path time to have gone wrong before concluding it did not.
    await win.waitForTimeout(2000)
    expect(aiReplies(dir)).toHaveLength(0)
    // Nothing was sent, and it is not an error either — so no error toast.
    await expect(win.getByTestId('toast')).toHaveCount(0)
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E4.26 — a rejected API key surfaces as a specific error, not silence', async () => {
  const dir = newUserDataDir()
  reply = {
    status: 401,
    body: JSON.stringify({
      error: { message: 'Incorrect API key provided', type: 'invalid_request_error' },
    }),
  }
  const { app, win } = await launchWithAi(dir)
  try {
    await armAutoReply(win)
    await receiveMessage(win)

    // The user configured auto-reply; if it is not happening they have to be
    // told why, or they will believe their customers are being answered.
    const toast = win.getByTestId('toast')
    await expect(toast.first()).toBeVisible({ timeout: 30_000 })
    expect(aiReplies(dir)).toHaveLength(0)
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E4.27 — rate limiting is reported and sends nothing', async () => {
  const dir = newUserDataDir()
  reply = {
    status: 429,
    body: JSON.stringify({
      error: { message: 'Rate limit reached', type: 'rate_limit_error' },
    }),
  }
  const { app, win } = await launchWithAi(dir)
  try {
    await armAutoReply(win)
    await receiveMessage(win)

    await expect(win.getByTestId('toast').first()).toBeVisible({ timeout: 30_000 })
    expect(aiReplies(dir)).toHaveLength(0)
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E4.28 — the model sees the incoming message exactly once', async () => {
  // The inbound message is stored before the responder runs, so the history
  // query picked it up and the prompt builder then appended it again.
  const dir = newUserDataDir()
  reply = { status: 200, body: completion('Happy to help.') }
  const { app, win } = await launchWithAi(dir)
  try {
    await armAutoReply(win)
    await receiveMessage(win)

    await expect.poll(() => requests.length, { timeout: 30_000 }).toBeGreaterThan(0)
    const sent = JSON.parse(requests[0]!) as {
      messages: { role: string; content: string }[]
    }
    const userTurns = sent.messages.filter((m) => m.role === 'user')
    expect(userTurns.filter((m) => m.content === 'Mock inbound 1')).toHaveLength(1)
    expect(sent.messages.at(-1)).toEqual({ role: 'user', content: 'Mock inbound 1' })
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

function inboundCount(dir: string): number {
  const db = new DatabaseSync(join(dir, 'rapbooster.db'), { readOnly: true })
  try {
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM Message WHERE direction = 'in'`)
      .get() as { n: number }
    return Number(row.n)
  } finally {
    db.close()
  }
}

test('E4.29 — escalation sends its message, silences the bot, and can be handed back', async () => {
  test.setTimeout(180_000)
  const dir = newUserDataDir()
  reply = { status: 200, body: completion('Bot answer.') }
  const { app, win } = await launchWithAi(dir)
  try {
    await armAutoReply(win)
    const setKeywords = (keywords: string[]) =>
      win.evaluate(async (kw) => {
        const current = await window.api.invoke('chatbot:get')
        if (!current.ok) throw new Error('chatbot:get failed')
        await window.api.invoke('chatbot:save', {
          ...current.data,
          escalationTrigger: 'keywords',
          escalationKeywords: kw,
          escalationMessage: 'A teammate will reply shortly.',
        })
      }, keywords)
    // The mock's inbound text is "Mock inbound 1", so this keyword escalates it.
    await setKeywords(['inbound'])

    const deviceId = await win.evaluate(async () => {
      const created = await window.api.invoke('device:create', { name: 'AI Device' })
      if (!created.ok) throw new Error('device:create failed')
      await window.api.invoke('device:connect', { id: created.data.id })
      return created.data.id
    })
    const reconnect = () =>
      win.evaluate((id) => window.api.invoke('device:reconnect', { id }), deviceId)

    // 1. The configured escalation message goes out; the model is not called.
    await expect
      .poll(() => aiReplies(dir).map((r) => r.body), { timeout: 30_000 })
      .toEqual(['A teammate will reply shortly.'])
    expect(hits).toBe(0)

    // 2. Escalation sticks. Even with a message that would not escalate on its
    //    own, the bot stays quiet: a human owns this conversation now.
    await setKeywords(['no-such-keyword'])
    await reconnect()
    await expect.poll(() => inboundCount(dir), { timeout: 30_000 }).toBe(2)
    await win.waitForTimeout(2000)
    expect(hits).toBe(0)
    expect(aiReplies(dir)).toHaveLength(1)

    // 3. The inbox hands it back, and the next message is answered again.
    await win.getByTestId('nav-inbox').click()
    await win.getByTestId('chat-item').first().click()
    await expect(win.getByTestId('chat-escalated')).toBeVisible()
    await win.getByTestId('resume-bot').click()
    await expect(win.getByTestId('chat-escalated')).toHaveCount(0)

    await reconnect()
    await expect
      .poll(() => aiReplies(dir).map((r) => r.body), { timeout: 30_000 })
      .toContain('Bot answer.')
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})
