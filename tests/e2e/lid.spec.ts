/**
 * LID → phone number (D129).
 *
 * WhatsApp addresses many people by a LID, an opaque id that is not their
 * number. The mock resolves LIDs with the same resolver the Baileys transport
 * uses (transport/lid.ts), so these specs cover: a number carried alongside
 * the LID, a number already in the account's mapping store, a number still
 * hidden (shown as hidden, never as fake digits), and the repair that moves
 * chats, opt-outs and calls onto the real number once WhatsApp reveals it.
 *
 * All numbers and LIDs here are fakes.
 */
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  cleanupUserDataDir,
  launchLicensed,
  newUserDataDir,
} from './fixtures/licensed-app'

let dir: string
let logDir: string
let app: ElectronApplication
let win: Page

const injectFile = () => join(logDir, 'inject.jsonl')

function inject(event: Record<string, unknown>): void {
  appendFileSync(injectFile(), `${JSON.stringify({ deviceId: '*', ...event })}\n`)
}

function query<T>(sql: string, ...params: Array<string | number>): T[] {
  const db = new DatabaseSync(join(dir, 'rapbooster.db'), { readOnly: true })
  try {
    return db.prepare(sql).all(...params) as unknown as T[]
  } finally {
    db.close()
  }
}

async function call<T = unknown>(channel: string, request?: unknown): Promise<T> {
  const result = (await win.evaluate(
    async ([c, r]) => window.api.invoke(c as never, r as never),
    [channel, request] as const,
  )) as { ok: true; data: T } | { ok: false; error: { code: string } }
  if (!result.ok) throw new Error(`${channel}: ${result.error.code}`)
  return result.data
}

type ChatRow = { id: string; phone: string; name: string }
const chatsLike = (digits: string) =>
  query<ChatRow>(
    `SELECT id, phone, name FROM Chat WHERE id LIKE ? OR phone LIKE ?`,
    `%${digits}%`,
    `%${digits}%`,
  )
const messagesIn = (chatId: string) =>
  query<{ n: number }>(`SELECT COUNT(*) AS n FROM Message WHERE chatId = ?`, chatId)[0]!.n

const LID = (n: number) => `21000000000000${n}@lid`
const PHONE = (n: number) => `+91981110000${n}`

test.beforeAll(async () => {
  dir = newUserDataDir()
  logDir = mkdtempSync(join(tmpdir(), 'rapbooster-lid-'))
  process.env.WA_MOCK_INJECT = injectFile()
  ;({ app, win } = await launchLicensed(dir))
  const device = await call<{ id: string }>('device:create', { name: 'LID' })
  await call('device:connect', { id: device.id })
  await expect
    .poll(
      async () =>
        (await call<{ id: string; status: string }[]>('device:list')).find(
          (d) => d.id === device.id,
        )?.status,
      { timeout: 30_000 },
    )
    .toBe('connected')
})

test.afterAll(async () => {
  await app?.close()
  delete process.env.WA_MOCK_INJECT
  cleanupUserDataDir(dir)
  rmSync(logDir, { recursive: true, force: true })
})

test('E8.80 — a LID message that carries the number is filed and shown under the number', async () => {
  inject({
    type: 'message',
    lid: LID(1),
    alt: true,
    from: PHONE(1),
    body: 'hi',
    name: 'Alt Person',
  })
  await expect.poll(() => chatsLike('9811100001').length).toBe(1)
  const [chat] = chatsLike('9811100001')
  expect(chat).toMatchObject({ id: `${PHONE(1)}@s.whatsapp.net`, phone: PHONE(1) })
  expect(chatsLike('210000000000001')).toHaveLength(0)
})

test('E8.81 — a LID the mapping store already knows resolves to the number', async () => {
  inject({ type: 'message', lid: LID(2), stored: true, from: PHONE(2), body: 'hello' })
  await expect.poll(() => chatsLike('9811100002').length).toBe(1)
  expect(chatsLike('9811100002')[0]).toMatchObject({ phone: PHONE(2) })
  expect(chatsLike('210000000000002')).toHaveLength(0)
})

test('E8.82 — an unresolved LID is shown as a hidden number, never as fake digits', async () => {
  inject({ type: 'message', lid: LID(3), body: 'who am I' })
  await expect.poll(() => chatsLike('210000000000003').length).toBe(1)
  const [chat] = chatsLike('210000000000003')
  // Stored as the LID stand-in — not "+210000000000003", which could be a
  // stranger's real number.
  expect(chat).toMatchObject({ id: LID(3), phone: LID(3) })
  expect(query(`SELECT 1 FROM Chat WHERE phone = ?`, '+210000000000003')).toHaveLength(0)
  // Not offered to the contacts grabber either: it is not a number.
  expect(
    query(`SELECT 1 FROM WaContact WHERE phone LIKE ?`, '%210000000000003%'),
  ).toHaveLength(0)

  await win.getByTestId('nav-inbox').click()
  const item = win.getByTestId('chat-item').filter({ hasText: 'who am I' })
  await expect(item).toContainText('Number hidden by WhatsApp')
  await expect(item).not.toContainText('210000000000003')
})

test('E8.83 — when WhatsApp reveals the number, the hidden chat moves onto it', async () => {
  inject({ type: 'lidMapping', lid: LID(3), from: PHONE(3) })
  await expect.poll(() => chatsLike('210000000000003').length).toBe(0)
  const [chat] = chatsLike('9811100003')
  expect(chat).toMatchObject({ phone: PHONE(3) })
  // The conversation came with it.
  expect(messagesIn(chat!.id)).toBe(1)
  await expect(
    win.getByTestId('chat-item').filter({ hasText: 'who am I' }),
  ).toContainText(PHONE(3))
})

test('E8.84 — a hidden chat for someone who already has a chat is merged into it', async () => {
  inject({ type: 'message', from: PHONE(4), body: 'first, by number' })
  await expect.poll(() => chatsLike('9811100004').length).toBe(1)
  inject({ type: 'message', lid: LID(4), body: 'second, by LID' })
  await expect.poll(() => chatsLike('210000000000004').length).toBe(1)

  inject({ type: 'lidMapping', lid: LID(4), from: PHONE(4) })
  await expect.poll(() => chatsLike('210000000000004').length).toBe(0)
  const chats = chatsLike('9811100004')
  expect(chats).toHaveLength(1)
  expect(messagesIn(chats[0]!.id)).toBe(2)
  expect(
    query<{ unreadCount: number }>(
      `SELECT unreadCount FROM Chat WHERE id = ?`,
      chats[0]!.id,
    )[0]?.unreadCount,
  ).toBe(2)
})

test('E8.85 — a STOP from a hidden number is honoured, then moves to the real number', async () => {
  inject({ type: 'message', lid: LID(5), body: 'STOP' })
  await expect
    .poll(() => query(`SELECT 1 FROM Suppression WHERE phone = ?`, LID(5)).length)
    .toBe(1)
  expect(
    query<{ autoReplyOptOut: number }>(
      `SELECT autoReplyOptOut FROM Chat WHERE id = ?`,
      LID(5),
    )[0]?.autoReplyOptOut,
  ).toBe(1)

  inject({ type: 'lidMapping', lid: LID(5), from: PHONE(5) })
  await expect
    .poll(() => query(`SELECT 1 FROM Suppression WHERE phone = ?`, PHONE(5)).length)
    .toBe(1)
  expect(query(`SELECT 1 FROM Suppression WHERE phone = ?`, LID(5))).toHaveLength(0)
  // The merged chat keeps the opt-out.
  expect(
    query<{ autoReplyOptOut: number }>(
      `SELECT autoReplyOptOut FROM Chat WHERE phone = ?`,
      PHONE(5),
    )[0]?.autoReplyOptOut,
  ).toBe(1)
})

test('E8.86 — a call from a hidden number is recorded hidden, then repaired', async () => {
  inject({ type: 'call', lid: LID(6) })
  await expect
    .poll(() => query(`SELECT 1 FROM CallEvent WHERE "from" = ?`, LID(6)).length)
    .toBe(1)
  inject({ type: 'lidMapping', lid: LID(6), from: PHONE(6) })
  await expect
    .poll(() => query(`SELECT 1 FROM CallEvent WHERE "from" = ?`, PHONE(6)).length)
    .toBe(1)
})
