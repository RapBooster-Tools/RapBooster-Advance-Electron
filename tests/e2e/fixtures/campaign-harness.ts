/**
 * Harness for the campaign-engine suite (campaign-suite.spec.ts).
 *
 * Every launch records sends, non-send actions and accepts scripted inbound
 * events through files in the run's own userData directory, and runs the
 * scheduler on a one-second tick so parked campaigns resume within a test.
 *
 * Rows owned by features without a handler on this branch (tags, the opt-out
 * list) are written straight into SQLite while the app is closed — never while
 * it runs, because main is the database's only writer (CLAUDE.md §2.4).
 */
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { IpcChannel, IpcRequestInput, IpcResponse } from '../../../shared/ipc'
import { APP_READY_TIMEOUT_MS } from './constants'

export interface Session {
  app: ElectronApplication
  win: Page
}

export const files = (dir: string) => ({
  sends: join(dir, 'sends.jsonl'),
  actions: join(dir, 'actions.jsonl'),
  inject: join(dir, 'inject.jsonl'),
  db: join(dir, 'rapbooster.db'),
})

export async function launch(
  dir: string,
  env: Record<string, string> = {},
): Promise<Session> {
  const f = files(dir)
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${dir}`],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: undefined,
      LICENSE_SERVICE: 'mock',
      WA_TRANSPORT: 'mock',
      NODE_ENV: 'test',
      WA_MOCK_SEND_LOG: f.sends,
      WA_MOCK_ACTION_LOG: f.actions,
      WA_MOCK_INJECT: f.inject,
      WA_MOCK_INVALID_SUFFIX: '000',
      RB_TICK_MS: '1000',
      ...env,
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

/** Invoke a channel from the renderer, throwing the error envelope on failure. */
export async function ipc<C extends IpcChannel>(
  win: Page,
  channel: C,
  request?: IpcRequestInput<C>,
): Promise<IpcResponse<C>> {
  const result = await win.evaluate(
    ([c, r]) => window.api.invoke(c as IpcChannel, r as never),
    [channel, request] as const,
  )
  if (!result.ok) {
    throw new Error(
      `${channel} failed: ${result.error.userMessage} (${result.error.detail ?? ''})`,
    )
  }
  return result.data as IpcResponse<C>
}

/** Same call, returning the envelope so a spec can assert the error. */
export async function ipcResult<C extends IpcChannel>(
  win: Page,
  channel: C,
  request?: IpcRequestInput<C>,
): Promise<{ ok: boolean; message: string }> {
  const result = await win.evaluate(
    ([c, r]) => window.api.invoke(c as IpcChannel, r as never),
    [channel, request] as const,
  )
  return { ok: result.ok, message: result.ok ? '' : result.error.userMessage }
}

export interface SendLine {
  deviceId: string
  to: string
  message: { kind: string; body?: string }
}

export function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as T)
}

export const sends = (dir: string): SendLine[] => readJsonl<SendLine>(files(dir).sends)

/** Read-only query; safe while the app runs. */
export function query<T>(
  dir: string,
  sql: string,
  ...params: Array<string | number>
): T[] {
  const db = new DatabaseSync(files(dir).db, { readOnly: true })
  try {
    return db.prepare(sql).all(...params) as unknown as T[]
  } finally {
    db.close()
  }
}

/**
 * A timestamp in the format Prisma already used in this database, so rows
 * written here read back exactly like rows the app wrote.
 */
function nowLike(db: DatabaseSync): string | number {
  const sample = db
    .prepare('SELECT createdAt AS v, typeof(createdAt) AS t FROM Contact LIMIT 1')
    .get() as { v: string | number; t: string } | undefined
  if (sample?.t === 'integer') return Date.now()
  return new Date().toISOString()
}

/** Write rows while the app is closed. */
function writeOffline(dir: string, fn: (db: DatabaseSync, now: string | number) => void) {
  const db = new DatabaseSync(files(dir).db)
  try {
    db.exec('BEGIN')
    fn(db, nowLike(db))
    db.exec('COMMIT')
  } finally {
    db.close()
  }
}

export function seedTags(
  dir: string,
  tags: Array<{ id: string; name: string; contactIds: string[] }>,
): void {
  writeOffline(dir, (db, now) => {
    const tag = db.prepare(
      'INSERT INTO Tag (id, name, color, source, createdAt) VALUES (?, ?, ?, ?, ?)',
    )
    const link = db.prepare('INSERT INTO ContactTag (contactId, tagId) VALUES (?, ?)')
    for (const t of tags) {
      tag.run(t.id, t.name, '#0078d4', 'manual', now)
      for (const contactId of t.contactIds) link.run(contactId, t.id)
    }
  })
}

export function seedSuppression(dir: string, phones: string[]): void {
  writeOffline(dir, (db, now) => {
    const row = db.prepare(
      'INSERT INTO Suppression (phone, reason, source, createdAt) VALUES (?, ?, ?, ?)',
    )
    for (const phone of phones) row.run(phone, 'Asked to stop', 'manual', now)
  })
}

/** A list of contacts; returns the list id and each phone's contact id. */
export async function createList(
  win: Page,
  name: string,
  phones: string[],
): Promise<{ listId: string; ids: Record<string, string> }> {
  return win.evaluate(
    async ({ listName, numbers }) => {
      const list = await window.api.invoke('contactList:create', {
        name: listName,
        customFields: [],
      })
      if (!list.ok) throw new Error(`list: ${list.error.userMessage}`)
      const ids: Record<string, string> = {}
      for (const [i, phone] of numbers.entries()) {
        const c = await window.api.invoke('contacts:create', {
          listId: list.data.id,
          data: { Name: `${listName} ${i}`, Mobile: phone },
        })
        if (!c.ok) throw new Error(`contact ${phone}: ${c.error.userMessage}`)
        ids[phone] = c.data.id
      }
      return { listId: list.data.id, ids }
    },
    { listName: name, numbers: phones },
  )
}

export async function createDevices(win: Page, count: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < count; i += 1) {
    const d = await ipc(win, 'device:create', { name: `Sender ${i + 1}` })
    ids.push(d.id)
  }
  await connect(win, ids)
  return ids
}

/** Connect devices and wait until the mock reports every one connected. */
export async function connect(win: Page, deviceIds: string[]): Promise<void> {
  for (const id of deviceIds) await ipc(win, 'device:connect', { id })
  await expect
    .poll(
      async () => {
        const devices = await ipc(win, 'device:list')
        return deviceIds.every(
          (id) => devices.find((d) => d.id === id)?.status === 'connected',
        )
      },
      { timeout: 30_000 },
    )
    .toBe(true)
}

export async function createTemplate(
  win: Page,
  content = 'Hi {{Name}}',
): Promise<string> {
  const t = await ipc(win, 'template:create', {
    name: `Suite tpl ${Date.now()}`,
    type: 'text',
    content,
  })
  return t.id
}

export async function createCampaign(
  win: Page,
  input: Partial<IpcRequestInput<'campaign:create'>> & {
    templateId: string
    deviceIds: string[]
  },
): Promise<string> {
  const c = await ipc(win, 'campaign:create', {
    name: `Suite ${Date.now()}`,
    listIds: [],
    delayFrom: 0,
    delayTo: 0,
    sleepDuration: 0,
    sleepAfter: 100,
    ...input,
  })
  return c.id
}

export interface RecipientRow {
  id: string
  phone: string
  deviceId: string
  status: string
  attempts: number
  error: string | null
  messageId: string | null
}

export const recipients = (dir: string, campaignId: string): RecipientRow[] =>
  query<RecipientRow>(
    dir,
    `SELECT id, phone, deviceId, status, attempts, error, messageId
       FROM CampaignRecipient WHERE campaignId = ? ORDER BY rowid`,
    campaignId,
  )

export const statusOf = (dir: string, campaignId: string): string =>
  query<{ status: string }>(
    dir,
    'SELECT status FROM Campaign WHERE id = ?',
    campaignId,
  )[0]?.status ?? 'missing'

/** "HH:MM" for now plus an offset, in the machine's local time. */
export function clock(offsetMinutes: number): string {
  const d = new Date(Date.now() + offsetMinutes * 60_000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
