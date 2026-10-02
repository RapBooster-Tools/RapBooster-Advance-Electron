/**
 * Devices & safety (D89): warmup ramp and conversations, the health pause,
 * Business detection and catalogs, labels mirrored as tags, typing simulation,
 * the Sending & safety settings and the dashboard's analytics (E6.60–E6.79).
 *
 * Everything runs against the mock WhatsApp transport. The send and action logs
 * (WA_MOCK_SEND_LOG / WA_MOCK_ACTION_LOG) are how a spec sees what reached
 * "WhatsApp"; WA_MOCK_INJECT drives label events in.
 */
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { APP_READY_TIMEOUT_MS } from './fixtures/constants'
import { activateWith, cleanupUserDataDir, newUserDataDir } from './fixtures/licensed-app'

async function launch(
  dir: string,
  env: Record<string, string> = {},
): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${dir}`],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: undefined,
      LICENSE_SERVICE: 'mock',
      WA_TRANSPORT: 'mock',
      NODE_ENV: 'test',
      ...env,
    } as NodeJS.ProcessEnv,
  })
  const win = await app.firstWindow()
  await win
    .locator('[data-testid="license-key"], [data-testid="nav-dashboard"]')
    .first()
    .waitFor({ state: 'visible', timeout: APP_READY_TIMEOUT_MS })
  if (await win.getByTestId('license-key').isVisible()) {
    await activateWith(win, 'VALID-E2E-0001')
  }
  await win
    .getByTestId('nav-dashboard')
    .waitFor({ state: 'visible', timeout: APP_READY_TIMEOUT_MS })
  return { app, win }
}

/** Create and connect a device; resolves once main has recorded it connected. */
async function connectedDevice(win: Page, name: string): Promise<string> {
  const id = await win.evaluate(async (n) => {
    const d = await window.api.invoke('device:create', { name: n })
    if (!d.ok) throw new Error(d.error.userMessage)
    await window.api.invoke('device:connect', { id: d.data.id })
    return d.data.id
  }, name)
  await expect
    .poll(() => deviceRow(win, id).then((d) => d?.status), { timeout: 20_000 })
    .toBe('connected')
  return id
}

async function deviceRow(win: Page, id: string) {
  const list = await win.evaluate(() => window.api.invoke('device:list'))
  if (!list.ok) throw new Error('device:list')
  return list.data.find((d) => d.id === id)
}

async function seedList(win: Page, phones: string[], name = 'Suite'): Promise<string> {
  return win.evaluate(
    async ({ list, name: listName }) => {
      const created = await window.api.invoke('contactList:create', {
        name: `${listName} ${Date.now()}`,
        customFields: [],
      })
      if (!created.ok) throw new Error('list')
      for (const [i, phone] of list.entries()) {
        await window.api.invoke('contacts:create', {
          listId: created.data.id,
          data: { Name: `Person ${i}`, Mobile: phone },
        })
      }
      return created.data.id
    },
    { list: phones, name },
  )
}

async function startCampaign(win: Page, deviceId: string, listId: string): Promise<void> {
  await win.evaluate(
    async ({ device, list }) => {
      const t = await window.api.invoke('template:create', {
        name: `Suite tpl ${Date.now()}`,
        type: 'text',
        content: 'Hello {{Name}}',
      })
      if (!t.ok) throw new Error('template')
      const c = await window.api.invoke('campaign:create', {
        name: `Suite camp ${Date.now()}`,
        templateId: t.data.id,
        deviceIds: [device],
        listIds: [list],
        delayFrom: 0,
        delayTo: 0,
        sleepDuration: 0,
        sleepAfter: 100,
      })
      if (!c.ok) throw new Error(c.error.userMessage)
      const s = await window.api.invoke('campaign:start', { id: c.data.id })
      if (!s.ok) throw new Error(s.error.userMessage)
    },
    { device: deviceId, list: listId },
  )
}

function query<T>(dir: string, sql: string, ...params: string[]): T[] {
  const db = new DatabaseSync(join(dir, 'rapbooster.db'), { readOnly: true })
  try {
    return db.prepare(sql).all(...params) as unknown as T[]
  } finally {
    db.close()
  }
}

const sentCount = (dir: string): number =>
  Number(
    query<{ n: number }>(
      dir,
      `SELECT COUNT(*) AS n FROM CampaignRecipient WHERE status = 'sent'`,
    )[0]?.n ?? 0,
  )

function jsonl<T>(path: string): T[] {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as T)
}

const phones = (n: number, base: number): string[] =>
  Array.from({ length: n }, (_, i) => `+919${String(base + i).padStart(9, '0')}`)

test('E6.60 — warmup starts at day 1 and its cap stops a campaign through the throttle', async () => {
  test.setTimeout(150_000)
  const dir = newUserDataDir()
  const { app, win } = await launch(dir)
  try {
    const deviceId = await connectedDevice(win, 'New number')
    const before = await deviceRow(win, deviceId)
    expect(before?.warmupDay).toBeNull()
    expect(before?.effectiveCap).toBe(200)

    const set = await win.evaluate(
      (id) => window.api.invoke('device:setWarmup', { id, enabled: true }),
      deviceId,
    )
    expect(set.ok).toBe(true)
    const warm = await deviceRow(win, deviceId)
    expect(warm?.warmupEnabled).toBe(true)
    expect(warm?.warmupDay).toBe(1)
    expect(warm?.effectiveCap).toBe(20)

    const listId = await seedList(win, phones(25, 610000000))
    await startCampaign(win, deviceId, listId)

    // Day 1 of warmup allows 20, so 5 of the 25 stay pending.
    await expect.poll(() => sentCount(dir), { timeout: 60_000 }).toBe(20)
    await win.waitForTimeout(3000)
    expect(sentCount(dir)).toBe(20)
    expect((await deviceRow(win, deviceId))?.dailySentCount).toBe(20)
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.61 — turning warmup off restores the global cap and forgets the start date', async () => {
  const dir = newUserDataDir()
  const { app, win } = await launch(dir)
  try {
    const id = await connectedDevice(win, 'Toggle')
    await win.evaluate(
      (d) => window.api.invoke('device:setWarmup', { id: d, enabled: true }),
      id,
    )
    await win.evaluate(
      (d) => window.api.invoke('device:setWarmup', { id: d, enabled: false }),
      id,
    )
    const row = await deviceRow(win, id)
    expect(row?.warmupEnabled).toBe(false)
    expect(row?.warmupDay).toBeNull()
    expect(row?.effectiveCap).toBe(200)
    const stored = query<{ warmupStartedAt: string | null }>(
      dir,
      'SELECT warmupStartedAt FROM Device WHERE id = ?',
      id,
    )
    expect(stored[0]?.warmupStartedAt).toBeNull()
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.62 — a health pause shows on the Devices screen and "Resume now" clears it', async () => {
  const dir = newUserDataDir()
  let session = await launch(dir)
  let id: string
  try {
    id = await session.win.evaluate(async () => {
      const d = await window.api.invoke('device:create', { name: 'Flagged' })
      if (!d.ok) throw new Error('device')
      return d.data.id
    })
  } finally {
    await session.app.close()
  }

  // The health breaker sets these; a spec can only seed them with the app shut.
  const db = new DatabaseSync(join(dir, 'rapbooster.db'))
  try {
    db.prepare(
      'UPDATE Device SET healthPausedUntil = ?, healthReason = ? WHERE id = ?',
    ).run(
      new Date(Date.now() + 6 * 3_600_000).toISOString(),
      'Most recent sends failed.',
      id,
    )
  } finally {
    db.close()
  }

  session = await launch(dir)
  try {
    const { win } = session
    const paused = await deviceRow(win, id)
    expect(paused?.healthPausedUntil).not.toBeNull()
    expect(paused?.healthReason).toBe('Most recent sends failed.')

    await win.getByTestId('nav-devices').click()
    const badge = win.getByTestId('health-paused')
    await expect(badge).toContainText('Paused for safety')
    await expect(badge).toContainText('Most recent sends failed.')
    await win.getByTestId('resume-device').click()
    await expect(badge).toHaveCount(0)

    const cleared = await deviceRow(win, id)
    expect(cleared?.healthPausedUntil).toBeNull()
    expect(cleared?.healthReason).toBeNull()
  } finally {
    await session.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.63 — a Business account is detected and its catalog lists', async () => {
  const dir = newUserDataDir()
  const { app, win } = await launch(dir, { WA_MOCK_BUSINESS: '1' })
  try {
    const id = await connectedDevice(win, 'Shop')
    await expect
      .poll(() => deviceRow(win, id).then((d) => d?.isBusiness), { timeout: 20_000 })
      .toBe(true)

    const catalog = await win.evaluate(
      (deviceId) => window.api.invoke('catalog:list', { deviceId }),
      id,
    )
    expect(catalog.ok).toBe(true)
    if (catalog.ok) expect(catalog.data.map((p) => p.id)).toEqual(['prod-1', 'prod-2'])

    const sync = await win.evaluate(
      (deviceId) => window.api.invoke('device:syncLabels', { id: deviceId }),
      id,
    )
    expect(sync.ok && sync.data.isBusiness).toBe(true)

    await win.getByTestId('nav-devices').click()
    await expect(win.getByTestId('business-badge')).toBeVisible()
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.64 — catalog:list refuses a regular account and a disconnected device clearly', async () => {
  const dir = newUserDataDir()
  const { app, win } = await launch(dir)
  try {
    const id = await connectedDevice(win, 'Personal')
    const regular = await win.evaluate(
      (deviceId) => window.api.invoke('catalog:list', { deviceId }),
      id,
    )
    expect(regular.ok).toBe(false)
    if (!regular.ok) {
      expect(regular.error.userMessage).toBe(
        'Catalogs exist only on WhatsApp Business accounts.',
      )
    }
    expect((await deviceRow(win, id))?.isBusiness).toBe(false)

    const offline = await win.evaluate(async () => {
      const d = await window.api.invoke('device:create', { name: 'Offline' })
      if (!d.ok) throw new Error('device')
      return window.api.invoke('catalog:list', { deviceId: d.data.id })
    })
    expect(offline.ok).toBe(false)
    if (!offline.ok) expect(offline.error.code).toBe('DEVICE_NOT_CONNECTED')
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.65 — WhatsApp Business labels mirror into tags on every matching contact', async () => {
  test.setTimeout(150_000)
  const dir = newUserDataDir()
  const target = '+919812345678'
  let session = await launch(dir)
  try {
    // The same person in two lists, plus someone the label never touches.
    await seedList(session.win, [target, '+919812340000'], 'First')
    await seedList(session.win, [target], 'Second')
  } finally {
    await session.app.close()
  }

  // A manual tag already called "Gold": the label must not take it over.
  const db = new DatabaseSync(join(dir, 'rapbooster.db'))
  try {
    db.prepare(
      `INSERT INTO Tag (id, name, color, source, createdAt) VALUES ('manual-gold', 'Gold', '#000000', 'manual', ?)`,
    ).run(new Date().toISOString())
  } finally {
    db.close()
  }

  const inject = join(dir, 'inject.jsonl')
  session = await launch(dir, { WA_MOCK_INJECT: inject })
  try {
    const { win } = session
    const deviceId = await connectedDevice(win, 'Labels')
    const push = (line: Record<string, unknown>) =>
      appendFileSync(inject, `${JSON.stringify({ deviceId: '*', ...line })}\n`)

    push({ type: 'label', labelId: '1', name: 'VIP', color: 2 })
    push({ type: 'label', labelId: '2', name: 'Gold', color: 5 })
    push({
      type: 'labelAssociation',
      labelId: '1',
      chatJid: '919812345678@s.whatsapp.net',
      action: 'add',
    })

    type TagRow = { id: string; name: string; source: string; waLabelId: string }
    const waTags = () =>
      query<TagRow>(dir, `SELECT * FROM Tag WHERE source = 'wa_label' ORDER BY name`)
    await expect
      .poll(() => waTags().map((t) => t.name), { timeout: 15_000 })
      .toEqual(['Gold (WA)', 'VIP'])
    const vip = waTags().find((t) => t.name === 'VIP')
    expect(vip?.waLabelId).toBe(`${deviceId}:1`)
    expect(
      query<{ name: string }>(dir, `SELECT name FROM Tag WHERE id = 'manual-gold'`)[0]
        ?.name,
    ).toBe('Gold')

    const tagged = () =>
      query<{ phone: string }>(
        dir,
        `SELECT c.phone FROM ContactTag ct JOIN Contact c ON c.id = ct.contactId WHERE ct.tagId = ?`,
        vip?.id ?? '',
      ).map((r) => r.phone)
    await expect.poll(tagged, { timeout: 15_000 }).toEqual([target, target])

    push({
      type: 'labelAssociation',
      labelId: '1',
      chatJid: '919812345678@s.whatsapp.net',
      action: 'remove',
    })
    await expect.poll(() => tagged().length, { timeout: 15_000 }).toBe(0)

    push({ type: 'label', labelId: '1', name: 'VIP', color: 2, deleted: true })
    await expect
      .poll(() => waTags().map((t) => t.name), { timeout: 15_000 })
      .toEqual(['Gold (WA)'])
  } finally {
    await session.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.66 — typing simulation shows "composing" before an automated send', async () => {
  const dir = newUserDataDir()
  // One file for both logs keeps sends and presence updates in true order.
  const log = join(dir, 'wa-log.jsonl')
  const { app, win } = await launch(dir, {
    WA_MOCK_SEND_LOG: log,
    WA_MOCK_ACTION_LOG: log,
  })
  try {
    const saved = await win.evaluate(() =>
      window.api.invoke('settings:setSendingDefaults', { simulateTyping: true }),
    )
    expect(saved.ok && saved.data.simulateTyping).toBe(true)

    const deviceId = await connectedDevice(win, 'Typist')
    const listId = await seedList(win, ['+919700000001'])
    await startCampaign(win, deviceId, listId)
    await expect.poll(() => sentCount(dir), { timeout: 60_000 }).toBe(1)

    type Entry = { action?: string; state?: string; to?: string; deviceId: string }
    const entries = jsonl<Entry>(log).filter((e) => e.deviceId === deviceId)
    const composing = entries.findIndex(
      (e) => e.action === 'presence' && e.state === 'composing',
    )
    const send = entries.findIndex((e) => e.action === undefined && e.to !== undefined)
    expect(composing).toBeGreaterThanOrEqual(0)
    expect(send).toBeGreaterThan(composing)
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.67 — two warmup devices hold a short conversation with each other only', async () => {
  test.setTimeout(150_000)
  const dir = newUserDataDir()
  const log = join(dir, 'sends.jsonl')
  const { app, win } = await launch(dir, {
    WA_MOCK_SEND_LOG: log,
    RB_WARMUP_FORCE: '1',
    RB_TICK_MS: '1000',
  })
  try {
    // One conversation a day, so the forced one is the only one this test sees.
    const cfg = await win.evaluate(() =>
      window.api.invoke('warmup:setConfig', {
        autoConversations: true,
        conversationsPerDay: 1,
      }),
    )
    expect(cfg.ok).toBe(true)

    const a = await connectedDevice(win, 'Warm A')
    const b = await connectedDevice(win, 'Warm B')
    for (const id of [a, b]) {
      await win.evaluate(
        (d) => window.api.invoke('device:setWarmup', { id: d, enabled: true }),
        id,
      )
    }
    const phoneOf = new Map<string, string>()
    for (const id of [a, b]) phoneOf.set(id, (await deviceRow(win, id))?.phone ?? '')
    expect(phoneOf.get(a)).toBeTruthy()
    expect(phoneOf.get(a)).not.toBe(phoneOf.get(b))

    type Send = { deviceId: string; to: string; message: { kind: string; body: string } }
    await expect
      .poll(() => jsonl<Send>(log).length, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(2)
    await win.waitForTimeout(4000)
    const sends = jsonl<Send>(log)
    expect(sends.length).toBeGreaterThanOrEqual(2)
    expect(sends.length).toBeLessThanOrEqual(4)

    // Each message goes to the *other* device's own number, alternating sides.
    for (const [i, s] of sends.entries()) {
      const other = s.deviceId === a ? b : a
      expect([a, b]).toContain(s.deviceId)
      expect(s.to).toBe(phoneOf.get(other))
      expect(s.message.kind).toBe('text')
      if (i > 0) expect(s.deviceId).not.toBe(sends[i - 1]?.deviceId)
    }

    // Warmup traffic counts toward each device's daily cap.
    const counted =
      ((await deviceRow(win, a))?.dailySentCount ?? 0) +
      ((await deviceRow(win, b))?.dailySentCount ?? 0)
    expect(counted).toBe(sends.length)
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.68 — Sending & safety settings round-trip and warn on an unlimited cap', async () => {
  const dir = newUserDataDir()
  const { app, win } = await launch(dir)
  try {
    const patch = {
      quietHoursEnabled: true,
      quietHoursStart: '22:30',
      quietHoursEnd: '07:15',
      simulateTyping: true,
      markReadOnReply: false,
      healthBreaker: false,
      attributionHours: 48,
      maxConcurrentDevices: 5,
    }
    const saved = await win.evaluate(
      (p) => window.api.invoke('settings:setSendingDefaults', p),
      patch,
    )
    expect(saved.ok).toBe(true)
    const read = await win.evaluate(() =>
      window.api.invoke('settings:getSendingDefaults'),
    )
    expect(read.ok).toBe(true)
    if (read.ok) {
      expect(read.data).toMatchObject(patch)
      // A partial patch leaves everything else alone.
      expect(read.data.dailyCapPerDevice).toBe(200)
    }

    const same = await win.evaluate(() =>
      window.api.invoke('settings:setSendingDefaults', {
        quietHoursStart: '08:00',
        quietHoursEnd: '08:00',
      }),
    )
    expect(same.ok).toBe(false)

    await win.getByTestId('nav-settings').click()
    await expect(win.getByTestId('sd-quietHoursEnabled')).toBeChecked()
    await expect(win.getByTestId('sd-quietHoursStart')).toHaveValue('22:30')
    await expect(win.getByTestId('sd-markReadOnReply')).not.toBeChecked()
    await expect(win.getByTestId('cap-unlimited-warning')).toHaveCount(0)

    const cap = win.getByTestId('sd-dailyCapPerDevice')
    await cap.fill('0')
    await expect(cap).toHaveValue('0')
    await expect(win.getByTestId('cap-unlimited-warning')).toBeVisible()
    await win.getByTestId('sd-simulateTyping').uncheck()
    await win.getByTestId('save-sending-defaults').click()
    await expect
      .poll(async () => {
        const r = await win.evaluate(() =>
          window.api.invoke('settings:getSendingDefaults'),
        )
        return r.ok ? [r.data.dailyCapPerDevice, r.data.simulateTyping] : null
      })
      .toEqual([0, false])

    const perDay = win.getByTestId('warmup-per-day')
    await expect(perDay).toHaveValue('6')
    await perDay.fill('3')
    await expect(perDay).toHaveValue('3')
    await win.getByTestId('save-warmup').click()
    await expect
      .poll(async () => {
        const r = await win.evaluate(() => window.api.invoke('warmup:getConfig'))
        return r.ok ? r.data : null
      })
      .toEqual({ autoConversations: true, conversationsPerDay: 3 })
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.69 — the dashboard charts seven days and its safety notice dismisses for good', async () => {
  const dir = newUserDataDir()
  const { app, win } = await launch(dir)
  try {
    await connectedDevice(win, 'Dash device')
    // Remount so the new device is in the first analytics read.
    await win.getByTestId('nav-settings').click()
    await win.getByTestId('nav-dashboard').click()

    await expect(win.getByTestId('analytics-chart')).toBeVisible()
    await expect(win.getByTestId('analytics-day')).toHaveCount(7)
    await expect(win.getByTestId('dashboard-device')).toHaveCount(1)
    await expect(win.getByTestId('dashboard-device')).toContainText('Dash device')
    await expect(win.getByTestId('escalated-count')).toHaveText('0')
    await expect(win.getByTestId('drafts-count')).toHaveText('0')

    await win.getByTestId('analytics-table-toggle').click()
    await expect(win.getByTestId('analytics-table').locator('tbody tr')).toHaveCount(7)

    const banner = win.getByTestId('safety-banner')
    await expect(banner).toContainText('200 messages per device per day')
    await win.getByTestId('dismiss-safety-banner').click()
    await expect(banner).toHaveCount(0)
    await expect
      .poll(async () => {
        const r = await win.evaluate(() =>
          window.api.invoke('settings:get', { key: 'notice.safetyDefaults' }),
        )
        return r.ok ? r.data.value : null
      })
      .not.toBeNull()

    await win.getByTestId('nav-settings').click()
    await win.getByTestId('nav-dashboard').click()
    await expect(win.getByTestId('analytics-chart')).toBeVisible()
    await expect(banner).toHaveCount(0)
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.70 — toggling warmup on the Devices screen shows the ramp live', async () => {
  const dir = newUserDataDir()
  const { app, win } = await launch(dir)
  try {
    const id = await connectedDevice(win, 'Screen device')
    await win.getByTestId('nav-devices').click()
    await expect(win.getByTestId('device-card')).toHaveCount(1)

    const toggle = win.getByTestId('warmup-toggle')
    const caption = win.getByTestId('warmup-caption')
    await expect(toggle).not.toBeChecked()
    await expect(caption).toContainText('starts the ramp at day 1')
    await expect(win.getByTestId('device-usage-label')).toHaveText('0 / 200')

    await toggle.check()
    await expect(caption).toHaveText("Day 1 · today's cap 20")
    await expect(win.getByTestId('device-usage-label')).toHaveText('0 / 20')
    expect((await deviceRow(win, id))?.warmupEnabled).toBe(true)

    await toggle.uncheck()
    await expect(caption).toContainText('starts the ramp at day 1')
    await expect(win.getByTestId('device-usage-label')).toHaveText('0 / 200')
    expect((await deviceRow(win, id))?.warmupEnabled).toBe(false)
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})
