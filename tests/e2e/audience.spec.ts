/**
 * Audience — tags, the opt-out list, STOP/START keywords, WhatsApp number
 * checks and Google Sheets import (D89, E5.1–E5.19).
 *
 * Each block shares one launched app: these tests build on each other's data
 * within a block, and an Electron launch per assertion would triple the run
 * time for no extra coverage. Every block gets its own userData directory.
 */
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { APP_READY_TIMEOUT_MS } from './fixtures/constants'
import { cleanupUserDataDir, newUserDataDir } from './fixtures/licensed-app'

// ── Google Sheets stub ──

/** Sheet id -> gid -> CSV body. "private" answers 403, "login" a sign-in page. */
const SHEETS: Record<string, Record<string, string>> = {
  pubSheet1: {
    '0': 'Name,Phone,City\nFirst Tab,+919822200001,Pune\n',
    '777': [
      'Name,Phone,City',
      'Asha,9822200011,Pune',
      'Ravi,9822200012,Delhi',
      'Ravi again,9822200012,Delhi',
      'Bad,12,Nowhere',
      'Meera,+14155550123,SF',
    ].join('\n'),
  },
}

let server: Server
let sheetsBase: string
let sheetRequests: string[] = []

test.beforeAll(async () => {
  server = createServer((req, res) => {
    sheetRequests.push(req.url ?? '')
    const url = new URL(req.url ?? '/', 'http://stub')
    const id = /\/spreadsheets\/d\/([^/]+)\/export/.exec(url.pathname)?.[1] ?? ''
    if (id === 'private') {
      res.writeHead(403, { 'Content-Type': 'text/html' })
      res.end('<html>forbidden</html>')
      return
    }
    if (id === 'login') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<!DOCTYPE html><html><body>Sign in</body></html>')
      return
    }
    const body = SHEETS[id]?.[url.searchParams.get('gid') ?? '']
    if (url.searchParams.get('format') !== 'csv' || body === undefined) {
      res.writeHead(404)
      res.end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/csv' })
    res.end(body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  sheetsBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

// ── launching ──

interface Session {
  app: ElectronApplication
  win: Page
  dir: string
  files: string
  sendLog: string
  actionLog: string
  inject: string
}

async function launch(): Promise<Session> {
  const dir = newUserDataDir()
  const files = mkdtempSync(join(tmpdir(), 'rb-audience-files-'))
  const sendLog = join(files, 'sends.jsonl')
  const actionLog = join(files, 'actions.jsonl')
  const inject = join(files, 'inject.jsonl')
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${dir}`],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: undefined,
      LICENSE_SERVICE: 'mock',
      WA_TRANSPORT: 'mock',
      WA_MOCK_SEND_LOG: sendLog,
      WA_MOCK_ACTION_LOG: actionLog,
      WA_MOCK_INJECT: inject,
      RB_SHEETS_BASE_URL: sheetsBase,
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
  return { app, win, dir, files, sendLog, actionLog, inject }
}

async function close(s: Session | undefined): Promise<void> {
  if (!s) return
  await s.app.close()
  cleanupUserDataDir(s.dir)
  cleanupUserDataDir(s.files)
}

// ── helpers ──

function query<T>(dir: string, sql: string, ...params: Array<string | number>): T[] {
  const db = new DatabaseSync(join(dir, 'rapbooster.db'), { readOnly: true })
  try {
    return db.prepare(sql).all(...params) as unknown as T[]
  } finally {
    db.close()
  }
}

function sends(
  s: Session,
): Array<{ to: string; message: { kind: string; body?: string } }> {
  if (!existsSync(s.sendLog)) return []
  return readFileSync(s.sendLog, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as { to: string; message: { kind: string; body?: string } })
}

/** Create a list and import `rows` ([name, phone]) through the real importer. */
async function seedList(s: Session, name: string, rows: Array<[string, string]>) {
  const csv = join(s.files, `${name.replace(/\W+/g, '_')}.csv`)
  writeFileSync(csv, ['Name,Mobile', ...rows.map((r) => r.join(','))].join('\n'), 'utf8')
  return s.win.evaluate(
    async ({ listName, path }) => {
      const list = await window.api.invoke('contactList:create', {
        name: listName,
        customFields: [],
      })
      if (!list.ok) throw new Error(list.error.userMessage)
      const imported = await window.api.invoke('contacts:import', {
        listId: list.data.id,
        filePath: path,
        mapping: { Name: 'Name', Mobile: 'Mobile' },
        duplicatePolicy: 'skip',
        dialPrefix: null,
      })
      if (!imported.ok) throw new Error(imported.error.userMessage)
      return list.data.id
    },
    { listName: name, path: csv },
  )
}

async function contactIds(s: Session, listId: string): Promise<string[]> {
  return query<{ id: string }>(
    s.dir,
    'SELECT id FROM Contact WHERE listId = ? ORDER BY id',
    listId,
  ).map((r) => r.id)
}

async function connectDevice(s: Session, name: string): Promise<string> {
  const id = await s.win.evaluate(async (deviceName) => {
    const created = await window.api.invoke('device:create', { name: deviceName })
    if (!created.ok) throw new Error(created.error.userMessage)
    await window.api.invoke('device:connect', { id: created.data.id })
    return created.data.id
  }, name)
  await expect
    .poll(
      () =>
        s.win.evaluate(async (deviceId) => {
          const list = await window.api.invoke('device:list')
          return list.ok ? list.data.find((d) => d.id === deviceId)?.status : null
        }, id),
      { timeout: 30_000 },
    )
    .toBe('connected')
  return id
}

function injectMessage(s: Session, from: string, body: string): void {
  appendFileSync(
    s.inject,
    `${JSON.stringify({ type: 'message', deviceId: '*', from, body })}\n`,
    'utf8',
  )
}

const pad = (n: number, width: number) => String(n).padStart(width, '0')

// ═════════════════════ tags, opt-out list, sheets (API) ═════════════════════

test.describe.serial('audience data', () => {
  let s: Session
  let listId: string

  test.beforeAll(async () => {
    s = await launch()
  })
  test.afterAll(async () => {
    await close(s)
  })

  test('E5.1 — tags are created, listed with counts, renamed and recoloured; names are unique', async () => {
    const result = await s.win.evaluate(async () => {
      const vip = await window.api.invoke('tag:create', { name: 'VIP' })
      const lead = await window.api.invoke('tag:create', {
        name: 'Lead',
        color: '#107c10',
      })
      const dupe = await window.api.invoke('tag:create', { name: 'VIP' })
      if (!vip.ok || !lead.ok) throw new Error('create')
      const renamed = await window.api.invoke('tag:update', {
        id: lead.data.id,
        name: 'Hot lead',
        color: '#d83b01',
      })
      const clash = await window.api.invoke('tag:update', {
        id: lead.data.id,
        name: 'VIP',
      })
      const badColour = await window.api.invoke('tag:create', { name: 'X', color: 'red' })
      const list = await window.api.invoke('tag:list')
      return { vip, dupe, renamed, clash, badColour, list }
    })
    expect(result.vip.ok && result.vip.data.contactCount).toBe(0)
    expect(result.vip.ok && result.vip.data.source).toBe('manual')
    expect(result.dupe.ok ? null : result.dupe.error.code).toBe('CONFLICT')
    expect(result.clash.ok ? null : result.clash.error.code).toBe('CONFLICT')
    expect(result.badColour.ok ? null : result.badColour.error.code).toBe(
      'VALIDATION_FAILED',
    )
    expect(result.renamed.ok && result.renamed.data).toMatchObject({
      name: 'Hot lead',
      color: '#d83b01',
    })
    expect(result.list.ok && result.list.data.map((t) => t.name)).toEqual([
      'Hot lead',
      'VIP',
    ])
  })

  test('E5.2 — assigning by contact ids skips existing pairs; unassign removes them', async () => {
    listId = await seedList(
      s,
      'Tagged',
      Array.from({ length: 1_500 }, (_, i) => [`Person ${i}`, `+9198${pad(i + 1, 8)}`]),
    )
    const ids = await contactIds(s, listId)
    expect(ids).toHaveLength(1_500)

    const out = await s.win.evaluate(
      async ({ some }) => {
        const tags = await window.api.invoke('tag:list')
        if (!tags.ok) throw new Error('list')
        const vip = tags.data.find((t) => t.name === 'VIP')!
        const first = await window.api.invoke('tag:assign', {
          tagId: vip.id,
          contactIds: some.slice(0, 3),
        })
        // Overlapping second call, plus an id that is not a contact at all.
        const second = await window.api.invoke('tag:assign', {
          tagId: vip.id,
          contactIds: [...some.slice(0, 5), 'not-a-contact'],
        })
        const removed = await window.api.invoke('tag:unassign', {
          tagId: vip.id,
          contactIds: some.slice(0, 2),
        })
        const nothing = await window.api.invoke('tag:assign', { tagId: vip.id })
        const after = await window.api.invoke('tag:list')
        return { first, second, removed, nothing, after, vipId: vip.id }
      },
      { some: ids },
    )
    expect(out.first.ok && out.first.data.assigned).toBe(3)
    expect(out.second.ok && out.second.data.assigned).toBe(2)
    expect(out.removed.ok && out.removed.data.removed).toBe(2)
    expect(out.nothing.ok ? null : out.nothing.error.code).toBe('VALIDATION_FAILED')
    expect(
      out.after.ok && out.after.data.find((t) => t.id === out.vipId)?.contactCount,
    ).toBe(3)
  })

  test('E5.3 — a tag assigned to a whole list reaches every contact; contacts filter by tag; delete cascades', async () => {
    const out = await s.win.evaluate(async (list) => {
      const tags = await window.api.invoke('tag:list')
      if (!tags.ok) throw new Error('list')
      const hot = tags.data.find((t) => t.name === 'Hot lead')!
      const vip = tags.data.find((t) => t.name === 'VIP')!
      // 1,500 contacts crosses the 1,000-row batch boundary.
      const assigned = await window.api.invoke('tag:assign', {
        tagId: hot.id,
        listId: list,
      })
      const again = await window.api.invoke('tag:assign', { tagId: hot.id, listId: list })
      const byVip = await window.api.invoke('contacts:list', {
        listId: list,
        tagId: vip.id,
      })
      const byHot = await window.api.invoke('contacts:list', {
        listId: list,
        tagId: hot.id,
        limit: 10,
      })
      const deleted = await window.api.invoke('tag:delete', { id: vip.id })
      return { assigned, again, byVip, byHot, deleted, vipId: vip.id, hotId: hot.id }
    }, listId)

    expect(out.assigned.ok && out.assigned.data.assigned).toBe(1_500)
    expect(out.again.ok && out.again.data.assigned).toBe(0)
    expect(out.byVip.ok && out.byVip.data.total).toBe(3)
    expect(
      out.byVip.ok && out.byVip.data.items.every((c) => c.tagIds.includes(out.vipId)),
    ).toBe(true)
    expect(out.byHot.ok && out.byHot.data.total).toBe(1_500)
    expect(out.deleted.ok).toBe(true)
    const links = query<{ n: number }>(
      s.dir,
      'SELECT COUNT(*) AS n FROM ContactTag WHERE tagId = ?',
      out.vipId,
    )
    expect(Number(links[0]?.n)).toBe(0)

    // Unassigning more ids than one SQL statement can bind still works.
    const ids = await contactIds(s, listId)
    const removed = await s.win.evaluate(
      ({ tagId, all }) => window.api.invoke('tag:unassign', { tagId, contactIds: all }),
      { tagId: out.hotId, all: ids },
    )
    expect(removed.ok && removed.data.removed).toBe(1_500)
  })

  test('E5.4 — opt-outs are normalized, deduplicated, searchable, paged and removable', async () => {
    const out = await s.win.evaluate(async () => {
      const added = await window.api.invoke('suppression:add', {
        phones: ['+91 98111 00001', '0091-9811100002', '09811100003', '+919811100001'],
        reason: 'Asked by phone',
      })
      const again = await window.api.invoke('suppression:add', {
        phones: ['+919811100002'],
      })
      const bulk = await window.api.invoke('suppression:add', {
        phones: Array.from(
          { length: 30 },
          (_, i) => `+1415555${String(i).padStart(4, '0')}`,
        ),
      })
      const search = await window.api.invoke('suppression:list', { search: '98111' })
      const page1 = await window.api.invoke('suppression:list', { limit: 20 })
      const page2 =
        page1.ok && page1.data.nextCursor
          ? await window.api.invoke('suppression:list', {
              limit: 20,
              cursor: page1.data.nextCursor,
            })
          : null
      const removed = await window.api.invoke('suppression:remove', {
        phones: ['+91 98111 00002'],
      })
      const after = await window.api.invoke('suppression:list', { search: '98111' })
      return { added, again, bulk, search, page1, page2, removed, after }
    })

    // A bare national number is invalid: no country is ever guessed.
    expect(out.added.ok && out.added.data).toEqual({ added: 2, invalid: 1 })
    expect(out.again.ok && out.again.data).toEqual({ added: 0, invalid: 0 })
    expect(out.bulk.ok && out.bulk.data.added).toBe(30)
    expect(out.search.ok && out.search.data.items.map((r) => r.phone).sort()).toEqual([
      '+919811100001',
      '+919811100002',
    ])
    expect(out.search.ok && out.search.data.items[0]?.source).toBe('manual')
    expect(out.page1.ok && out.page1.data.total).toBe(32)
    const seen = new Set([
      ...(out.page1.ok ? out.page1.data.items.map((r) => r.phone) : []),
      ...(out.page2?.ok ? out.page2.data.items.map((r) => r.phone) : []),
    ])
    expect(seen.size).toBe(32)
    expect(out.removed.ok && out.removed.data.removed).toBe(1)
    expect(out.after.ok && out.after.data.total).toBe(1)
  })

  test('E5.5 — opt-outs import from CSV (Mobile column) and TXT (with a dial prefix)', async () => {
    const csv = join(s.files, 'dnc.csv')
    writeFileSync(
      csv,
      '﻿Name,Mobile,Note\nA,+919833300001,x\nB,+919833300002,y\nC,9833300003,no code\n',
      'utf8',
    )
    const txt = join(s.files, 'dnc.txt')
    writeFileSync(txt, '9833300011\n9833300012\n\n+14155559999\nabc\n', 'utf8')

    const out = await s.win.evaluate(
      async ({ csvPath, txtPath }) => {
        const fromCsv = await window.api.invoke('suppression:import', {
          filePath: csvPath,
          dialPrefix: null,
        })
        const fromTxt = await window.api.invoke('suppression:import', {
          filePath: txtPath,
          dialPrefix: '+91',
        })
        const missing = await window.api.invoke('suppression:import', {
          filePath: `${txtPath}.missing`,
          dialPrefix: null,
        })
        return { fromCsv, fromTxt, missing }
      },
      { csvPath: csv, txtPath: txt },
    )
    expect(out.fromCsv.ok && out.fromCsv.data).toEqual({ added: 2, invalid: 1 })
    // An explicit + keeps its own country; "abc" is invalid.
    expect(out.fromTxt.ok && out.fromTxt.data).toEqual({ added: 3, invalid: 1 })
    expect(out.missing.ok ? null : out.missing.error.code).toBe('IMPORT_FAILED')

    const rows = query<{ phone: string; source: string }>(
      s.dir,
      `SELECT phone, source FROM Suppression WHERE phone IN (?, ?, ?) ORDER BY phone`,
      '+14155559999',
      '+919833300001',
      '+919833300012',
    )
    expect(rows).toEqual([
      { phone: '+14155559999', source: 'import' },
      { phone: '+919833300001', source: 'import' },
      { phone: '+919833300012', source: 'import' },
    ])
  })

  test('E5.6 — the opt-out list exports to CSV under userData/exports', async () => {
    const out = await s.win.evaluate(() => window.api.invoke('suppression:export'))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.data.filePath.startsWith(join(s.dir, 'exports'))).toBe(true)
    const total = query<{ n: number }>(s.dir, 'SELECT COUNT(*) AS n FROM Suppression')
    expect(out.data.rows).toBe(Number(total[0]?.n))
    const lines = readFileSync(out.data.filePath, 'utf8').trim().split('\n')
    expect(lines[0]).toBe('Mobile,Source,Reason,Added')
    expect(lines).toHaveLength(out.data.rows + 1)
    expect(lines.some((l) => l.startsWith('+919833300001,import,'))).toBe(true)
  })

  test('E5.7 — opt-out keyword configuration has safe defaults and round-trips', async () => {
    const out = await s.win.evaluate(async () => {
      const defaults = await window.api.invoke('optout:getConfig')
      const empty = await window.api.invoke('optout:setConfig', {
        keywords: [],
        confirmationEnabled: true,
        confirmationText: 'x',
      })
      const saved = await window.api.invoke('optout:setConfig', {
        keywords: ['STOP', ' Cancel ', 'STOP'],
        confirmationEnabled: false,
        confirmationText: 'Bye.',
      })
      const after = await window.api.invoke('optout:getConfig')
      return { defaults, empty, saved, after }
    })
    expect(out.defaults.ok && out.defaults.data).toEqual({
      keywords: ['STOP', 'UNSUBSCRIBE', 'बंद'],
      confirmationEnabled: true,
      confirmationText:
        "You've been unsubscribed and won't receive further messages. Reply START to opt back in.",
    })
    expect(out.empty.ok ? null : out.empty.error.code).toBe('VALIDATION_FAILED')
    expect(out.saved.ok).toBe(true)
    expect(out.after.ok && out.after.data).toEqual({
      keywords: ['STOP', 'Cancel'],
      confirmationEnabled: false,
      confirmationText: 'Bye.',
    })
  })

  test('E5.8 — a Google Sheet previews from its share link, honouring the tab in #gid=', async () => {
    sheetRequests = []
    const out = await s.win.evaluate(() =>
      window.api.invoke('contacts:sheetPreview', {
        url: 'https://docs.google.com/spreadsheets/d/pubSheet1/edit#gid=777',
      }),
    )
    expect(out.ok && out.data.headers).toEqual(['Name', 'Phone', 'City'])
    expect(out.ok && out.data.totalRows).toBe(5)
    expect(out.ok && out.data.sampleRows[0]).toEqual(['Asha', '9822200011', 'Pune'])
    expect(sheetRequests).toEqual(['/spreadsheets/d/pubSheet1/export?format=csv&gid=777'])

    const firstTab = await s.win.evaluate(() =>
      window.api.invoke('contacts:sheetPreview', {
        url: 'https://docs.google.com/spreadsheets/d/pubSheet1/edit',
      }),
    )
    expect(firstTab.ok && firstTab.data.sampleRows[0]?.[0]).toBe('First Tab')
  })

  test('E5.9 — a sheet imports through the CSV pipeline: mapping, dial prefix, duplicates, invalid rows', async () => {
    const out = await s.win.evaluate(async () => {
      const list = await window.api.invoke('contactList:create', {
        name: 'From sheet',
        customFields: ['City'],
      })
      if (!list.ok) throw new Error('list')
      const imported = await window.api.invoke('contacts:importSheet', {
        listId: list.data.id,
        url: 'https://docs.google.com/spreadsheets/d/pubSheet1/edit?usp=sharing&gid=777',
        mapping: { Name: 'Name', Phone: 'Mobile', City: 'City' },
        duplicatePolicy: 'skip',
        dialPrefix: '+91',
      })
      const contacts = await window.api.invoke('contacts:list', { listId: list.data.id })
      return { imported, contacts }
    })
    expect(out.imported.ok && out.imported.data).toMatchObject({
      imported: 3,
      skipped: 1,
      invalid: 1,
    })
    expect(out.imported.ok && out.imported.data.errorReportPath).not.toBeNull()
    const phones = out.contacts.ok
      ? out.contacts.data.items.map((c) => c.phone).sort()
      : []
    // The explicit +1 keeps its country even with +91 chosen.
    expect(phones).toEqual(['+14155550123', '+919822200011', '+919822200012'])
    const asha = out.contacts.ok && out.contacts.data.items.find((c) => c.name === 'Asha')
    expect(asha && asha.data.City).toBe('Pune')
  })

  test('E5.10 — a sheet that is not shared gets a clear instruction; other links are refused', async () => {
    const out = await s.win.evaluate(async () => {
      const forbidden = await window.api.invoke('contacts:sheetPreview', {
        url: 'https://docs.google.com/spreadsheets/d/private/edit',
      })
      const login = await window.api.invoke('contacts:sheetPreview', {
        url: 'https://docs.google.com/spreadsheets/d/login/edit',
      })
      const missing = await window.api.invoke('contacts:sheetPreview', {
        url: 'https://docs.google.com/spreadsheets/d/nope/edit',
      })
      const elsewhere = await window.api.invoke('contacts:sheetPreview', {
        url: 'https://example.com/spreadsheets/d/pubSheet1/edit',
      })
      return { forbidden, login, missing, elsewhere }
    })
    const share = "Share the sheet as 'Anyone with the link can view' and try again."
    expect(out.forbidden.ok ? null : out.forbidden.error.userMessage).toBe(share)
    expect(out.login.ok ? null : out.login.error.userMessage).toBe(share)
    expect(out.missing.ok ? null : out.missing.error.code).toBe('IMPORT_FAILED')
    expect(out.elsewhere.ok ? null : out.elsewhere.error.code).toBe('VALIDATION_FAILED')
  })
})

// ═════════════════════ inbound keywords and number checks ═════════════════════

test.describe.serial('audience over WhatsApp', () => {
  let s: Session
  let deviceId: string

  test.beforeAll(async () => {
    s = await launch()
    deviceId = await connectDevice(s, 'Audience phone')
  })
  test.afterAll(async () => {
    await close(s)
  })

  const chatOf = (phone: string) =>
    s.win.evaluate(async (p) => {
      const chats = await window.api.invoke('chat:list', { search: p.slice(1) })
      return chats.ok
        ? (chats.data.items.find((c) => c.phone.includes(p.slice(1))) ?? null)
        : null
    }, phone)

  test('E5.11 — STOP suppresses the number, flags the chat and sends the confirmation', async () => {
    const phone = '+919844400001'
    injectMessage(s, phone, '  stop ')

    await expect
      .poll(
        () =>
          query<{ source: string }>(
            s.dir,
            'SELECT source FROM Suppression WHERE phone = ?',
            phone,
          ),
        { timeout: 20_000 },
      )
      .toEqual([{ source: 'stop_keyword' }])

    await expect
      .poll(async () => (await chatOf(phone))?.optedOut, { timeout: 10_000 })
      .toBe(true)
    expect((await chatOf(phone))?.autoReplyOptOut).toBe(true)

    const confirmation =
      "You've been unsubscribed and won't receive further messages. Reply START to opt back in."
    await expect
      .poll(
        () =>
          sends(s)
            .filter((m) => m.to.includes('919844400001'))
            .map((m) => m.message.body),
        {
          timeout: 20_000,
        },
      )
      .toEqual([confirmation])

    // The confirmation is recorded in the inbox like any other outbound message.
    await expect
      .poll(() =>
        query<{ body: string }>(
          s.dir,
          `SELECT m.body FROM Message m JOIN Chat c ON c.id = m.chatId
           WHERE c.phone LIKE ? AND m.direction = 'out'`,
          '%919844400001',
        ),
      )
      .toEqual([{ body: confirmation }])
  })

  test('E5.12 — START re-subscribes a number that opted out by keyword', async () => {
    const phone = '+919844400001'
    injectMessage(s, phone, 'Start')

    await expect
      .poll(() => query(s.dir, 'SELECT phone FROM Suppression WHERE phone = ?', phone), {
        timeout: 20_000,
      })
      .toEqual([])
    await expect
      .poll(async () => (await chatOf(phone))?.optedOut, { timeout: 10_000 })
      .toBe(false)
    expect((await chatOf(phone))?.autoReplyOptOut).toBe(false)
    await expect
      .poll(() => sends(s).filter((m) => m.to.includes('919844400001')).length, {
        timeout: 20_000,
      })
      .toBe(2)
    expect(sends(s).filter((m) => m.to.includes('919844400001'))[1]?.message.body).toBe(
      "You're subscribed again.",
    )
  })

  test('E5.13 — keywords match whole messages in any case; sentences and manual opt-outs are left alone', async () => {
    await s.win.evaluate(async () => {
      await window.api.invoke('optout:setConfig', {
        keywords: ['STOP', 'बंद', 'Unsubscribe me'],
        confirmationEnabled: false,
        confirmationText: 'unused',
      })
      // A number the user suppressed by hand: START must not lift it.
      await window.api.invoke('suppression:add', { phones: ['+919844400004'] })
    })
    injectMessage(s, '+919844400002', 'UNSUBSCRIBE ME')
    injectMessage(s, '+919844400003', 'please do not stop sending offers')
    injectMessage(s, '+919844400005', 'बंद')
    injectMessage(s, '+919844400004', 'START')

    await expect
      .poll(
        () =>
          query<{ phone: string; source: string }>(
            s.dir,
            `SELECT phone, source FROM Suppression WHERE phone LIKE '+9198444000%' ORDER BY phone`,
          ),
        { timeout: 20_000 },
      )
      .toEqual([
        { phone: '+919844400002', source: 'stop_keyword' },
        { phone: '+919844400004', source: 'manual' },
        { phone: '+919844400005', source: 'stop_keyword' },
      ])

    // Let every injected message clear the pipeline before asserting silence.
    await expect.poll(async () => (await chatOf('+919844400004')) !== null).toBe(true)
    await s.win.waitForTimeout(1_500)
    // Confirmation off, and neither the sentence nor the manual START is answered.
    const others = sends(s).filter((m) => !m.to.includes('919844400001'))
    expect(others).toEqual([])
    expect(
      query(s.dir, 'SELECT phone FROM Suppression WHERE phone = ?', '+919844400003'),
    ).toEqual([])
  })

  test('E5.14 — verifying a list marks numbers on and off WhatsApp, with live progress', async () => {
    const valid = Array.from({ length: 108 }, (_, i): [string, string] => [
      `On ${i}`,
      `+9198555${pad(i + 1, 5)}`,
    ])
    const invalid = Array.from({ length: 12 }, (_, i): [string, string] => [
      `Off ${i}`,
      `+919856${pad(i + 1, 3)}000`,
    ])
    const listId = await seedList(s, 'To verify', [...valid, ...invalid])

    await s.win.evaluate(() => {
      const w = window as unknown as { verifyEvents: unknown[] }
      w.verifyEvents = []
      window.api.on('contacts:verifyProgress', (p) => w.verifyEvents.push(p))
    })
    const started = await s.win.evaluate(
      (req) => window.api.invoke('contacts:verifyNumbers', req),
      { listId, deviceId },
    )
    expect(started.ok && started.data.total).toBe(120)

    type Progress = {
      listId: string
      checked: number
      total: number
      valid: number
      invalid: number
      done: boolean
      error: string | null
    }
    const events = () =>
      s.win.evaluate(
        () => (window as unknown as { verifyEvents: Progress[] }).verifyEvents,
      )
    await expect
      .poll(async () => (await events()).some((e) => e.done), { timeout: 60_000 })
      .toBe(true)
    const all = await events()
    // 120 contacts in batches of 50: three progress events, then done.
    expect(all.filter((e) => !e.done).map((e) => e.checked)).toEqual([50, 100, 120])
    expect(all.at(-1)).toEqual({
      listId,
      checked: 120,
      total: 120,
      valid: 108,
      invalid: 12,
      done: true,
      error: null,
    })

    const statuses = query<{ waStatus: string; n: number; stamped: number }>(
      s.dir,
      `SELECT waStatus, COUNT(*) AS n, COUNT(waCheckedAt) AS stamped FROM Contact
       WHERE listId = ? GROUP BY waStatus ORDER BY waStatus`,
      listId,
    ).map((r) => ({ ...r, n: Number(r.n), stamped: Number(r.stamped) }))
    expect(statuses).toEqual([
      { waStatus: 'invalid', n: 12, stamped: 12 },
      { waStatus: 'valid', n: 108, stamped: 108 },
    ])

    const checks = readFileSync(s.actionLog, 'utf8')
      .split('\n')
      .filter((l) => l.includes('"checkNumbers"'))
    expect(checks).toHaveLength(3)

    const filtered = await s.win.evaluate(
      (id) => window.api.invoke('contacts:list', { listId: id, waStatus: 'invalid' }),
      listId,
    )
    expect(filtered.ok && filtered.data.total).toBe(12)
    expect(
      filtered.ok && filtered.data.items.every((c) => c.waStatus === 'invalid'),
    ).toBe(true)
  })

  test('E5.15 — a checked list is not re-checked unless asked; a disconnected device is refused', async () => {
    const listId = query<{ id: string }>(
      s.dir,
      `SELECT id FROM ContactList WHERE name = 'To verify'`,
    )[0]!.id
    const out = await s.win.evaluate(
      async ({ list, device }) => {
        const unchecked = await window.api.invoke('contacts:verifyNumbers', {
          listId: list,
          deviceId: device,
        })
        const offline = await window.api.invoke('device:create', { name: 'Offline' })
        if (!offline.ok) throw new Error('device')
        const refused = await window.api.invoke('contacts:verifyNumbers', {
          listId: list,
          deviceId: offline.data.id,
          recheck: true,
        })
        return { unchecked, refused }
      },
      { list: listId, device: deviceId },
    )
    expect(out.unchecked.ok && out.unchecked.data.total).toBe(0)
    expect(out.refused.ok ? null : out.refused.error.code).toBe('DEVICE_NOT_CONNECTED')

    // A recheck covers every number again.
    await expect
      .poll(
        async () => {
          const r = await s.win.evaluate(
            (req) => window.api.invoke('contacts:verifyNumbers', req),
            { listId, deviceId, recheck: true },
          )
          return r.ok ? r.data.total : r.error.code
        },
        { timeout: 20_000 },
      )
      .toBe(120)
  })
})

// ═══════════════════════════════ the screen ═══════════════════════════════

test.describe.serial('audience screen', () => {
  let s: Session

  test.beforeAll(async () => {
    s = await launch()
  })
  test.afterAll(async () => {
    await close(s)
  })

  test('E5.16 — tags are managed, applied to selected rows and filtered on, all from the contacts screen', async () => {
    await seedList(s, 'Screen', [
      ['Alice', '+919877700001'],
      ['Bob', '+919877700002'],
      ['Chandra', '+919877700003'],
    ])
    const win = s.win
    await win.getByTestId('nav-contacts').click()
    await win.getByTestId('list-tab-Screen').click()
    await expect(win.getByTestId('contact-row')).toHaveCount(3)
    await expect(win.getByTestId('wa-badge').first()).toHaveText('Unchecked')

    await win.getByTestId('manage-tags').click()
    await win.getByTestId('new-tag-name').fill('Gold')
    await expect(win.getByTestId('new-tag-name')).toHaveValue('Gold')
    await win.getByTestId('new-tag-create').click()
    await expect(win.getByTestId('tag-row')).toHaveCount(1)
    // Rename in place.
    await win.getByTestId('tag-row-name').fill('Gold tier')
    await win.getByTestId('tag-row-save').click()
    await expect(
      win.locator('[data-testid="tag-row"][data-tag="Gold tier"]'),
    ).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(win.getByTestId('tag-manager')).toBeHidden()

    for (const name of ['Alice', 'Chandra']) {
      await win
        .getByTestId('contact-row')
        .filter({ hasText: name })
        .getByTestId('contact-check')
        .check()
    }
    await expect(win.getByTestId('selected-count')).toHaveText('2 selected')
    await win.getByTestId('bulk-tag-apply').click()
    await expect(win.getByTestId('contact-tag-chip')).toHaveCount(2)

    await win.getByTestId('tag-filter').selectOption({ label: 'Gold tier' })
    await expect(win.getByTestId('contact-row')).toHaveCount(2)
    await expect(win.getByTestId('contact-row').filter({ hasText: 'Bob' })).toHaveCount(0)

    // Remove the tag from one of them through the same bar.
    await win
      .getByTestId('contact-row')
      .filter({ hasText: 'Alice' })
      .getByTestId('contact-check')
      .check()
    await win.getByTestId('bulk-tag-remove').click()
    await expect(win.getByTestId('contact-row')).toHaveCount(1)
    await expect(win.getByTestId('contact-row')).toContainText('Chandra')
  })

  test('E5.17 — the opt-outs view adds, searches, removes and configures', async () => {
    const win = s.win
    await win.getByTestId('view-optouts').click()
    await expect(win.getByTestId('optout-empty')).toBeVisible()

    await win.getByTestId('optout-add-input').fill('+919866600001, +919866600002, 12345')
    await win.getByTestId('optout-add').click()
    await expect(win.getByTestId('optout-row')).toHaveCount(2)
    await expect(win.getByTestId('optout-total')).toContainText('2 numbers')

    await win.getByTestId('optout-search').fill('600002')
    await expect(win.getByTestId('optout-row')).toHaveCount(1)
    await win.getByTestId('optout-row').getByTestId('optout-remove').click()
    await expect(win.getByTestId('optout-empty')).toBeVisible()
    await win.getByTestId('optout-search').fill('')
    await expect(win.getByTestId('optout-row')).toHaveCount(1)

    await expect(win.getByTestId('optout-keywords')).toHaveValue('STOP, UNSUBSCRIBE, बंद')
    await win.getByTestId('optout-keywords').fill('STOP, QUIT')
    await win.getByTestId('optout-confirm-enabled').uncheck()
    await win.getByTestId('optout-config-save').click()
    await expect
      .poll(() =>
        win.evaluate(async () => {
          const c = await window.api.invoke('optout:getConfig')
          return c.ok ? c.data : null
        }),
      )
      .toMatchObject({ keywords: ['STOP', 'QUIT'], confirmationEnabled: false })
  })

  test('E5.18 — a Google Sheet imports through the import dialog', async () => {
    const win = s.win
    await win.getByTestId('view-contacts').click()
    await win.getByTestId('list-tab-Screen').click()
    await win.getByTestId('import-contacts').click()
    await win.getByTestId('import-source-sheet').click()
    await win.getByTestId('sheet-url').fill('https://example.com/not-a-sheet')
    await win.getByTestId('load-preview').click()
    await expect(win.getByTestId('import-error')).toContainText('Google Sheets link')

    await win
      .getByTestId('sheet-url')
      .fill('https://docs.google.com/spreadsheets/d/pubSheet1/edit#gid=777')
    await win.getByTestId('load-preview').click()
    await expect(win.getByTestId('column-mapping')).toBeVisible()
    await win.getByTestId('map-Phone').selectOption('Mobile')
    await win.getByTestId('country-answer').selectOption('apply')
    await win.getByTestId('dial-prefix').fill('+91')
    await win.getByTestId('run-import').click()
    await expect(win.getByTestId('import-dialog')).toBeHidden()
    await expect(win.getByTestId('contact-row')).toHaveCount(6)
  })

  test('E5.19 — "Verify numbers" runs from the screen and shows live progress and badges', async () => {
    const win = s.win
    await connectDevice(s, 'Screen phone')
    await seedList(s, 'Badges', [
      ['Yes', '+919888800001'],
      ['No', '+919888801000'],
    ])
    // Lists are read when the screen opens, so come back to it.
    await win.getByTestId('nav-dashboard').click()
    await win.getByTestId('nav-contacts').click()
    await win.getByTestId('list-tab-Badges').click()
    await expect(win.getByTestId('contact-row')).toHaveCount(2)

    await win.getByTestId('verify-numbers').click()
    await expect(win.getByTestId('verify-device')).toContainText('Screen phone')
    await win.getByTestId('verify-start').click()
    await expect(win.getByTestId('verify-progress')).toHaveAttribute(
      'data-done',
      'true',
      {
        timeout: 30_000,
      },
    )
    await expect(win.getByTestId('verify-progress-text')).toContainText('2 of 2')
    await expect(
      win.getByTestId('contact-row').filter({ hasText: 'Yes' }).getByTestId('wa-badge'),
    ).toHaveText('On WhatsApp')
    await expect(
      win.getByTestId('contact-row').filter({ hasText: 'No' }).getByTestId('wa-badge'),
    ).toHaveText('Not on WhatsApp')

    await win.getByTestId('wa-filter').selectOption('invalid')
    await expect(win.getByTestId('contact-row')).toHaveCount(1)
  })
})
