/**
 * Drip sequences (D89): enrollment, timed steps, stop-on-reply, pause,
 * opt-outs, unenroll and offline devices.
 *
 * The scheduler tick is shortened to 1 s (RB_TICK_MS) so a step with a zero
 * delay goes out within seconds. Sends are asserted from the mock transport's
 * send log and state from the database, read-only.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { APP_READY_TIMEOUT_MS } from './fixtures/constants'
import { cleanupUserDataDir, newUserDataDir } from './fixtures/licensed-app'

interface Session {
  app: ElectronApplication
  win: Page
}

const sendLog = (dir: string) => join(dir, 'sends.jsonl')
const injectFile = (dir: string) => join(dir, 'inject.jsonl')

async function launch(dir: string): Promise<Session> {
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${dir}`],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: undefined,
      LICENSE_SERVICE: 'mock',
      WA_TRANSPORT: 'mock',
      WA_MOCK_SEND_LOG: sendLog(dir),
      WA_MOCK_INJECT: injectFile(dir),
      RB_TICK_MS: '1000',
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

interface Fixture {
  deviceId: string
  listId: string
  templateIds: string[]
}

/**
 * A list of `phones`, one device (connected unless told otherwise) and one
 * text template per step. Pacing delays are zeroed: pacing is the throttle's
 * concern and is covered elsewhere.
 */
async function seed(
  win: Page,
  opts: { phones: string[]; steps: number; connect?: boolean },
): Promise<Fixture> {
  return win.evaluate(async ({ phones, steps, connect }) => {
    await window.api.invoke('settings:setSendingDefaults', { delayFrom: 0, delayTo: 0 })
    const list = await window.api.invoke('contactList:create', {
      name: `Seq list ${Date.now()}`,
      customFields: [],
    })
    if (!list.ok) throw new Error('list')
    for (const [i, phone] of phones.entries()) {
      const c = await window.api.invoke('contacts:create', {
        listId: list.data.id,
        data: { Name: `Person ${i}`, Mobile: phone },
      })
      if (!c.ok) throw new Error(`contact ${c.error.detail ?? ''}`)
    }
    const device = await window.api.invoke('device:create', { name: 'Drip device' })
    if (!device.ok) throw new Error('device')
    if (connect !== false) {
      await window.api.invoke('device:connect', { id: device.data.id })
      for (let i = 0; i < 100; i += 1) {
        const all = await window.api.invoke('device:list')
        if (
          all.ok &&
          all.data.find((d) => d.id === device.data.id)?.status === 'connected'
        )
          break
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    const templateIds: string[] = []
    for (let s = 0; s < steps; s += 1) {
      const t = await window.api.invoke('template:create', {
        name: `Step ${s + 1} tpl ${Date.now()}`,
        type: 'text',
        content: `Step ${s + 1} for {{Name}}`,
      })
      if (!t.ok) throw new Error('template')
      templateIds.push(t.data.id)
    }
    return { deviceId: device.data.id, listId: list.data.id, templateIds }
  }, opts)
}

async function createSequence(
  win: Page,
  f: Fixture,
  delays: number[],
  extra: { stopOnReply?: boolean } = {},
): Promise<string> {
  return win.evaluate(
    async ({ f, delays, extra }) => {
      const r = await window.api.invoke('sequence:create', {
        name: `Drip ${Date.now()}`,
        deviceIds: [f.deviceId],
        steps: delays.map((delayMinutes, i) => ({
          templateId: f.templateIds[i]!,
          delayMinutes,
        })),
        ...extra,
      })
      if (!r.ok)
        throw new Error(`sequence:create ${r.error.detail ?? r.error.userMessage}`)
      return r.data.id
    },
    { f, delays, extra },
  )
}

async function enroll(
  win: Page,
  id: string,
  listIds: string[],
): Promise<{ enrolled: number; skipped: number }> {
  return win.evaluate(
    async ({ id, listIds }) => {
      const r = await window.api.invoke('sequence:enroll', { id, listIds })
      if (!r.ok) throw new Error(`enroll ${r.error.detail ?? r.error.userMessage}`)
      return r.data
    },
    { id, listIds },
  )
}

interface Sent {
  to: string
  body: string
}

function sends(dir: string): Sent[] {
  const path = sendLog(dir)
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as { to: string; message: { body?: string } })
    .map((e) => ({ to: e.to, body: e.message.body ?? '' }))
}

interface EnrollmentRow {
  id: string
  phone: string
  status: string
  nextStep: number
  stoppedReason: string | null
}

function enrollments(dir: string): EnrollmentRow[] {
  const db = new DatabaseSync(join(dir, 'rapbooster.db'), { readOnly: true })
  try {
    return db
      .prepare(
        'SELECT id, phone, status, nextStep, stoppedReason FROM SequenceEnrollment ORDER BY phone',
      )
      .all() as unknown as EnrollmentRow[]
  } finally {
    db.close()
  }
}

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

function reply(dir: string, from: string): void {
  appendFileSync(
    injectFile(dir),
    `${JSON.stringify({ type: 'message', deviceId: '*', from, body: 'Thanks!' })}\n`,
  )
}

const A = '+919811100101'
const B = '+919811100102'

test('E6.20 — a two-step sequence sends both steps in order and completes', async () => {
  const dir = newUserDataDir()
  const { app, win } = await launch(dir)
  try {
    const f = await seed(win, { phones: [A, B], steps: 2 })
    const id = await createSequence(win, f, [0, 0])
    expect(await enroll(win, id, [f.listId])).toEqual({ enrolled: 2, skipped: 0 })

    await expect
      .poll(() => enrollments(dir).map((e) => e.status), { timeout: 45_000 })
      .toEqual(['completed', 'completed'])

    for (const [i, phone] of [A, B].entries()) {
      expect(sends(dir).filter((s) => s.to === phone)).toEqual([
        { to: phone, body: `Step 1 for Person ${i}` },
        { to: phone, body: `Step 2 for Person ${i}` },
      ])
    }
    expect(enrollments(dir).every((e) => e.nextStep === 2)).toBe(true)

    const listed = await win.evaluate(() => window.api.invoke('sequence:list'))
    expect(listed.ok && listed.data[0]?.counts).toEqual({
      active: 0,
      completed: 2,
      stopped: 0,
      failed: 0,
    })
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.21 — a reply stops the sequence before the next step', async () => {
  const dir = newUserDataDir()
  const { app, win } = await launch(dir)
  try {
    const f = await seed(win, { phones: [A], steps: 2 })
    const id = await createSequence(win, f, [0, 1])
    await enroll(win, id, [f.listId])

    await expect.poll(() => sends(dir).length, { timeout: 30_000 }).toBe(1)
    reply(dir, A)

    await expect
      .poll(() => enrollments(dir)[0], { timeout: 15_000 })
      .toMatchObject({ status: 'stopped', stoppedReason: 'Replied', nextStep: 1 })
    expect(sends(dir)).toEqual([{ to: A, body: 'Step 1 for Person 0' }])
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.22 — with stop-on-reply off, a reply does not stop the sequence', async () => {
  // Step 2 waits the minimum non-zero delay (1 minute), so this spec is slow by
  // design: it proves the step that follows a reply really is sent.
  test.setTimeout(240_000)
  const dir = newUserDataDir()
  const { app, win } = await launch(dir)
  try {
    const f = await seed(win, { phones: [A], steps: 2 })
    const id = await createSequence(win, f, [0, 1], { stopOnReply: false })
    await enroll(win, id, [f.listId])

    await expect.poll(() => sends(dir).length, { timeout: 30_000 }).toBe(1)
    reply(dir, A)
    await expect.poll(() => inboundCount(dir), { timeout: 15_000 }).toBe(1)
    expect(enrollments(dir)[0]).toMatchObject({ status: 'active', nextStep: 1 })

    await expect
      .poll(() => enrollments(dir)[0]?.status, { timeout: 120_000 })
      .toBe('completed')
    expect(sends(dir).map((s) => s.body)).toEqual([
      'Step 1 for Person 0',
      'Step 2 for Person 0',
    ])
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.23 — a paused sequence sends nothing until it is resumed', async () => {
  const dir = newUserDataDir()
  const { app, win } = await launch(dir)
  try {
    const f = await seed(win, { phones: [A, B], steps: 1 })
    const id = await createSequence(win, f, [0])
    await win.evaluate(
      (sid) => window.api.invoke('sequence:update', { id: sid, status: 'paused' }),
      id,
    )
    await enroll(win, id, [f.listId])

    // Several ticks pass.
    await win.waitForTimeout(5_000)
    expect(sends(dir)).toHaveLength(0)
    expect(enrollments(dir).map((e) => e.status)).toEqual(['active', 'active'])

    await win.evaluate(
      (sid) => window.api.invoke('sequence:update', { id: sid, status: 'active' }),
      id,
    )
    await expect.poll(() => sends(dir).length, { timeout: 30_000 }).toBe(2)
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.24 — opted-out and duplicate numbers are skipped at enrollment', async () => {
  const dir = newUserDataDir()
  let session = await launch(dir)
  let f: Fixture
  let secondList: string
  let id: string
  try {
    f = await seed(session.win, { phones: [A, B], steps: 1 })
    // The same number as A in a second list: one person, two contacts.
    secondList = await session.win.evaluate(async (phone) => {
      const list = await window.api.invoke('contactList:create', {
        name: `Seq dup ${Date.now()}`,
        customFields: [],
      })
      if (!list.ok) throw new Error('list')
      await window.api.invoke('contacts:create', {
        listId: list.data.id,
        data: { Name: 'Same person', Mobile: phone },
      })
      return list.data.id
    }, A)
    id = await createSequence(session.win, f, [0])
  } finally {
    await session.app.close()
  }

  // Never write the database while the app is running.
  const db = new DatabaseSync(join(dir, 'rapbooster.db'))
  try {
    db.prepare(`INSERT INTO Suppression (phone, reason, source) VALUES (?, ?, ?)`).run(
      B,
      'Asked to stop',
      'manual',
    )
  } finally {
    db.close()
  }

  session = await launch(dir)
  try {
    await session.win.evaluate(
      (deviceId) => window.api.invoke('device:connect', { id: deviceId }),
      f.deviceId,
    )
    expect(await enroll(session.win, id, [f.listId, secondList])).toEqual({
      enrolled: 1,
      skipped: 2,
    })
    // Enrolling again adds nobody.
    expect(await enroll(session.win, id, [f.listId, secondList])).toEqual({
      enrolled: 0,
      skipped: 3,
    })

    await expect
      .poll(() => enrollments(dir).map((e) => e.status), { timeout: 30_000 })
      .toEqual(['completed'])
    expect(sends(dir).map((s) => s.to)).toEqual([A])
  } finally {
    await session.app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.25 — unenrolled contacts are stopped and receive nothing', async () => {
  const dir = newUserDataDir()
  const { app, win } = await launch(dir)
  try {
    const f = await seed(win, { phones: [A, B], steps: 1 })
    // A one-minute first step leaves time to unenroll before anything is sent.
    const id = await createSequence(win, f, [1])
    await enroll(win, id, [f.listId])

    const target = enrollments(dir).find((e) => e.phone === A)!
    const result = await win.evaluate(
      (enrollmentId) =>
        window.api.invoke('sequence:unenroll', { enrollmentIds: [enrollmentId] }),
      target.id,
    )
    expect(result.ok).toBe(true)

    const rows = enrollments(dir)
    expect(rows.find((e) => e.phone === A)).toMatchObject({
      status: 'stopped',
      stoppedReason: 'Removed',
    })
    expect(rows.find((e) => e.phone === B)?.status).toBe('active')

    const page = await win.evaluate(
      (sid) => window.api.invoke('sequence:enrollments', { id: sid, status: 'stopped' }),
      id,
    )
    expect(page.ok && page.data.items.map((e) => e.phone)).toEqual([A])
    expect(sends(dir)).toHaveLength(0)
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.26 — an enrollment waits while its device is offline', async () => {
  const dir = newUserDataDir()
  const { app, win } = await launch(dir)
  try {
    const f = await seed(win, { phones: [A], steps: 1, connect: false })
    const id = await createSequence(win, f, [0])
    await enroll(win, id, [f.listId])

    await win.waitForTimeout(5_000)
    expect(sends(dir)).toHaveLength(0)
    expect(enrollments(dir)[0]).toMatchObject({ status: 'active', nextStep: 0 })

    // And it goes out once the device is back.
    await win.evaluate(
      (deviceId) => window.api.invoke('device:connect', { id: deviceId }),
      f.deviceId,
    )
    await expect
      .poll(() => enrollments(dir)[0]?.status, { timeout: 30_000 })
      .toBe('completed')
    expect(sends(dir).map((s) => s.to)).toEqual([A])
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})

test('E6.27 — create, enroll and inspect a sequence from the UI', async () => {
  const dir = newUserDataDir()
  const { app, win } = await launch(dir)
  try {
    const f = await seed(win, { phones: [A], steps: 2 })
    await win.getByTestId('nav-sequences').click()
    await expect(win.getByTestId('page-title')).toHaveText('Drip Sequences')

    await win.getByTestId('new-sequence').first().click()
    const editor = win.getByTestId('sequence-editor')
    await expect(editor).toBeVisible()

    // Saving without devices is refused with a readable reason.
    const name = editor.getByTestId('seq-name')
    await name.fill('Welcome drip')
    await expect(name).toHaveValue('Welcome drip')
    await editor.getByTestId('seq-step-template-0').selectOption(f.templateIds[0]!)
    await editor.getByTestId('seq-save').click()
    await expect(editor.getByTestId('seq-error')).toContainText('device')

    await editor.getByTestId(`seq-device-${f.deviceId}`).check()
    await editor.getByTestId('seq-add-step').click()
    await editor.getByTestId('seq-step-template-1').selectOption(f.templateIds[1]!)
    await editor.getByTestId('seq-step-delay-1').fill('2')
    await editor.getByTestId('seq-step-unit-1').selectOption('days')
    await editor.getByTestId('seq-save').click()
    await expect(editor).toBeHidden()

    const card = win.getByTestId('sequence-card')
    await expect(card).toHaveCount(1)
    await expect(card.getByTestId('sequence-name')).toHaveText('Welcome drip')
    await expect(card).toContainText('2 steps')

    const stored = await win.evaluate(() => window.api.invoke('sequence:list'))
    expect(stored.ok && stored.data[0]?.steps.map((s) => s.delayMinutes)).toEqual([
      0, 2880,
    ])

    await card.getByTestId('enroll-sequence').click()
    const dialog = win.getByTestId('enroll-dialog')
    await dialog.getByTestId(`enroll-list-${f.listId}`).check()
    await dialog.getByTestId('enroll-submit').click()
    await expect(dialog).toBeHidden()

    // Step 1 goes out; step 2 waits two days.
    await expect.poll(() => sends(dir).length, { timeout: 30_000 }).toBe(1)
    await win.getByTestId('refresh-sequences').click()
    await expect(card.getByTestId('sequence-counts')).toContainText('Active: 1')

    await card.getByTestId('view-enrollments').click()
    const table = win.getByTestId('enrollments-dialog')
    await expect(table.getByTestId('enrollment-row')).toHaveCount(1)
    await expect(table.getByTestId('enrollment-row')).toContainText('1 / 2')

    // Unenroll from the table: the row is stopped, not deleted.
    await table.locator('[data-testid^="enrollment-select-"]').check()
    await table.getByTestId('unenroll-selected').click()
    await expect(table.getByTestId('enrollment-status')).toHaveText('stopped')
    expect(enrollments(dir)[0]).toMatchObject({
      status: 'stopped',
      stoppedReason: 'Removed',
    })
  } finally {
    await app.close()
    cleanupUserDataDir(dir)
  }
})
