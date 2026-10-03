/**
 * Getting contacts in (Wave 3, E8.40–E8.59): Excel and vCard import, the
 * WhatsApp contacts grabber (saved contacts and chats), and choosing files
 * with the system dialog instead of typing a path.
 *
 * Fixtures are generated into a temp directory per run, with fake +9198…
 * numbers — no real number is ever committed.
 */
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parseVCardText } from '../../electron/main/services/import/vcard'
import {
  cellText,
  numberText,
  RawNumber,
  sheetToTable,
} from '../../electron/main/services/import/xlsx-cells'
import { APP_READY_TIMEOUT_MS } from './fixtures/constants'
import { cleanupUserDataDir, newUserDataDir } from './fixtures/licensed-app'
import { writeXlsx, type XlsxCell } from './fixtures/xlsx-writer'

// ── fixtures ──

/** Cards in all three vCard versions, with folding and QUOTED-PRINTABLE. */
const VCF = [
  'BEGIN:VCARD',
  'VERSION:2.1',
  'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Sharma;=C3=81sha=20Ra=',
  'ni;;;',
  'TEL;HOME:+919800000101',
  'TEL;CELL;PREF:+919800000102',
  'EMAIL;INTERNET:asha@example.com',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Ravi Kumar',
  // RFC 6350 folding removes the line break and ONE space, so this keeps one.
  '  Verma',
  'ORG:Acme\\, Inc;Sales',
  'TEL;TYPE=WORK,VOICE:+91 98000 00103',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:4.0',
  'FN:Meera',
  'TEL;VALUE=uri;TYPE="voice,cell":tel:+91-98000-00104',
  'EMAIL;TYPE=work:meera@example.com',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:No Number',
  'END:VCARD',
].join('\r\n')

const XLSX_ROWS: XlsxCell[][] = [
  ['Name', 'Phone', 'Joined', 'City'],
  ['Asha', 919800000201, new Date(Date.UTC(2024, 0, 15)), 'Pune'],
  ['Ravi', '+91 98000 00202', null, 'Delhi'],
  // What some spreadsheet programs store for a long number.
  ['Meera', { raw: '9.19800000203E11' }, null, null],
  [null, null, null, null],
  ['Bad', 12, null, 'Nowhere'],
]

// ── launching ──

interface Session {
  app: ElectronApplication
  win: Page
  dir: string
  files: string
  inject: string
}

async function launch(
  setup: (files: string) => Record<string, string> = () => ({}),
): Promise<Session> {
  const dir = newUserDataDir()
  const files = mkdtempSync(join(tmpdir(), 'rb-contacts-import-'))
  const inject = join(files, 'inject.jsonl')
  writeFileSync(inject, '')
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${dir}`],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: undefined,
      LICENSE_SERVICE: 'mock',
      WA_TRANSPORT: 'mock',
      WA_MOCK_INJECT: inject,
      NODE_ENV: 'test',
      ...setup(files),
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
  return { app, win, dir, files, inject }
}

async function close(s: Session | undefined): Promise<void> {
  if (!s) return
  await s.app.close()
  cleanupUserDataDir(s.dir)
  cleanupUserDataDir(s.files)
}

function query<T>(dir: string, sql: string, ...params: Array<string | number>): T[] {
  const db = new DatabaseSync(join(dir, 'rapbooster.db'), { readOnly: true })
  try {
    return db.prepare(sql).all(...params) as unknown as T[]
  } finally {
    db.close()
  }
}

async function createList(win: Page, name: string, customFields: string[] = []) {
  return win.evaluate(
    async ({ name, customFields }) => {
      const r = await window.api.invoke('contactList:create', { name, customFields })
      if (!r.ok) throw new Error(r.error.userMessage)
      return r.data.id
    },
    { name, customFields },
  )
}

async function connectDevice(win: Page, name: string): Promise<string> {
  const id = await win.evaluate(async (deviceName) => {
    const created = await window.api.invoke('device:create', { name: deviceName })
    if (!created.ok) throw new Error(created.error.userMessage)
    await window.api.invoke('device:connect', { id: created.data.id })
    return created.data.id
  }, name)
  await expect
    .poll(
      () =>
        win.evaluate(async (deviceId) => {
          const list = await window.api.invoke('device:list')
          return list.ok ? list.data.find((d) => d.id === deviceId)?.status : null
        }, id),
      { timeout: 30_000 },
    )
    .toBe('connected')
  return id
}

type Source = 'all' | 'addressBook' | 'chats'

async function waTotal(
  win: Page,
  req: { deviceId?: string; source?: Source; onlyNamed?: boolean; search?: string },
): Promise<number> {
  return win.evaluate(async (r) => {
    const res = await window.api.invoke('waContacts:list', { ...r, limit: 1 })
    if (!res.ok) throw new Error(res.error.userMessage)
    return res.data.total
  }, req)
}

// ═════════════════════ parsers (no app) ═════════════════════

test('E8.40 — the vCard reader handles 2.1/3.0/4.0, folded lines and QUOTED-PRINTABLE', () => {
  const cards = parseVCardText(VCF)
  expect(cards).toHaveLength(4)

  // 2.1: N decoded from QP across a soft line break; the CELL number wins.
  expect(cards[0]).toEqual({
    name: 'Ásha Rani Sharma',
    phones: ['+919800000102', '+919800000101'],
    email: 'asha@example.com',
    company: '',
  })
  // 3.0: a folded FN, escaped comma in ORG, components joined.
  expect(cards[1]).toMatchObject({
    name: 'Ravi Kumar Verma',
    phones: ['+91 98000 00103'],
    company: 'Acme, Inc Sales',
  })
  // 4.0: a tel: URI with a quoted TYPE list.
  expect(cards[2]).toMatchObject({ name: 'Meera', phones: ['+91-98000-00104'] })
  expect(cards[3]).toMatchObject({ name: 'No Number', phones: [] })
})

test('E8.41 — spreadsheet cells become text without mangling numbers or dates', () => {
  expect(numberText('919800000201')).toBe('919800000201')
  expect(numberText('9.19800000203E11')).toBe('919800000203')
  expect(numberText('0.30000000000000004')).toBe('0.3')
  expect(cellText(new RawNumber('12.5'))).toBe('12.5')
  expect(cellText(new Date(Date.UTC(2024, 0, 15)))).toBe('2024-01-15')
  expect(cellText(new Date(Date.UTC(2024, 0, 15, 9, 30)))).toBe(
    '2024-01-15T09:30:00.000Z',
  )
  expect(cellText(true)).toBe('TRUE')
  // A text cell that merely looks like a number is left exactly as typed.
  expect(cellText('1e5')).toBe('1e5')

  const table = sheetToTable([
    [null, null],
    ['Name', null],
    ['Asha', new RawNumber('919800000201')],
    [null, ''],
  ])
  expect(table).toEqual({
    headers: ['Name', 'Column 2'],
    rows: [['Asha', '919800000201']],
  })
})

// ═════════════════════ file import ═════════════════════

test.describe.serial('file import', () => {
  let s: Session
  let xlsx: string
  let vcf: string

  test.beforeAll(async () => {
    s = await launch((files) => {
      xlsx = join(files, 'customers.xlsx')
      vcf = join(files, 'phone-export.vcf')
      writeXlsx(xlsx, XLSX_ROWS)
      writeFileSync(vcf, VCF, 'utf8')
      writeFileSync(join(files, 'notes.pdf'), '%PDF-1.4')
      writeFileSync(join(files, 'old.xls'), 'not really excel')
      // The UI test below picks this file through the "native" dialog.
      return { RB_PICK_FILE: xlsx }
    })
  })
  test.afterAll(async () => {
    await close(s)
  })

  test('E8.42 — an .xlsx preview shows the first sheet with headers and a row count', async () => {
    const preview = await s.win.evaluate(
      (filePath) => window.api.invoke('contacts:importPreview', { filePath }),
      xlsx,
    )
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.data.headers).toEqual(['Name', 'Phone', 'Joined', 'City'])
    expect(preview.data.totalRows).toBe(4)
    expect(preview.data.sampleRows[0]).toEqual([
      'Asha',
      '919800000201',
      '2024-01-15',
      'Pune',
    ])
  })

  test('E8.43 — an .xlsx imports with counts, and phone numbers survive exactly', async () => {
    const listId = await createList(s.win, 'Excel', ['Joined', 'City'])
    const result = await s.win.evaluate(
      ({ listId, filePath }) =>
        window.api.invoke('contacts:import', {
          listId,
          filePath,
          mapping: { Name: 'Name', Phone: 'Mobile', Joined: 'Joined', City: 'City' },
          duplicatePolicy: 'skip',
          dialPrefix: null,
        }),
      { listId, filePath: xlsx },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toMatchObject({ imported: 3, skipped: 0, invalid: 1 })
    expect(result.data.errorReportPath).not.toBeNull()

    const rows = query<{ name: string; phone: string; data: string }>(
      s.dir,
      'SELECT name, phone, data FROM Contact WHERE listId = ? ORDER BY phone',
      listId,
    )
    expect(rows.map((r) => [r.name, r.phone])).toEqual([
      ['Asha', '+919800000201'],
      ['Ravi', '+919800000202'],
      ['Meera', '+919800000203'],
    ])
    expect(JSON.parse(rows[0]!.data)).toMatchObject({
      Joined: '2024-01-15',
      City: 'Pune',
    })
  })

  test('E8.44 — a .vcf preview offers Name, Phone, Other phones, Email and Company', async () => {
    const preview = await s.win.evaluate(
      (filePath) => window.api.invoke('contacts:importPreview', { filePath }),
      vcf,
    )
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.data.headers).toEqual([
      'Name',
      'Phone',
      'Other phones',
      'Email',
      'Company',
    ])
    expect(preview.data.totalRows).toBe(4)
    expect(preview.data.sampleRows[0]).toEqual([
      'Ásha Rani Sharma',
      '+919800000102',
      '+919800000101',
      'asha@example.com',
      '',
    ])
  })

  test('E8.45 — a .vcf imports one contact per card; a card without a number is reported', async () => {
    const listId = await createList(s.win, 'Phone book', ['Email', 'Company'])
    const result = await s.win.evaluate(
      ({ listId, filePath }) =>
        window.api.invoke('contacts:import', {
          listId,
          filePath,
          mapping: { Name: 'Name', Phone: 'Mobile', Email: 'Email', Company: 'Company' },
          duplicatePolicy: 'skip',
          dialPrefix: null,
        }),
      { listId, filePath: vcf },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toMatchObject({ imported: 3, invalid: 1 })

    const rows = query<{ name: string; phone: string; data: string }>(
      s.dir,
      'SELECT name, phone, data FROM Contact WHERE listId = ? ORDER BY phone',
      listId,
    )
    expect(rows.map((r) => [r.name, r.phone])).toEqual([
      ['Ásha Rani Sharma', '+919800000102'],
      ['Ravi Kumar Verma', '+919800000103'],
      ['Meera', '+919800000104'],
    ])
    expect(JSON.parse(rows[1]!.data)).toMatchObject({ Company: 'Acme, Inc Sales' })
    expect(JSON.parse(rows[2]!.data)).toMatchObject({ Email: 'meera@example.com' })
  })

  test('E8.46 — unsupported, old-Excel and missing files get a plain-English error', async () => {
    const results = await s.win.evaluate(
      (paths) =>
        Promise.all(
          paths.map((filePath) =>
            window.api.invoke('contacts:importPreview', { filePath }),
          ),
        ),
      [join(s.files, 'notes.pdf'), join(s.files, 'old.xls'), join(s.files, 'gone.csv')],
    )
    const errors = results.map((r) => (r.ok ? null : r.error))
    expect(errors[0]).toMatchObject({ code: 'IMPORT_FAILED' })
    expect(errors[0]?.userMessage).toContain('.csv')
    expect(errors[0]?.userMessage).toContain('.xlsx')
    expect(errors[0]?.userMessage).toContain('.vcf')
    expect(errors[1]?.userMessage).toContain('save it as .xlsx')
    expect(errors[2]?.userMessage).toContain('could not be found')
  })

  test('E8.47 — the import dialog picks a file with the system dialog, no typing', async () => {
    const win = s.win
    await createList(win, 'Picked')
    await win.getByTestId('nav-contacts').click()
    await win.getByTestId('list-tab-Picked').click()
    await win.getByTestId('import-contacts').click()

    await expect(win.getByTestId('import-dialog')).toContainText('Excel (.xlsx)')
    await expect(win.getByTestId('import-dialog')).toContainText('Contact cards (.vcf)')
    await expect(
      win.getByTestId('import-dialog').locator('input[type="text"], input:not([type])'),
    ).toHaveCount(0)

    await win.getByTestId('import-file').click()
    await expect(win.getByTestId('import-file-name')).toHaveText('customers.xlsx')
    await win.getByTestId('load-preview').click()

    // "Phone" is recognised as the number column without the user mapping it.
    await expect(win.getByTestId('map-Phone')).toHaveValue('Mobile')
    await expect(win.getByTestId('map-Name')).toHaveValue('Name')
    await win.getByTestId('country-answer').selectOption('included')
    await win.getByTestId('run-import').click()

    await expect(win.getByTestId('import-dialog')).toBeHidden()
    await expect(win.getByTestId('toast').filter({ hasText: 'Imported 3' })).toBeVisible()
    await expect(win.getByTestId('contact-row')).toHaveCount(3)
  })

  test('E8.48 — a 50,000-row .xlsx imports without freezing the app', async () => {
    const big = join(s.files, 'big.xlsx')
    const rows: XlsxCell[][] = [['Name', 'Mobile']]
    for (let i = 0; i < 50_000; i += 1) {
      rows.push([`Lead ${i}`, 919810000000 + i])
    }
    writeXlsx(big, rows)
    const listId = await createList(s.win, 'Big')

    const outcome = await s.win.evaluate(
      async ({ listId, filePath }) => {
        let done = false
        const run = window.api
          .invoke('contacts:import', {
            listId,
            filePath,
            mapping: { Name: 'Name', Mobile: 'Mobile' },
            duplicatePolicy: 'skip',
            dialPrefix: null,
          })
          .finally(() => {
            done = true
          })
        // While the workbook is read and written, main must keep answering.
        let worst = 0
        while (!done) {
          const started = performance.now()
          await window.api.invoke('system:version')
          worst = Math.max(worst, performance.now() - started)
          await new Promise((r) => setTimeout(r, 50))
        }
        return { result: await run, worst }
      },
      { listId, filePath: big },
    )
    expect(outcome.result.ok).toBe(true)
    if (!outcome.result.ok) return
    expect(outcome.result.data.imported).toBe(50_000)
    // A frozen main process answers only when the import ends (~10 s here);
    // a responsive one answers within a batch write. A CSV of the same size
    // measures ~0.75 s worst case on this container, so 2 s leaves headroom.
    expect(outcome.worst).toBeLessThan(2_000)
    const [{ n }] = query<{ n: number }>(
      s.dir,
      "SELECT COUNT(*) AS n FROM Contact WHERE listId = ? AND phone LIKE '+91981%'",
      listId,
    ) as [{ n: number }]
    expect(Number(n)).toBe(50_000)
  })
})

// ═════════════════════ WhatsApp contacts grabber ═════════════════════

test.describe.serial('WhatsApp contacts grabber', () => {
  let s: Session
  let phoneA: string
  let phoneB: string

  test.beforeAll(async () => {
    s = await launch()
    phoneA = await connectDevice(s.win, 'Sales phone')
    phoneB = await connectDevice(s.win, 'Support phone')
    // The sync lands just after "connected".
    await expect.poll(() => waTotal(s.win, {}), { timeout: 15_000 }).toBe(32)
  })
  test.afterAll(async () => {
    await close(s)
  })

  test('E8.50 — each phone lists 12 saved contacts, 6 chats, 16 numbers in all', async () => {
    for (const deviceId of [phoneA, phoneB]) {
      expect(await waTotal(s.win, { deviceId, source: 'addressBook' })).toBe(12)
      expect(await waTotal(s.win, { deviceId, source: 'chats' })).toBe(6)
      expect(await waTotal(s.win, { deviceId, source: 'all' })).toBe(16)
    }
    const chats = await s.win.evaluate(async (deviceId) => {
      const r = await window.api.invoke('waContacts:list', { deviceId, source: 'chats' })
      return r.ok ? r.data.items : []
    }, phoneA)
    // Most recent chat first; the four chat-only numbers are not "saved".
    expect(chats.map((c) => c.phone).slice(0, 3)).toEqual([
      expect.stringMatching(/^\+9197/),
      expect.stringMatching(/^\+9197/),
      '+919600000002',
    ])
    expect(chats.filter((c) => !c.inAddressBook)).toHaveLength(4)
    expect(chats.every((c) => c.hasChat && c.lastChatAt)).toBe(true)
  })

  test('E8.51 — search finds by name and by number, however the number is typed', async () => {
    expect(await waTotal(s.win, { deviceId: phoneA, search: 'Book Contact 1' })).toBe(3)
    expect(await waTotal(s.win, { deviceId: phoneA, search: 'chat lead' })).toBe(2)
    expect(await waTotal(s.win, { deviceId: phoneA, search: '700000005' })).toBe(1)
    expect(await waTotal(s.win, { deviceId: phoneA, search: '+91 97000 00005' })).toBe(1)
    expect(await waTotal(s.win, { deviceId: phoneA, search: 'nobody-here' })).toBe(0)
  })

  test('E8.52 — "only people with a name" drops the unnamed numbers', async () => {
    const named = (source: Source) =>
      waTotal(s.win, { deviceId: phoneA, source, onlyNamed: true })
    expect(await named('addressBook')).toBe(9)
    expect(await named('chats')).toBe(4)
    expect(await named('all')).toBe(11)
  })

  test('E8.53 — pages follow a cursor without repeats or gaps', async () => {
    const phones = await s.win.evaluate(async (deviceId) => {
      const seen: string[] = []
      let cursor: string | undefined
      for (let i = 0; i < 10; i += 1) {
        const r = await window.api.invoke('waContacts:list', {
          deviceId,
          limit: 5,
          ...(cursor ? { cursor } : {}),
        })
        if (!r.ok) throw new Error(r.error.userMessage)
        seen.push(...r.data.items.map((c) => c.phone))
        if (!r.data.nextCursor) break
        cursor = r.data.nextCursor
      }
      return seen
    }, phoneA)
    expect(phones).toHaveLength(16)
    expect(new Set(phones).size).toBe(16)
  })

  test('E8.54 — exporting two phones creates a new list with each number once', async () => {
    const result = await s.win.evaluate(
      (deviceIds) =>
        window.api.invoke('waContacts:export', { deviceIds, listName: 'Everyone' }),
      [phoneA, phoneB],
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toMatchObject({ imported: 16, skipped: 16 })

    const [list] = query<{ fields: string; contactCount: number }>(
      s.dir,
      'SELECT fields, contactCount FROM ContactList WHERE id = ?',
      result.data.listId,
    )
    expect(JSON.parse(list!.fields)).toEqual(['Name', 'Mobile'])
    expect(list!.contactCount).toBe(16)
    const rows = query<{ name: string; phone: string }>(
      s.dir,
      'SELECT name, phone FROM Contact WHERE listId = ?',
      result.data.listId,
    )
    expect(new Set(rows.map((r) => r.phone)).size).toBe(16)
    expect(rows.find((r) => r.phone === '+919700000001')?.name).toBe('Book Contact 2')

    const again = await s.win.evaluate(
      (deviceIds) =>
        window.api.invoke('waContacts:export', { deviceIds, listName: 'Everyone' }),
      [phoneA],
    )
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.error.userMessage).toContain('already exists')
  })

  test('E8.55 — a chats-only export includes the numbers that were never saved', async () => {
    const result = await s.win.evaluate(
      (deviceIds) =>
        window.api.invoke('waContacts:export', {
          deviceIds,
          source: 'chats',
          listName: 'Chats',
        }),
      [phoneA, phoneB],
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toMatchObject({ imported: 6, skipped: 6 })
    const unsaved = query<{ phone: string }>(
      s.dir,
      "SELECT phone FROM Contact WHERE listId = ? AND phone LIKE '+9196%'",
      result.data.listId,
    )
    expect(unsaved).toHaveLength(4)
  })

  test('E8.56 — "chatted since" keeps only recent chats', async () => {
    // Mock chats were last active 0, 1, 2 … 5 hours before the sync.
    const since = new Date(Date.now() - 2.5 * 3_600_000).toISOString()
    const result = await s.win.evaluate(
      ({ deviceIds, since }) =>
        window.api.invoke('waContacts:export', {
          deviceIds,
          source: 'chats',
          chattedSince: since,
          listName: 'Recent chats',
        }),
      { deviceIds: [phoneA], since },
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.imported).toBe(3)
  })

  test('E8.57 — a new inbound message adds the sender as a chat contact', async () => {
    appendFileSync(
      s.inject,
      `${JSON.stringify({ type: 'message', deviceId: phoneA, from: '+919555000123', body: 'Hi' })}\n`,
    )
    await expect
      .poll(() => waTotal(s.win, { deviceId: phoneA, source: 'chats' }), {
        timeout: 15_000,
      })
      .toBe(7)
    const found = await s.win.evaluate(async (deviceId) => {
      const r = await window.api.invoke('waContacts:list', {
        deviceId,
        source: 'chats',
        search: '9555000123',
      })
      return r.ok ? r.data.items[0] : null
    }, phoneA)
    expect(found).toMatchObject({
      phone: '+919555000123',
      inAddressBook: false,
      hasChat: true,
    })
    expect(await waTotal(s.win, { deviceId: phoneA, source: 'addressBook' })).toBe(12)
  })

  test('E8.58 — the grabber dialog shows counts, sources and badges, and searches', async () => {
    const win = s.win
    await win.getByTestId('nav-contacts').click()
    await win.getByTestId('import-whatsapp').click()
    const dialog = win.getByTestId('wa-import-dialog')
    await expect(dialog).toContainText('synced from the phone when it was linked')

    await expect(win.getByTestId(`wa-device-count-${phoneB}`)).toHaveText('16 numbers')
    await win.getByTestId('wa-source-addressBook').click()
    await expect(win.getByTestId(`wa-device-count-${phoneB}`)).toHaveText('12 numbers')
    await win.getByTestId('wa-source-chats').click()
    await expect(dialog).toContainText("aren't saved in your phone")
    await expect(win.getByTestId(`wa-device-count-${phoneB}`)).toHaveText('6 numbers')

    await win.getByTestId('wa-preview-device').selectOption(phoneB)
    await expect(win.getByTestId('wa-contact-row')).toHaveCount(6)
    await expect(
      win
        .getByTestId('wa-contact-row')
        .filter({ has: win.getByTestId('wa-badge-saved') }),
    ).toHaveCount(2)
    await expect(win.getByTestId('wa-badge-chat')).toHaveCount(6)

    await win.getByTestId('wa-only-named').check()
    await expect(win.getByTestId(`wa-device-count-${phoneB}`)).toHaveText('4 numbers')
    await expect(win.getByTestId('wa-contact-row')).toHaveCount(4)

    await win.getByTestId('wa-source-all').click()
    await win.getByTestId('wa-search').fill('Book Contact 1')
    await expect(win.getByTestId('wa-contact-row')).toHaveCount(3)
    await expect(win.getByTestId('wa-preview-total')).toContainText('3 numbers')
  })

  test('E8.59 — importing from the dialog creates the list and opens it', async () => {
    const win = s.win
    // Continues from E8.58: everyone with a name, from the second phone only.
    await win.getByTestId(`wa-device-${phoneA}`).uncheck()
    await win.getByTestId('wa-list-name').fill('From Support phone')
    await win.getByTestId('wa-import').click()

    await expect(win.getByTestId('wa-import-dialog')).toBeHidden()
    await expect(
      win.getByTestId('toast').filter({ hasText: 'Imported 11 contacts' }),
    ).toBeVisible()
    await expect(win.getByTestId('list-tab-From Support phone')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(win.getByTestId('contact-row')).toHaveCount(11)
  })
})
