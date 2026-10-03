/**
 * Chatbot flows, and welcome/away messages (Wave 3, E8.20–E8.39).
 *
 * One app serves the whole file. Each test uses its own sender numbers and
 * removes the flows, rules and auto-reply settings it created, so tests stay
 * independent of one another's leftovers.
 *
 * Inbound traffic is scripted through WA_MOCK_INJECT; what the app sent is read
 * back from WA_MOCK_SEND_LOG; persisted state is read from SQLite read-only.
 * RB_FLOW_SESSION_MS shortens a flow session's lifetime so expiry is testable.
 */
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  cleanupUserDataDir,
  launchLicensed,
  newUserDataDir,
} from './fixtures/licensed-app'

const AI_MISSING = /No OpenAI API key is configured/
const SESSION_MS = 6000
/** Long enough for an inbound message to be processed end to end. */
const SETTLE_MS = 2500

let dir: string
let logDir: string
let app: ElectronApplication
let win: Page
let deviceId: string

const paths = () => ({
  sends: join(logDir, 'sends.jsonl'),
  inject: join(logDir, 'inject.jsonl'),
})

type Sent = { deviceId: string; to: string; message: Record<string, unknown> }

function sends(): Sent[] {
  const file = paths().sends
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Sent)
}

const sendsTo = (phone: string) => sends().filter((s) => s.to.includes(phone.slice(1)))
const bodiesTo = (phone: string) =>
  sendsTo(phone).map((s) => String(s.message.body ?? ''))
const chatId = (phone: string) => `${phone}@s.whatsapp.net`

function inject(event: Record<string, unknown>): void {
  appendFileSync(paths().inject, `${JSON.stringify({ deviceId: '*', ...event })}\n`)
}

function say(from: string, body: string, extra: Record<string, unknown> = {}): void {
  inject({ type: 'message', from, body, ...extra })
}

function query<T>(sql: string, ...params: Array<string | number>): T[] {
  const db = new DatabaseSync(join(dir, 'rapbooster.db'), { readOnly: true })
  try {
    return db.prepare(sql).all(...params) as unknown as T[]
  } finally {
    db.close()
  }
}

type Result<T> =
  { ok: true; data: T } | { ok: false; error: { code: string; userMessage: string } }

async function invoke<T>(channel: string, request?: unknown): Promise<Result<T>> {
  return (await win.evaluate(
    async ([c, r]) => window.api.invoke(c as never, r as never),
    [channel, request] as const,
  )) as Result<T>
}

async function call<T = unknown>(channel: string, request?: unknown): Promise<T> {
  const result = await invoke<T>(channel, request)
  if (!result.ok)
    throw new Error(`${channel}: ${result.error.code} ${result.error.userMessage}`)
  return result.data
}

/** Wait until `phone` has received exactly `count` messages, then return their bodies. */
async function expectSends(phone: string, count: number): Promise<string[]> {
  await expect.poll(() => sendsTo(phone).length, { timeout: 20_000 }).toBe(count)
  return bodiesTo(phone)
}

/** Assert nothing more reaches `phone` once its inbound message had time to settle. */
async function expectNoMore(phone: string, count: number): Promise<void> {
  await win.waitForTimeout(SETTLE_MS)
  expect(sendsTo(phone)).toHaveLength(count)
}

// ── graphs ──

const P = { x: 0, y: 0 }

function menuGraph(style: 'numbers' | 'buttons' | 'list' = 'numbers') {
  return {
    startNodeId: 'menu',
    nodes: [
      {
        id: 'menu',
        type: 'menu',
        text: 'Pick one',
        style,
        options: [
          { id: 'p', label: 'Prices', next: 'prices' },
          { id: 'h', label: 'Opening hours', next: 'hours' },
          { id: 'x', label: 'Talk to a person', next: 'human' },
        ],
        invalidText: 'Please pick 1, 2 or 3.',
        position: P,
      },
      {
        id: 'prices',
        type: 'message',
        text: 'Prices start at 499.',
        next: null,
        position: P,
      },
      { id: 'hours', type: 'message', text: 'Open 9 to 6.', next: null, position: P },
      { id: 'human', type: 'handoff', text: 'A person will reply soon.', position: P },
    ],
  }
}

const MENU_TEXT = 'Pick one\n\n1. Prices\n2. Opening hours\n3. Talk to a person'

const leadGraph = {
  startNodeId: 'q1',
  nodes: [
    {
      id: 'q1',
      type: 'question',
      text: 'Your name?',
      variable: 'name',
      next: 'q2',
      position: P,
    },
    {
      id: 'q2',
      type: 'question',
      text: 'Thanks {{name}}, what do you need?',
      variable: 'need',
      next: 'done',
      position: P,
    },
    {
      id: 'done',
      type: 'message',
      text: 'Got it {{name}}: {{need}}',
      next: null,
      position: P,
    },
  ],
}

type Flow = { id: string; name: string; enabled: boolean; activeSessions: number }

async function createFlow(input: Record<string, unknown>): Promise<Flow> {
  return call<Flow>('flow:create', {
    name: 'Test flow',
    trigger: 'keywords',
    keywords: ['menu'],
    graph: menuGraph(),
    ...input,
  })
}

const DISABLED_AUTOREPLY = {
  welcome: { enabled: false, text: 'Welcome {{Name}}!' },
  away: {
    enabled: false,
    text: 'We are closed.',
    hours: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
    cooldownHours: 1,
  },
}

const aiToasts = () => win.getByTestId('toast').filter({ hasText: AI_MISSING }).count()

async function dismissToasts(): Promise<void> {
  const toasts = win.getByTestId('toast')
  while ((await toasts.count()) > 0) await toasts.first().click()
}

/**
 * Open Automation freshly. WHY via the dashboard: tests change flows over IPC,
 * which no screen is told about, so a panel left open by the previous test
 * would still show that test's (since deleted) flows.
 */
async function openAutomation(): Promise<void> {
  await win.getByTestId('nav-dashboard').click()
  await win.getByTestId('nav-automation').click()
}

test.beforeAll(async () => {
  dir = newUserDataDir()
  logDir = mkdtempSync(join(tmpdir(), 'rapbooster-flows-'))
  process.env.WA_MOCK_SEND_LOG = paths().sends
  process.env.WA_MOCK_INJECT = paths().inject
  process.env.RB_TICK_MS = '1000'
  process.env.RB_FLOW_SESSION_MS = String(SESSION_MS)
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
  // The bot is on by default with no key, so a message reaching it toasts at
  // once — that is how a test proves the AI was (or was not) consulted.
  await call('chatbot:get')
  const ai = await call<{ config: Record<string, unknown> }>('ai:getConfig')
  await call('ai:setConfig', { ...ai.config, coalesceSeconds: 0 })

  const device = await call<{ id: string }>('device:create', { name: 'Flows' })
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
    'WA_MOCK_INJECT',
    'RB_TICK_MS',
    'RB_FLOW_SESSION_MS',
  ])
    delete process.env[key]
  cleanupUserDataDir(dir)
  rmSync(logDir, { recursive: true, force: true })
})

test.afterEach(async () => {
  for (const f of await call<{ id: string }[]>('flow:list'))
    await call('flow:delete', { id: f.id })
  for (const r of await call<{ id: string }[]>('rule:list'))
    await call('rule:delete', { id: r.id })
  await call('autoreply:setConfig', DISABLED_AUTOREPLY)
})

test('E8.20 — flow CRUD; an invalid graph or a keyword flow without keywords is refused', async () => {
  const flow = await createFlow({ name: 'CRUD', keywords: ['Menu ', 'MENU', 'price'] })
  expect(flow).toMatchObject({ name: 'CRUD', enabled: true, activeSessions: 0 })
  const listed = await call<Array<Flow & { keywords: string[] }>>('flow:list')
  expect(listed.map((f) => f.keywords)).toEqual([['menu', 'price']])

  const updated = await call<Flow>('flow:update', {
    id: flow.id,
    name: 'CRUD renamed',
    trigger: 'keywords',
    keywords: ['menu'],
    graph: menuGraph(),
    enabled: false,
  })
  expect(updated).toMatchObject({ name: 'CRUD renamed', enabled: false })

  // A start step that does not exist fails the contract's graph schema.
  const broken = { ...menuGraph(), startNodeId: 'nowhere' }
  const invalid = await invoke('flow:create', {
    name: 'Bad',
    keywords: ['x'],
    graph: broken,
  })
  expect(invalid.ok).toBe(false)
  if (!invalid.ok) expect(invalid.error.code).toBe('VALIDATION_FAILED')

  const noKeywords = await invoke('flow:create', {
    name: 'Bad',
    keywords: [],
    graph: menuGraph(),
  })
  expect(noKeywords.ok).toBe(false)
  if (!noKeywords.ok) {
    expect(noKeywords.error.code).toBe('VALIDATION_FAILED')
    expect(noKeywords.error.userMessage).toMatch(/at least one keyword/)
  }

  await call('flow:delete', { id: flow.id })
  expect(await call<unknown[]>('flow:list')).toHaveLength(0)
  const missing = await invoke('flow:delete', { id: flow.id })
  expect(missing.ok).toBe(false)
})

test('E8.21 — a keyword starts the flow and sends the numbered menu', async () => {
  await createFlow({ keywords: ['menu'] })
  const from = '+919100002101'
  say(from, 'Show me the MENU please')
  expect(await expectSends(from, 1)).toEqual([MENU_TEXT])
  expect(sendsTo(from)[0]?.message.kind).toBe('text')
  expect(
    query<{ nodeId: string }>(
      'SELECT nodeId FROM FlowSession WHERE chatId = ?',
      chatId(from),
    ),
  ).toEqual([{ nodeId: 'menu' }])

  // Whole words only: "menus" does not start it.
  const other = '+919100002102'
  say(other, 'menus')
  await expectNoMore(other, 0)
})

test('E8.22 — a choice by number or by title advances the flow and ends it', async () => {
  const flow = await createFlow({})
  const byNumber = '+919100002201'
  say(byNumber, 'menu')
  await expectSends(byNumber, 1)
  say(byNumber, '2')
  expect((await expectSends(byNumber, 2))[1]).toBe('Open 9 to 6.')

  const byTitle = '+919100002202'
  say(byTitle, 'menu')
  await expectSends(byTitle, 1)
  expect(
    (await call<Flow[]>('flow:list')).find((f) => f.id === flow.id)?.activeSessions,
  ).toBe(1)
  say(byTitle, '  PRICES! ')
  expect((await expectSends(byTitle, 2))[1]).toBe('Prices start at 499.')

  // Both conversations reached the end of the flow: no session is left.
  expect(
    query(
      'SELECT chatId FROM FlowSession WHERE chatId IN (?, ?)',
      chatId(byNumber),
      chatId(byTitle),
    ),
  ).toHaveLength(0)
})

test('E8.23 — a reply matching no choice sends the "didn\'t understand" text and stays', async () => {
  await createFlow({})
  const from = '+919100002301'
  say(from, 'menu')
  await expectSends(from, 1)
  say(from, 'maybe later')
  const bodies = await expectSends(from, 2)
  expect(bodies[1]).toBe(`Please pick 1, 2 or 3.\n\n${MENU_TEXT}`)
  say(from, '1')
  expect((await expectSends(from, 3))[2]).toBe('Prices start at 499.')
})

test('E8.24 — a question saves the answer and a later step uses it', async () => {
  await createFlow({ keywords: ['enquiry'], graph: leadGraph })
  const from = '+919100002401'
  say(from, 'enquiry')
  expect(await expectSends(from, 1)).toEqual(['Your name?'])
  say(from, 'Asha')
  expect((await expectSends(from, 2))[1]).toBe('Thanks Asha, what do you need?')
  say(from, 'A website')
  expect((await expectSends(from, 3))[2]).toBe('Got it Asha: A website')
})

test('E8.25 — a handoff escalates the chat; the AI bot then stays out', async () => {
  await createFlow({})
  const from = '+919100002501'
  say(from, 'menu')
  await expectSends(from, 1)
  await dismissToasts()
  say(from, '3')
  expect((await expectSends(from, 2))[1]).toBe('A person will reply soon.')
  await expect
    .poll(
      () =>
        query<{ isEscalated: number }>(
          'SELECT isEscalated FROM Chat WHERE id = ?',
          chatId(from),
        )[0]?.isEscalated,
    )
    .toBe(1)
  await expect(
    win.getByTestId('toast').filter({ hasText: /handed a conversation/ }),
  ).toBeVisible()
  expect(
    query('SELECT chatId FROM FlowSession WHERE chatId = ?', chatId(from)),
  ).toHaveLength(0)

  await dismissToasts()
  say(from, 'menu again please')
  await expectNoMore(from, 2)
  expect(await aiToasts()).toBe(0)
})

test('E8.26 — flows answer before keyword rules: a message matching both gets only the flow', async () => {
  const rule = await call<{ id: string }>('rule:create', {
    name: 'Price rule',
    keywords: ['price'],
    replyText: 'FROM THE RULE',
    cooldownMinutes: 0,
  })
  await createFlow({ keywords: ['price'] })
  const from = '+919100002601'
  say(from, 'price')
  expect(await expectSends(from, 1)).toEqual([MENU_TEXT])
  await expectNoMore(from, 1)
  const rules = await call<Array<{ id: string; hitCount: number }>>('rule:list')
  expect(rules.find((r) => r.id === rule.id)?.hitCount).toBe(0)
})

test('E8.27 — opted-out and suppressed numbers get nothing from a flow', async () => {
  await createFlow({})
  const optedOut = '+919100002701'
  say(optedOut, 'STOP')
  await expectSends(optedOut, 1) // the opt-out confirmation
  say(optedOut, 'menu')
  await expectNoMore(optedOut, 1)

  const suppressed = '+919100002702'
  await call('suppression:add', { phones: [suppressed], reason: 'E8.27' })
  say(suppressed, 'menu')
  await expectNoMore(suppressed, 0)
})

test('E8.28 — a flow scoped to other devices does not answer this one', async () => {
  const flow = await createFlow({ deviceIds: ['another-device'] })
  const first = '+919100002801'
  say(first, 'menu')
  await expectNoMore(first, 0)

  await call('flow:update', {
    id: flow.id,
    name: 'Test flow',
    trigger: 'keywords',
    keywords: ['menu'],
    graph: menuGraph(),
    deviceIds: [deviceId],
  })
  const second = '+919100002802'
  say(second, 'menu')
  expect(await expectSends(second, 1)).toEqual([MENU_TEXT])
})

test('E8.29 — an unanswered session expires and a late reply is no longer a menu choice', async () => {
  await createFlow({})
  const from = '+919100002901'
  say(from, 'menu')
  await expectSends(from, 1)
  expect(
    query('SELECT chatId FROM FlowSession WHERE chatId = ?', chatId(from)),
  ).toHaveLength(1)
  // flowTick (every RB_TICK_MS) removes it once RB_FLOW_SESSION_MS has passed.
  await expect
    .poll(
      () => query('SELECT chatId FROM FlowSession WHERE chatId = ?', chatId(from)).length,
      {
        timeout: SESSION_MS + 10_000,
      },
    )
    .toBe(0)
  say(from, '1')
  await expectNoMore(from, 1)
})

test('E8.30 — flow:simulate produces exactly what a real chat receives', async () => {
  const graph = menuGraph()
  await createFlow({ graph })
  const from = '+919100003001'
  const replies = ['not sure', 'Opening hours']
  say(from, 'menu')
  await expectSends(from, 1)
  say(from, replies[0]!)
  await expectSends(from, 2)
  say(from, replies[1]!)
  const real = await expectSends(from, 3)

  const simulated = await call<{
    transcript: Array<{ from: string; text: string }>
    ended: boolean
    handoff: boolean
  }>('flow:simulate', { graph, replies })
  expect(simulated.transcript.filter((t) => t.from === 'bot').map((t) => t.text)).toEqual(
    real,
  )
  expect(simulated).toMatchObject({ ended: true, handoff: false })

  const handoff = await call<{ handoff: boolean; ended: boolean }>('flow:simulate', {
    graph,
    replies: ['3'],
  })
  expect(handoff).toMatchObject({ handoff: true, ended: true })
})

test('E8.31 — a buttons menu sends real buttons, and a tapped button advances', async () => {
  await createFlow({ graph: menuGraph('buttons') })
  const from = '+919100003101'
  say(from, 'menu')
  await expectSends(from, 1)
  const sent = sendsTo(from)[0]!.message as {
    kind: string
    body: string
    buttons: Array<{ id: string; label: string; type: string }>
  }
  expect(sent.kind).toBe('buttons')
  expect(sent.body).toBe('Pick one')
  expect(sent.buttons.map((b) => [b.type, b.id])).toEqual([
    ['reply', 'p'],
    ['reply', 'h'],
    ['reply', 'x'],
  ])
  // A tap whose choice could not be read gets the menu again as typed numbers,
  // never the same buttons in a loop.
  say(from, '', { messageType: 'buttons' })
  await expectSends(from, 2)
  expect(sendsTo(from)[1]?.message).toEqual({
    kind: 'text',
    body: `Please pick 1, 2 or 3.\n\n${MENU_TEXT}`,
  })

  // A tapped reply button arrives carrying the button's id.
  say(from, 'h', { messageType: 'buttons' })
  expect((await expectSends(from, 3))[2]).toBe('Open 9 to 6.')
})

test('E8.32 — a list menu sends a list; the new-chat trigger fires on the first message only', async () => {
  await createFlow({ graph: menuGraph('list') })
  const from = '+919100003201'
  say(from, 'menu')
  await expectSends(from, 1)
  const sent = sendsTo(from)[0]!.message as { kind: string; rows: Array<{ id: string }> }
  expect(sent.kind).toBe('list')
  expect(sent.rows.map((r) => r.id)).toEqual(['p', 'h', 'x'])

  await createFlow({
    name: 'Greeter',
    trigger: 'new_chat',
    keywords: [],
    graph: {
      startNodeId: 'hi',
      nodes: [
        {
          id: 'hi',
          type: 'message',
          text: 'First time? Hello!',
          next: null,
          position: P,
        },
      ],
    },
  })
  const newcomer = '+919100003202'
  say(newcomer, 'good morning')
  expect(await expectSends(newcomer, 1)).toEqual(['First time? Hello!'])
  say(newcomer, 'are you there?')
  await expectNoMore(newcomer, 1)
})

test('E8.33 — switching a flow off ends its conversations', async () => {
  const flow = await createFlow({})
  const from = '+919100003301'
  say(from, 'menu')
  await expectSends(from, 1)
  await call('flow:update', {
    id: flow.id,
    name: 'Test flow',
    trigger: 'keywords',
    keywords: ['menu'],
    graph: menuGraph(),
    enabled: false,
  })
  expect(
    query('SELECT chatId FROM FlowSession WHERE chatId = ?', chatId(from)),
  ).toHaveLength(0)
  say(from, '1')
  await expectNoMore(from, 1)
})

test('E8.34 — builder: start from a template, edit a step, see errors inline, save and list it', async () => {
  await openAutomation()
  await win.getByTestId('automation-tab-flows').click()
  await expect(win.getByText('No chatbot flows yet')).toBeVisible()
  await win.getByTestId('flow-empty-new').click()
  await win.getByTestId('flow-template-main-menu').click()

  await expect(win.getByTestId('flow-builder')).toBeVisible()
  await expect(win.getByTestId('flow-node')).toHaveCount(4)
  await win.getByTestId('flow-name').fill('E8.34 menu')

  await win.locator('[data-testid="flow-node"][data-node-id="menu"]').click()
  const text = win.getByTestId('flow-node-text')
  await text.fill('')
  await expect(win.getByTestId('flow-errors')).toContainText(
    'Step 1 (Menu): write the message the customer will see.',
  )
  await expect(win.getByTestId('flow-save')).toBeDisabled()
  await text.fill('Welcome! What would you like?')
  await expect(win.getByTestId('flow-errors')).toHaveCount(0)

  // A new step created straight from a choice's "goes to" list.
  await win.getByTestId('flow-option-next').first().selectOption('new:end')
  await expect(win.getByTestId('flow-node')).toHaveCount(5)

  await win.getByTestId('flow-save').click()
  await expect(win.getByTestId('flow-row')).toHaveCount(1)
  await expect(win.getByTestId('flow-row')).toContainText('E8.34 menu')

  const [saved] = await call<
    Array<{
      name: string
      graph: { nodes: Array<{ id: string; text?: string; position: { y: number } }> }
    }>
  >('flow:list')
  expect(saved?.graph.nodes.find((n) => n.id === 'menu')?.text).toBe(
    'Welcome! What would you like?',
  )
  expect(saved?.graph.nodes).toHaveLength(5)
  // Positions are written from the drawn layout: the start sits on top.
  const ys = saved!.graph.nodes.map((n) => n.position.y)
  expect(saved!.graph.nodes.find((n) => n.id === 'menu')!.position.y).toBe(
    Math.min(...ys),
  )
})

test('E8.35 — builder test panel chats with the flow without sending anything', async () => {
  await createFlow({ name: 'Panel test' })
  await openAutomation()
  await win.getByTestId('automation-tab-flows').click()
  await win.getByTestId('flow-edit').click()
  await win.getByTestId('flow-side-test').click()
  await win.getByTestId('flow-test-start').click()
  await expect(win.getByTestId('flow-test-bot').first()).toContainText('Pick one')
  await win.getByTestId('flow-test-input').fill('3')
  await win.getByTestId('flow-test-send').click()
  await expect(win.getByTestId('flow-test-customer')).toHaveText('3')
  await expect(win.getByTestId('flow-test-bot').last()).toHaveText(
    'A person will reply soon.',
  )
  await expect(win.getByTestId('flow-test-handoff')).toBeVisible()
  const before = sends().length
  await win.getByTestId('flow-builder-back').click()

  // Delete asks first.
  await win.getByTestId('flow-delete').click()
  await expect(win.getByTestId('flow-delete-dialog')).toBeVisible()
  await win.getByTestId('flow-delete-confirm').click()
  await expect(win.getByTestId('flow-row')).toHaveCount(0)
  expect(sends().length).toBe(before)
})

test("E8.36 — the welcome message goes out once, on a chat's first message only", async () => {
  await call('autoreply:setConfig', {
    ...DISABLED_AUTOREPLY,
    welcome: { enabled: true, text: 'Welcome {{Name}}!' },
  })
  const from = '+919100003601'
  say(from, 'hello there')
  const [welcome] = await expectSends(from, 1)
  expect(welcome).toMatch(/^Welcome .+!$/)
  expect(
    query<{ w: string | null }>(
      'SELECT welcomedAt AS w FROM Chat WHERE id = ?',
      chatId(from),
    )[0]?.w,
  ).not.toBeNull()
  say(from, 'second message')
  await expectNoMore(from, 1)
})

test('E8.37 — the away message goes out outside business hours and respects its cooldown', async () => {
  // Every day closed: "now" is always outside business hours.
  await call('autoreply:setConfig', {
    ...DISABLED_AUTOREPLY,
    away: { ...DISABLED_AUTOREPLY.away, enabled: true },
  })
  const from = '+919100003701'
  say(from, 'anyone there?')
  expect(await expectSends(from, 1)).toEqual(['We are closed.'])
  say(from, 'hello??')
  await expectNoMore(from, 1)

  // Open around the clock: no away message.
  const allDay = [{ start: '00:00', end: '23:59' }]
  await call('autoreply:setConfig', {
    ...DISABLED_AUTOREPLY,
    away: {
      ...DISABLED_AUTOREPLY.away,
      enabled: true,
      hours: {
        mon: allDay,
        tue: allDay,
        wed: allDay,
        thu: allDay,
        fri: allDay,
        sat: allDay,
        sun: allDay,
      },
    },
  })
  const open = '+919100003702'
  say(open, 'hi')
  await expectNoMore(open, 0)
})

test('E8.37b — welcome, away and keyword replies all go out during quiet hours', async () => {
  // Customer decisions D151/D152: quiet hours hold campaign-style sending
  // only; anything answering someone who just wrote goes out at any hour.
  const clock = (offsetMin: number) => {
    const d = new Date(Date.now() + offsetMin * 60_000)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  await call('autoreply:setConfig', {
    welcome: { ...DISABLED_AUTOREPLY.welcome, enabled: true },
    away: { ...DISABLED_AUTOREPLY.away, enabled: true },
  })
  await call('settings:setSendingDefaults', {
    quietHoursEnabled: true,
    quietHoursStart: clock(-60),
    quietHoursEnd: clock(60),
  })
  try {
    const from = '+919100003711'
    say(from, 'late night question')
    const bodies = await expectSends(from, 2)
    expect(bodies).toContain('We are closed.')
    expect(bodies.some((b) => b.startsWith('Welcome'))).toBe(true)

    // Quiet hours are for campaigns only (D152): a keyword rule answers too.
    const rule = await call<{ id: string }>('rule:create', {
      name: 'Night rule',
      keywords: ['pricing'],
      replyText: 'Prices attached',
      cooldownMinutes: 0,
    })
    say(from, 'pricing')
    expect(await expectSends(from, 3)).toContain('Prices attached')
    await call('rule:delete', { id: rule.id })
  } finally {
    await call('settings:setSendingDefaults', { quietHoursEnabled: false })
    await call('autoreply:setConfig', DISABLED_AUTOREPLY)
  }
})

test('E8.38 — welcome & away screen saves settings and explains bad hours', async () => {
  await openAutomation()
  await win.getByTestId('automation-tab-welcome').click()
  await win.getByTestId('welcome-enabled').check()
  await win.getByTestId('welcome-text').fill('Hello {{Name}}, welcome!')
  await win.getByTestId('away-enabled').check()
  await win.getByTestId('away-cooldown').fill('6')
  await win.getByTestId('hours-sat-open').check()
  await win.getByTestId('welcome-away-save').click()
  await expect(win.getByTestId('toast').filter({ hasText: 'saved' })).toBeVisible()

  const config = await call<{
    welcome: { enabled: boolean; text: string }
    away: { enabled: boolean; cooldownHours: number; hours: Record<string, unknown[]> }
  }>('autoreply:getConfig')
  expect(config.welcome).toEqual({ enabled: true, text: 'Hello {{Name}}, welcome!' })
  expect(config.away.enabled).toBe(true)
  expect(config.away.cooldownHours).toBe(6)
  expect(config.away.hours.sat).toEqual([{ start: '09:00', end: '18:00' }])

  await win.getByTestId('hours-sat-end-0').fill('08:00')
  await win.getByTestId('welcome-away-save').click()
  await expect(
    win
      .getByTestId('toast')
      .filter({ hasText: 'On Saturday, the closing time must be later' }),
  ).toBeVisible()
  await dismissToasts()
})

test('E8.39 — welcome and away skip opted-out and suppressed numbers', async () => {
  await call('autoreply:setConfig', {
    welcome: { enabled: true, text: 'Welcome!' },
    away: { ...DISABLED_AUTOREPLY.away, enabled: true },
  })
  const suppressed = '+919100003901'
  await call('suppression:add', { phones: [suppressed], reason: 'E8.39' })
  say(suppressed, 'hello')
  await expectNoMore(suppressed, 0)

  // The control: the same settings do answer an ordinary new number.
  const ordinary = '+919100003902'
  say(ordinary, 'hello')
  expect(await expectSends(ordinary, 2)).toEqual(['Welcome!', 'We are closed.'])
})
