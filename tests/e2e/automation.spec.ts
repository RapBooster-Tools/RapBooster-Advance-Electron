/**
 * Automation (D89): keyword auto-replies, signed webhooks and call auto-reject.
 *
 * One app serves the whole file: launching Electron per test would cost more
 * than every assertion here combined. Each test therefore uses its own sender
 * number, its own keywords and its own webhook path, and removes the rules and
 * webhooks it created, so tests stay independent of one another's leftovers.
 *
 * Inbound traffic is scripted through WA_MOCK_INJECT; what the app sent is read
 * back from WA_MOCK_SEND_LOG and WA_MOCK_ACTION_LOG; persisted state is read
 * from the SQLite file read-only.
 */
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  cleanupUserDataDir,
  launchLicensed,
  newUserDataDir,
} from './fixtures/licensed-app'

const AI_MISSING = /No OpenAI API key is configured/

interface Hit {
  path: string
  headers: IncomingHttpHeaders
  body: string
}

let server: Server
let base: string
let hits: Hit[] = []
/** Status codes a path answers with, in order; the last one repeats. */
const script = new Map<string, number[]>()

let dir: string
let logDir: string
let app: ElectronApplication
let win: Page
let deviceId: string

const paths = () => ({
  sends: join(logDir, 'sends.jsonl'),
  actions: join(logDir, 'actions.jsonl'),
  inject: join(logDir, 'inject.jsonl'),
})

function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as T)
}

type Sent = { deviceId: string; to: string; message: Record<string, unknown> }
type Action = { action: string; deviceId: string } & Record<string, unknown>

const sends = () => readJsonl<Sent>(paths().sends)
const actions = () => readJsonl<Action>(paths().actions)
const sendsTo = (phone: string) => sends().filter((s) => s.to.includes(phone.slice(1)))

function inject(event: Record<string, unknown>): void {
  appendFileSync(paths().inject, `${JSON.stringify({ deviceId: '*', ...event })}\n`)
}

function query<T>(sql: string, ...params: Array<string | number>): T[] {
  const db = new DatabaseSync(join(dir, 'rapbooster.db'), { readOnly: true })
  try {
    return db.prepare(sql).all(...params) as unknown as T[]
  } finally {
    db.close()
  }
}

/** Invoke a channel from the renderer; throws with the error code on failure. */
async function call<T = unknown>(channel: string, request?: unknown): Promise<T> {
  const result = await win.evaluate(
    async ([c, r]) => window.api.invoke(c as never, r as never),
    [channel, request] as const,
  )
  const typed = result as
    { ok: true; data: T } | { ok: false; error: { code: string; userMessage: string } }
  if (!typed.ok) throw new Error(`${channel}: ${typed.error.code}`)
  return typed.data
}

async function callError(channel: string, request?: unknown): Promise<string> {
  const result = (await win.evaluate(
    async ([c, r]) => window.api.invoke(c as never, r as never),
    [channel, request] as const,
  )) as { ok: boolean; error?: { code: string } }
  expect(result.ok).toBe(false)
  return result.error?.code ?? ''
}

type Rule = { id: string; hitCount: number; enabled: boolean }

async function createRule(input: Record<string, unknown>): Promise<Rule> {
  return call<Rule>('rule:create', { cooldownMinutes: 10, ...input })
}

async function hitCount(id: string): Promise<number> {
  const rules = await call<Rule[]>('rule:list')
  return rules.find((r) => r.id === id)?.hitCount ?? -1
}

const aiToasts = () => win.getByTestId('toast').filter({ hasText: AI_MISSING }).count()

async function dismissToasts(): Promise<void> {
  const toasts = win.getByTestId('toast')
  while ((await toasts.count()) > 0) await toasts.first().click()
}

/** Leave the shared app as clean as we found it. */
async function removeAll(): Promise<void> {
  for (const r of await call<{ id: string }[]>('rule:list'))
    await call('rule:delete', { id: r.id })
  for (const w of await call<{ id: string }[]>('webhook:list'))
    await call('webhook:delete', { id: w.id })
}

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c: Buffer) => (raw += c.toString('utf8')))
    req.on('end', () => {
      const path = req.url ?? '/'
      hits.push({ path, headers: req.headers, body: raw })
      const codes = script.get(path) ?? [200]
      const status = codes.length > 1 ? codes.shift()! : (codes[0] ?? 200)
      res.writeHead(status, { 'Content-Type': 'text/plain' })
      res.end('ok')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  dir = newUserDataDir()
  logDir = mkdtempSync(join(tmpdir(), 'rapbooster-auto-'))
  // Inherited by the Electron launch and, through it, by wa-service.
  process.env.WA_MOCK_SEND_LOG = paths().sends
  process.env.WA_MOCK_ACTION_LOG = paths().actions
  process.env.WA_MOCK_INJECT = paths().inject
  process.env.RB_TICK_MS = '1000'
  process.env.RB_WEBHOOK_BACKOFF_MS = '500'
  ;({ app, win } = await launchLicensed(dir))

  // No pacing: what is under test is which messages go out, not their rhythm.
  const defaults = await call<Record<string, unknown>>('settings:getSendingDefaults')
  await call('settings:setSendingDefaults', {
    ...defaults,
    delayFrom: 0,
    delayTo: 0,
    sleepDuration: 0,
    quietHoursEnabled: false,
  })
  // Creates the bot config, which is enabled by default with no key: any
  // message that reaches the AI step produces an AI_KEY_MISSING toast.
  await call('chatbot:get')
  // No coalescing: the AI waits for a burst to settle before answering, so its
  // toast for one test's message would otherwise land seconds later, inside
  // the next test. These specs are about rules; the AI must answer at once.
  const ai = await call<{ config: Record<string, unknown> }>('ai:getConfig')
  await call('ai:setConfig', { ...ai.config, coalesceSeconds: 0 })

  const device = await call<{ id: string }>('device:create', { name: 'Automation' })
  deviceId = device.id
  await call('device:connect', { id: deviceId })
  await expect
    .poll(
      async () =>
        (await call<{ id: string; status: string }[]>('device:list')).find(
          (d) => d.id === deviceId,
        )?.status,
      { timeout: 30_000 },
    )
    .toBe('connected')
})

test.afterAll(async () => {
  await app?.close()
  for (const key of [
    'WA_MOCK_SEND_LOG',
    'WA_MOCK_ACTION_LOG',
    'WA_MOCK_INJECT',
    'RB_TICK_MS',
    'RB_WEBHOOK_BACKOFF_MS',
  ])
    delete process.env[key]
  cleanupUserDataDir(dir)
  rmSync(logDir, { recursive: true, force: true })
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

test.beforeEach(() => {
  hits = []
  script.clear()
})

test.afterEach(async () => {
  await removeAll()
})

test('E6.1 — rule CRUD, and a rule needs exactly one of reply text or template', async () => {
  expect(
    await callError('rule:create', { name: 'Neither', keywords: ['x'], replyText: '' }),
  ).toBe('VALIDATION_FAILED')
  const template = await call<{ id: string }>('template:create', {
    name: `E6.1 tpl ${Date.now()}`,
    type: 'text',
    content: 'From a template',
  })
  expect(
    await callError('rule:create', {
      name: 'Both',
      keywords: ['x'],
      replyText: 'Hi',
      templateId: template.id,
    }),
  ).toBe('VALIDATION_FAILED')

  const rule = await call<Rule & { keywords: string[]; replyText: string | null }>(
    'rule:create',
    { name: 'Greeting', keywords: ['Hello ', 'HELLO', 'hi'], replyText: 'Hi there' },
  )
  // Normalised and de-duplicated on save.
  expect(rule.keywords).toEqual(['hello', 'hi'])

  // Switching to a template is expressed by sending only the template.
  const switched = await call<{ replyText: string | null; templateId: string | null }>(
    'rule:update',
    { id: rule.id, templateId: template.id },
  )
  expect(switched).toMatchObject({ replyText: null, templateId: template.id })

  await call('rule:delete', { id: rule.id })
  expect(await call<unknown[]>('rule:list')).toHaveLength(0)
})

test('E6.2 — rule:test applies whole-word matching, match types, priority and devices', async () => {
  await createRule({ name: 'Ship', keywords: ['shipping'], replyText: 'A' })
  await createRule({
    name: 'Ship cost',
    keywords: ['shipping cost'],
    replyText: 'B',
    priority: 5,
  })
  await createRule({ name: 'Yes', keywords: ['yes'], matchType: 'exact', replyText: 'C' })
  await createRule({
    name: 'Track',
    keywords: ['track'],
    matchType: 'starts_with',
    replyText: 'D',
  })
  await createRule({
    name: 'Elsewhere',
    keywords: ['elsewhere'],
    replyText: 'E',
    deviceIds: ['some-other-device'],
  })

  const reply = async (text: string, device?: string) =>
    (await call<{ reply: string | null }>('rule:test', { text, deviceId: device })).reply

  expect(await reply('What is the SHIPPING cost?')).toBe('B')
  expect(await reply('shipping?')).toBe('A')
  expect(await reply('reshipping today')).toBeNull()
  expect(await reply('Yes!')).toBe('C')
  expect(await reply('yes please')).toBeNull()
  expect(await reply('track 1234')).toBe('D')
  expect(await reply('tracking 1234')).toBeNull()
  expect(await reply('elsewhere', deviceId)).toBeNull()
  expect(await reply('elsewhere', 'some-other-device')).toBe('E')
})

test('E6.3 — an inbound "price" gets the rule reply, recorded and marked read', async () => {
  const from = '+919000003001'
  const rule = await createRule({
    name: 'Price',
    keywords: ['price'],
    replyText: 'Plans start at 499.',
  })
  inject({ type: 'message', from, body: 'What is the price?' })

  await expect.poll(() => sendsTo(from).length, { timeout: 20_000 }).toBe(1)
  expect(sendsTo(from)[0]?.message).toEqual({ kind: 'text', body: 'Plans start at 499.' })

  await expect
    .poll(
      () =>
        query<{ body: string }>(
          `SELECT body FROM Message WHERE chatId = ? AND direction = 'out'`,
          `${from}@s.whatsapp.net`,
        ).map((m) => m.body),
      { timeout: 10_000 },
    )
    .toEqual(['Plans start at 499.'])
  await expect.poll(() => hitCount(rule.id)).toBe(1)
  // sending.markReadOnReply defaults on: the customer sees blue ticks.
  await expect
    .poll(() =>
      actions().some(
        (a) => a.action === 'read' && a.chatJid === `${from}@s.whatsapp.net`,
      ),
    )
    .toBe(true)
})

test('E6.4 — a rule reply means the AI is never consulted; an unmatched message is', async () => {
  await dismissToasts()
  await createRule({ name: 'Discount', keywords: ['discount'], replyText: '10% off' })

  inject({ type: 'message', from: '+919000004001', body: 'any discount?' })
  await expect.poll(() => sendsTo('+919000004001').length, { timeout: 20_000 }).toBe(1)
  await win.waitForTimeout(2000)
  expect(await aiToasts()).toBe(0)

  // The control: the same pipeline without a matching rule does reach the AI,
  // so the assertion above is not passing vacuously.
  inject({ type: 'message', from: '+919000004002', body: 'good morning' })
  await expect.poll(aiToasts, { timeout: 20_000 }).toBeGreaterThan(0)
  await dismissToasts()
})

test('E6.5 — the cooldown stops a second reply to the same chat', async () => {
  const from = '+919000005001'
  const rule = await createRule({
    name: 'Delivery',
    keywords: ['delivery'],
    replyText: 'We deliver in 2 days.',
    cooldownMinutes: 30,
  })
  inject({ type: 'message', from, body: 'delivery time?' })
  await expect.poll(() => sendsTo(from).length, { timeout: 20_000 }).toBe(1)
  await expect.poll(() => hitCount(rule.id)).toBe(1)

  const before = await aiToasts()
  inject({ type: 'message', from, body: 'delivery???' })
  await win.waitForTimeout(3000)
  expect(sendsTo(from)).toHaveLength(1)
  expect(await hitCount(rule.id)).toBe(1)
  // Cooling down is still "handled": the AI does not improvise an answer.
  expect(await aiToasts()).toBe(before)
})

test('E6.6 — a template rule sends the template with merge tags resolved', async () => {
  const from = '+919000006001'
  const template = await call<{ id: string }>('template:create', {
    name: `Menu ${Date.now()}`,
    type: 'text',
    content: 'Hi {{Name}}, here is our menu.',
  })
  await createRule({ name: 'Menu', keywords: ['menu'], templateId: template.id })
  inject({ type: 'message', from, body: 'Menu please' })

  await expect.poll(() => sendsTo(from).length, { timeout: 20_000 }).toBe(1)
  // The mock reports every sender's push name as "Mock Contact".
  expect(sendsTo(from)[0]?.message).toEqual({
    kind: 'text',
    body: 'Hi Mock Contact, here is our menu.',
  })
})

test('E6.7 — a disabled rule is ignored', async () => {
  const from = '+919000007001'
  const rule = await createRule({
    name: 'Hours',
    keywords: ['hours'],
    replyText: '9 to 5',
    enabled: false,
  })
  inject({ type: 'message', from, body: 'opening hours?' })
  // The message falls through to the AI, which is how we know it was processed.
  await expect
    .poll(
      () => query(`SELECT id FROM Chat WHERE id = ?`, `${from}@s.whatsapp.net`).length,
    )
    .toBe(1)
  await win.waitForTimeout(2000)
  expect(sendsTo(from)).toHaveLength(0)
  expect(await hitCount(rule.id)).toBe(0)
})

test('E6.8 — a rule scoped to other devices does not answer on this one', async () => {
  const from = '+919000008001'
  const other = await call<{ id: string }>('device:create', { name: 'Other device' })
  await createRule({
    name: 'Location',
    keywords: ['location'],
    replyText: 'MG Road',
    deviceIds: [other.id],
  })
  inject({ type: 'message', from, body: 'your location' })
  await expect
    .poll(
      () => query(`SELECT id FROM Chat WHERE id = ?`, `${from}@s.whatsapp.net`).length,
    )
    .toBe(1)
  await win.waitForTimeout(2000)
  expect(sendsTo(from)).toHaveLength(0)
  await call('device:delete', { id: other.id })
})

test('E6.9 — a chat opted out of auto-replies is left to a human', async () => {
  const from = '+919000009001'
  const chatId = `${from}@s.whatsapp.net`
  await createRule({
    name: 'Refund',
    keywords: ['refund'],
    replyText: 'Refunds take 5 days',
  })
  inject({ type: 'message', from, body: 'hello' })
  await expect
    .poll(() => query(`SELECT id FROM Chat WHERE id = ?`, chatId).length)
    .toBe(1)
  await call('chat:setOptOut', { chatId, optOut: true })

  inject({ type: 'message', from, body: 'refund status' })
  await expect
    .poll(() => query(`SELECT id FROM Message WHERE chatId = ?`, chatId).length)
    .toBe(2)
  await win.waitForTimeout(2000)
  expect(sendsTo(from)).toHaveLength(0)
})

test('E6.10 — in quiet hours a matched rule parks: nothing sent, no hit, no AI', async () => {
  const from = '+919000010001'
  const clock = (offsetMin: number) => {
    const d = new Date(Date.now() + offsetMin * 60_000)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const rule = await createRule({
    name: 'Warranty',
    keywords: ['warranty'],
    replyText: 'One year',
  })
  await call('settings:setSendingDefaults', {
    quietHoursEnabled: true,
    quietHoursStart: clock(-60),
    quietHoursEnd: clock(60),
  })
  try {
    await dismissToasts()
    inject({ type: 'message', from, body: 'warranty?' })
    await expect
      .poll(
        () => query(`SELECT id FROM Chat WHERE id = ?`, `${from}@s.whatsapp.net`).length,
      )
      .toBe(1)
    await win.waitForTimeout(3000)
    expect(sendsTo(from)).toHaveLength(0)
    expect(await hitCount(rule.id)).toBe(0)
    expect(await aiToasts()).toBe(0)
  } finally {
    await call('settings:setSendingDefaults', { quietHoursEnabled: false })
  }
})

test('E6.11 — a rule created through the screen answers the "Test a message" box', async () => {
  await dismissToasts()
  await win.getByTestId('nav-automation').click()
  await win.getByTestId('automation-tab-rules').click()
  await win.getByTestId('rule-new').click()

  const dialog = win.getByTestId('rule-dialog')
  await dialog.getByTestId('rule-name').fill('Catalogue')
  await dialog.getByTestId('rule-keyword-input').fill('catalogue')
  await dialog.getByTestId('rule-keyword-input').press('Enter')
  await expect(dialog.getByTestId('rule-keyword-chip')).toHaveText(['catalogue'])
  await dialog.getByTestId('rule-reply-text').fill('Our catalogue is on the website.')
  await dialog.getByTestId('rule-save').click()
  await expect(dialog).toBeHidden()

  await expect(win.getByTestId('rule-row')).toHaveCount(1)
  await expect(win.getByTestId('rule-row')).toContainText('Catalogue')

  await win.getByTestId('rule-test-input').fill('send me the catalogue')
  await win.getByTestId('rule-test-run').click()
  await expect(win.getByTestId('rule-test-result')).toContainText(
    'Our catalogue is on the website.',
  )
  await win.getByTestId('rule-test-input').fill('nothing relevant')
  await win.getByTestId('rule-test-run').click()
  await expect(win.getByTestId('rule-test-result')).toContainText('No rule matches')
})

type Hook = {
  id: string
  secret?: string
  lastStatus: number | null
  lastError: string | null
}
type Delivery = { status: string; attempts: number; lastError: string | null }

test('E6.12 — webhook CRUD: the secret is returned once and never listed', async () => {
  expect(
    await callError('webhook:create', {
      url: 'ftp://example.com',
      events: ['message.received'],
    }),
  ).toBe('VALIDATION_FAILED')

  const hook = await call<Hook>('webhook:create', {
    url: `${base}/crud`,
    events: ['message.received'],
  })
  expect(hook.secret).toMatch(/^[0-9a-f]{64}$/)

  const listed = await call<Record<string, unknown>[]>('webhook:list')
  expect(listed).toHaveLength(1)
  expect(listed[0]).not.toHaveProperty('secret')
  expect(JSON.stringify(listed)).not.toContain(hook.secret!)
  // Stored through secure-store, never as the bare secret.
  const stored = query<{ secret: string }>(
    `SELECT secret FROM Webhook WHERE id = ?`,
    hook.id,
  )
  expect(stored[0]?.secret).not.toBe(hook.secret)

  const updated = await call<{ enabled: boolean; events: string[] }>('webhook:update', {
    id: hook.id,
    enabled: false,
    events: ['call.rejected', 'optout.added'],
  })
  expect(updated).toMatchObject({
    enabled: false,
    events: ['call.rejected', 'optout.added'],
  })
  expect(await call<unknown[]>('webhook:deliveries', { id: hook.id })).toHaveLength(0)

  await call('webhook:delete', { id: hook.id })
  expect(await call<unknown[]>('webhook:list')).toHaveLength(0)
})

test('E6.13 — message.received is delivered with a valid HMAC signature', async () => {
  const from = '+919000013001'
  const hook = await call<Hook>('webhook:create', {
    url: `${base}/signed`,
    events: ['message.received'],
  })
  inject({ type: 'message', from, body: 'Hello webhook' })

  await expect
    .poll(() => hits.filter((h) => h.path === '/signed').length, { timeout: 20_000 })
    .toBe(1)
  const hit = hits.find((h) => h.path === '/signed')!
  const payload = JSON.parse(hit.body) as {
    id: string
    event: string
    at: string
    data: Record<string, unknown>
  }
  expect(hit.headers['content-type']).toBe('application/json')
  expect(hit.headers['user-agent']).toBe('RapBooster-Advance')
  expect(hit.headers['x-rapbooster-event']).toBe('message.received')
  expect(hit.headers['x-rapbooster-delivery']).toBe(payload.id)
  const expected = `sha256=${createHmac('sha256', hook.secret!).update(hit.body).digest('hex')}`
  expect(hit.headers['x-rapbooster-signature']).toBe(expected)
  expect(payload).toMatchObject({
    event: 'message.received',
    data: { phone: from, text: 'Hello webhook', isGroup: false, deviceId },
  })

  await expect
    .poll(async () => (await call<Delivery[]>('webhook:deliveries', { id: hook.id }))[0])
    .toMatchObject({ status: 'delivered', attempts: 1 })
  const [listed] = await call<Hook[]>('webhook:list')
  expect(listed).toMatchObject({ lastStatus: 200, lastError: null })
})

test('E6.14 — a failed delivery retries with backoff and ends delivered', async () => {
  script.set('/flaky', [500, 200])
  const hook = await call<Hook>('webhook:create', {
    url: `${base}/flaky`,
    events: ['message.received'],
  })
  inject({ type: 'message', from: '+919000014001', body: 'retry me' })

  await expect
    .poll(
      async () => (await call<Delivery[]>('webhook:deliveries', { id: hook.id }))[0],
      {
        timeout: 30_000,
      },
    )
    .toMatchObject({ status: 'delivered', attempts: 2 })
  const flaky = hits.filter((h) => h.path === '/flaky')
  expect(flaky).toHaveLength(2)
  // The same delivery, retried — not a second event.
  expect(flaky[0]?.headers['x-rapbooster-delivery']).toBe(
    flaky[1]?.headers['x-rapbooster-delivery'],
  )
  const [listed] = await call<Hook[]>('webhook:list')
  expect(listed).toMatchObject({ lastStatus: 200, lastError: null })
})

test('E6.15 — "Send test" reports exactly what the endpoint answered', async () => {
  script.set('/broken', [500])
  const ok = await call<Hook>('webhook:create', {
    url: `${base}/ok`,
    events: ['message.received'],
  })
  const broken = await call<Hook>('webhook:create', {
    url: `${base}/broken`,
    events: ['message.received'],
  })
  const unreachable = await call<Hook>('webhook:create', {
    url: 'http://127.0.0.1:9/nothing',
    events: ['message.received'],
  })

  expect(await call('webhook:test', { id: ok.id })).toEqual({ status: 200, error: null })
  expect(hits.find((h) => h.path === '/ok')?.headers['x-rapbooster-event']).toBe(
    'message.received',
  )
  expect(await call('webhook:test', { id: broken.id })).toEqual({
    status: 500,
    error: 'HTTP 500',
  })
  const down = await call<{ status: number | null; error: string | null }>(
    'webhook:test',
    {
      id: unreachable.id,
    },
  )
  expect(down.status).toBeNull()
  expect(down.error).toBeTruthy()
})

test('E6.16 — a disabled webhook receives nothing', async () => {
  const from = '+919000016001'
  const hook = await call<Hook>('webhook:create', {
    url: `${base}/off`,
    events: ['message.received'],
  })
  await call('webhook:update', { id: hook.id, enabled: false })
  inject({ type: 'message', from, body: 'anyone there?' })
  await expect
    .poll(
      () => query(`SELECT id FROM Chat WHERE id = ?`, `${from}@s.whatsapp.net`).length,
    )
    .toBe(1)
  await win.waitForTimeout(3000)
  expect(hits.filter((h) => h.path === '/off')).toHaveLength(0)
  expect(await call<unknown[]>('webhook:deliveries', { id: hook.id })).toHaveLength(0)
})

type CallRow = { id: string; rejected: number; replied: number; isVideo: number }

test('E6.17 — with auto-reject off, a call is recorded and left ringing', async () => {
  const from = '+919000017001'
  expect(await call('calls:getConfig')).toEqual({
    autoReject: false,
    message:
      "Sorry, we can't take calls on this number. Please send us a message and we'll reply here.",
  })
  inject({ type: 'call', from })
  await expect
    .poll(() => query<CallRow>(`SELECT * FROM CallEvent WHERE "from" = ?`, from).length, {
      timeout: 20_000,
    })
    .toBe(1)
  expect(
    query<CallRow>(`SELECT * FROM CallEvent WHERE "from" = ?`, from)[0],
  ).toMatchObject({
    rejected: 0,
    replied: 0,
  })
  expect(actions().filter((a) => a.action === 'rejectCall')).toHaveLength(0)
  const listed = await call<{ from: string }[]>('calls:list', { limit: 10 })
  expect(listed.map((c) => c.from)).toContain(from)
})

test('E6.18 — auto-reject rejects the call, messages the caller and fires call.rejected', async () => {
  const from = '+919000018001'
  await call('calls:setConfig', { autoReject: true, message: 'Please text us instead.' })
  await call<Hook>('webhook:create', { url: `${base}/calls`, events: ['call.rejected'] })
  try {
    inject({ type: 'call', from, isVideo: true })

    await expect
      .poll(
        () =>
          actions().filter((a) => a.action === 'rejectCall' && a.from === from).length,
        {
          timeout: 20_000,
        },
      )
      .toBe(1)
    await expect.poll(() => sendsTo(from).length, { timeout: 20_000 }).toBe(1)
    expect(sendsTo(from)[0]?.message).toEqual({
      kind: 'text',
      body: 'Please text us instead.',
    })
    await expect
      .poll(() => query<CallRow>(`SELECT * FROM CallEvent WHERE "from" = ?`, from)[0])
      .toMatchObject({ rejected: 1, replied: 1, isVideo: 1 })
    await expect
      .poll(() => hits.filter((h) => h.path === '/calls').length, { timeout: 20_000 })
      .toBe(1)
    const payload = JSON.parse(hits.find((h) => h.path === '/calls')!.body) as {
      event: string
      data: Record<string, unknown>
    }
    expect(payload).toMatchObject({
      event: 'call.rejected',
      data: { phone: from, isVideo: true, replied: true },
    })
  } finally {
    await call('calls:setConfig', {
      autoReject: false,
      message: 'Please text us instead.',
    })
  }
})

test('E6.19 — the Webhooks and Calls tabs: secret shown once, settings saved, calls listed', async () => {
  await dismissToasts()
  await win.getByTestId('nav-automation').click()
  await win.getByTestId('automation-tab-webhooks').click()
  await win.getByTestId('webhook-new').click()
  const dialog = win.getByTestId('webhook-dialog')
  await dialog.getByTestId('webhook-url').fill(`${base}/ui`)
  await dialog.getByTestId('webhook-event-optout.added').check()
  await dialog.getByTestId('webhook-save').click()
  await expect(dialog.getByTestId('webhook-secret')).toHaveText(/^[0-9a-f]{64}$/)
  await dialog.getByTestId('webhook-secret-done').click()
  await expect(dialog).toBeHidden()
  await expect(win.getByTestId('webhook-row')).toHaveCount(1)
  await expect(win.getByTestId('webhook-row')).toContainText(`${base}/ui`)
  await expect(win.getByTestId('webhook-row')).toContainText('optout.added')

  await win.getByTestId('webhook-test').click()
  await expect(win.getByTestId('webhook-row')).toContainText('HTTP 200')

  const caller = '+919000019001'
  inject({ type: 'call', from: caller })
  await expect
    .poll(() => query(`SELECT id FROM CallEvent WHERE "from" = ?`, caller).length, {
      timeout: 20_000,
    })
    .toBe(1)
  await win.getByTestId('automation-tab-calls').click()
  await expect(win.getByTestId('call-row').filter({ hasText: caller })).toBeVisible()
  await win.getByTestId('calls-auto-reject').check()
  await win.getByTestId('calls-message').fill('Text only, please.')
  await win.getByTestId('calls-save').click()
  await expect
    .poll(() => call('calls:getConfig'))
    .toEqual({ autoReject: true, message: 'Text only, please.' })
  await call('calls:setConfig', { autoReject: false, message: 'Text only, please.' })
})
