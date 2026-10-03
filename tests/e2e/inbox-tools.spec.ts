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
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { activateWith, cleanupUserDataDir, newUserDataDir } from './fixtures/licensed-app'
import { APP_READY_TIMEOUT_MS } from './fixtures/constants'

/**
 * E8.1–E8.19 — inbox tools (Wave 3): quick replies, the contact side panel and
 * notes, scheduled messages, rich message bubbles, the file picker in the
 * attach menu and the `/inbox?chat=` deep link.
 *
 * Inbound messages come from WA_MOCK_INJECT and every send is read back from
 * WA_MOCK_SEND_LOG; nothing here talks to a real WhatsApp account. The
 * scheduler ticks every second (RB_TICK_MS) so scheduled sends need no waiting.
 */

const CUSTOMER = '+919811100001'
const CHAT_ID = `${CUSTOMER}@s.whatsapp.net`

interface LoggedSend {
  deviceId: string
  to: string
  message: Record<string, unknown> & { kind: string }
}

interface Session {
  app: ElectronApplication
  win: Page
  dir: string
  scratch: string
  logPath: string
  injectPath: string
  files: { photo: string; sticker: string }
  close: () => Promise<void>
  cleanup: () => Promise<void>
}

function readSends(logPath: string): LoggedSend[] {
  if (!existsSync(logPath)) return []
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as LoggedSend)
}

function scratchFiles(scratch: string) {
  const files = {
    photo: join(scratch, 'flyer.png'),
    sticker: join(scratch, 'smile.webp'),
  }
  // Content is irrelevant to the mock; the media policy checks extension and size.
  for (const path of Object.values(files)) {
    if (!existsSync(path)) writeFileSync(path, Buffer.alloc(2048, 1))
  }
  return files
}

/**
 * Launch with isolated logs. Pass `reuse` to relaunch on an earlier session's
 * userData and logs — a restart, as far as the app can tell.
 */
async function launch(
  options: { pick?: 'photo' | 'sticker'; reuse?: { dir: string; scratch: string } } = {},
): Promise<Session> {
  const dir = options.reuse?.dir ?? newUserDataDir()
  const scratch =
    options.reuse?.scratch ?? mkdtempSync(join(tmpdir(), 'rapbooster-inbox-'))
  const logPath = join(scratch, 'sends.jsonl')
  const injectPath = join(scratch, `inject-${Date.now()}.jsonl`)
  writeFileSync(injectPath, '')
  const files = scratchFiles(scratch)

  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${dir}`],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: undefined,
      LICENSE_SERVICE: 'mock',
      WA_TRANSPORT: 'mock',
      WA_MOCK_SEND_LOG: logPath,
      WA_MOCK_INJECT: injectPath,
      RB_TICK_MS: '1000',
      NODE_ENV: 'test',
      ...(options.pick ? { RB_PICK_FILE: files[options.pick] } : {}),
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

  return {
    app,
    win,
    dir,
    scratch,
    logPath,
    injectPath,
    files,
    close: () => app.close(),
    cleanup: async () => {
      await app.close()
      cleanupUserDataDir(dir)
      rmSync(scratch, { recursive: true, force: true })
    },
  }
}

/** A connected device — created on first launch, reconnected on a relaunch. */
async function connectDevice(win: Page): Promise<string> {
  return win.evaluate(async () => {
    const list = await window.api.invoke('device:list')
    let id = list.ok ? list.data[0]?.id : undefined
    if (!id) {
      const d = await window.api.invoke('device:create', { name: 'Inbox Phone' })
      if (!d.ok) throw new Error('device')
      id = d.data.id
    }
    await window.api.invoke('device:connect', { id })
    for (let i = 0; i < 80; i += 1) {
      const now = await window.api.invoke('device:list')
      if (now.ok && now.data.find((x) => x.id === id)?.status === 'connected') break
      await new Promise((r) => setTimeout(r, 250))
    }
    return id
  })
}

function inject(s: Session, line: Record<string, unknown>): void {
  appendFileSync(s.injectPath, `${JSON.stringify({ deviceId: '*', ...line })}\n`)
}

/** A customer writes in; open their chat in the inbox. */
async function openCustomerChat(s: Session, body = 'Hello there'): Promise<void> {
  inject(s, { type: 'message', from: CUSTOMER, body })
  await s.win.getByTestId('nav-inbox').click()
  const item = s.win.getByTestId('chat-item').filter({ hasText: CUSTOMER })
  await expect(item).toBeVisible({ timeout: 30_000 })
  await item.click()
  await expect(s.win.getByTestId('message-thread')).toContainText(body)
}

/** A contact list holding the customer, so merge tags and the profile have data. */
async function seedContact(win: Page, tagName?: string): Promise<void> {
  await win.evaluate(
    async ({ phone, tag }) => {
      const list = await window.api.invoke('contactList:create', {
        name: 'VIP buyers',
        customFields: ['City'],
      })
      if (!list.ok) throw new Error('list')
      const c = await window.api.invoke('contacts:create', {
        listId: list.data.id,
        data: { Name: 'Asha', Mobile: phone, City: 'Pune' },
      })
      if (!c.ok) throw new Error(`contact: ${JSON.stringify(c.error)}`)
      if (tag) {
        const t = await window.api.invoke('tag:create', { name: tag })
        if (!t.ok) throw new Error('tag')
        await window.api.invoke('tag:assign', {
          tagId: t.data.id,
          contactIds: [c.data.id],
        })
      }
    },
    { phone: CUSTOMER, tag: tagName },
  )
}

async function createQuickReply(
  win: Page,
  input: { shortcut: string; title: string; body: string },
): Promise<string> {
  return win.evaluate(async (qr) => {
    const r = await window.api.invoke('quickReply:create', qr)
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    return r.data.id
  }, input)
}

async function scheduleIn(
  win: Page,
  seconds: number,
  body: string,
  mediaSourcePath?: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  return win.evaluate(
    async ({ chatId, at, text, media }) => {
      const r = await window.api.invoke('scheduledMessage:create', {
        chatId,
        body: text,
        sendAt: new Date(Date.now() + at * 1000).toISOString(),
        ...(media ? { mediaSourcePath: media } : {}),
      })
      return r.ok
        ? { ok: true, id: r.data.id }
        : { ok: false, error: r.error.userMessage }
    },
    { chatId: CHAT_ID, at: seconds, text: body, media: mediaSourcePath },
  )
}

function scheduledRows(
  dir: string,
): Array<{ id: string; status: string; error: string | null }> {
  const db = new DatabaseSync(join(dir, 'rapbooster.db'), { readOnly: true })
  try {
    return db
      .prepare('SELECT id, status, error FROM ScheduledMessage ORDER BY createdAt')
      .all() as unknown as Array<{ id: string; status: string; error: string | null }>
  } finally {
    db.close()
  }
}

const sendsTo = (s: Session, to: string) =>
  readSends(s.logPath).filter((x) => x.to === to)

test.describe('Inbox tools — quick replies', () => {
  test('E8.1–E8.3 — create, reject a duplicate shortcut, edit and delete a quick reply', async () => {
    const s = await launch()
    try {
      await s.win.getByTestId('nav-inbox').click()
      await s.win.getByTestId('quick-replies-open').click()
      const dialog = s.win.getByTestId('quick-replies-dialog')
      await expect(dialog).toContainText('No quick replies yet')

      // E8.1 — create.
      await s.win.getByTestId('qr-new').click()
      await s.win.getByTestId('qr-shortcut').fill('prices')
      await s.win.getByTestId('qr-title').fill('Price list')
      await s.win.getByTestId('qr-body').fill('Hi {{Name}}, our prices start at 499.')
      await s.win.getByTestId('qr-save').click()
      await expect(s.win.getByTestId('qr-item')).toHaveCount(1)
      await expect(s.win.getByTestId('qr-item')).toContainText('/prices')

      // E8.2 — the same shortcut again is refused with a friendly message.
      await s.win.getByTestId('qr-new').click()
      await s.win.getByTestId('qr-shortcut').fill('prices')
      await s.win.getByTestId('qr-title').fill('Another')
      await s.win.getByTestId('qr-body').fill('Something else')
      await s.win.getByTestId('qr-save').click()
      await expect(s.win.getByTestId('qr-error')).toContainText(
        'already have a quick reply',
      )
      await expect(s.win.getByTestId('qr-error')).toContainText('/prices')

      // E8.3 — edit, then delete after confirming.
      await s.win.getByRole('button', { name: 'Back' }).click()
      await s.win.getByTestId('qr-edit').click()
      await s.win.getByTestId('qr-title').fill('Prices 2026')
      await s.win.getByTestId('qr-save').click()
      await expect(s.win.getByTestId('qr-item')).toContainText('Prices 2026')
      await s.win.getByTestId('qr-delete').click()
      await s.win.getByTestId('qr-confirm-delete').click()
      await expect(s.win.getByTestId('qr-item')).toHaveCount(0)
      const left = await s.win.evaluate(() => window.api.invoke('quickReply:list'))
      expect(left.ok && left.data).toEqual([])
    } finally {
      await s.cleanup()
    }
  })

  test('E8.4–E8.5 — typing / opens the picker; Enter inserts the rendered reply and counts the use', async () => {
    const s = await launch()
    try {
      await connectDevice(s.win)
      await seedContact(s.win)
      await createQuickReply(s.win, {
        shortcut: 'prices',
        title: 'Price list',
        body: 'Hi {{Name}}, our prices start at 499.',
      })
      await createQuickReply(s.win, {
        shortcut: 'hours',
        title: 'Opening hours',
        body: 'We are open 9 to 6, {{City}} store.',
      })
      await openCustomerChat(s)

      const input = s.win.getByTestId('message-input')
      await input.fill('/')
      await expect(s.win.getByTestId('qr-option')).toHaveCount(2)
      await input.pressSequentially('pri')
      await expect(s.win.getByTestId('qr-option')).toHaveCount(1)
      await expect(s.win.getByTestId('qr-option')).toContainText('/prices')

      // Esc closes the picker without touching the text.
      await input.press('Escape')
      await expect(s.win.getByTestId('qr-picker')).toHaveCount(0)
      await expect(input).toHaveValue('/pri')

      // Typing again reopens it; arrows move, Enter inserts with merge tags filled.
      await input.fill('Sure! /')
      await expect(s.win.getByTestId('qr-option')).toHaveCount(2)
      const options = await s.win.getByTestId('qr-option').allTextContents()
      const hoursIndex = options.findIndex((t) => t.includes('/hours'))
      if (hoursIndex === 1) await input.press('ArrowDown')
      await expect(s.win.getByTestId('qr-option').nth(hoursIndex)).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await input.press('Enter')
      await expect(input).toHaveValue('Sure! We are open 9 to 6, Pune store.')
      await expect(s.win.getByTestId('qr-picker')).toHaveCount(0)

      // Inserting does not send: the person still presses Send.
      expect(sendsTo(s, CHAT_ID)).toHaveLength(0)
      await s.win.getByTestId('send-message').click()
      await expect(s.win.getByTestId('message-thread')).toContainText('Pune store.')

      // E8.5 — the use count went up for the inserted reply only.
      const list = await s.win.evaluate(() => window.api.invoke('quickReply:list'))
      if (!list.ok) throw new Error('list')
      const counts = Object.fromEntries(list.data.map((q) => [q.shortcut, q.useCount]))
      expect(counts).toEqual({ hours: 1, prices: 0 })

      // The name tag renders from the contact list record.
      await input.fill('/prices')
      await input.press('Enter')
      await expect(input).toHaveValue('Hi Asha, our prices start at 499.')
    } finally {
      await s.cleanup()
    }
  })
})

test.describe('Inbox tools — contact panel and notes', () => {
  test('E8.6–E8.7 — the side panel shows the profile, list fields, tags and campaign history', async () => {
    const s = await launch()
    try {
      const deviceId = await connectDevice(s.win)
      await seedContact(s.win, 'Gold')
      await s.win.evaluate(async (device) => {
        const tpl = await window.api.invoke('template:create', {
          name: 'Promo',
          type: 'text',
          content: 'Hi {{Name}}, big sale this week!',
        })
        if (!tpl.ok) throw new Error('template')
        const lists = await window.api.invoke('contactList:list')
        if (!lists.ok) throw new Error('lists')
        const campaign = await window.api.invoke('campaign:create', {
          name: 'Diwali sale',
          templateId: tpl.data.id,
          deviceIds: [device],
          listIds: lists.data.map((l) => l.id),
          delayFrom: 0,
          delayTo: 0,
          sleepDuration: 0,
          sleepAfter: 100,
        })
        if (!campaign.ok) throw new Error(JSON.stringify(campaign.error))
        await window.api.invoke('campaign:start', { id: campaign.data.id })
      }, deviceId)
      await expect.poll(() => sendsTo(s, CUSTOMER).length, { timeout: 30_000 }).toBe(1)

      await openCustomerChat(s, 'Is the sale still on?')

      // E8.6 — hidden until asked for, then the profile.
      await expect(s.win.getByTestId('contact-panel')).toHaveCount(0)
      await s.win.getByTestId('contact-panel-toggle').click()
      const panel = s.win.getByTestId('contact-panel')
      await expect(panel).toBeVisible()
      await expect(s.win.getByTestId('profile-phone')).toHaveText(CUSTOMER)
      await expect(s.win.getByTestId('profile-opted-out')).toHaveCount(0)
      const record = s.win.getByTestId('profile-contact')
      await expect(record).toContainText('VIP buyers')
      await expect(record).toContainText('Asha')
      await expect(record).toContainText('Pune')
      await expect(s.win.getByTestId('profile-tag')).toHaveText('Gold')

      // E8.7 — campaign history with the delivery steps.
      const campaign = s.win.getByTestId('profile-campaign')
      await expect(campaign).toContainText('Diwali sale')
      await expect(
        campaign.getByTestId('profile-campaign-step').filter({ hasText: 'Sent' }),
      ).toHaveAttribute('data-done', 'yes')

      // Closing the panel hides it again.
      await s.win.getByTestId('contact-panel-toggle').click()
      await expect(s.win.getByTestId('contact-panel')).toHaveCount(0)
    } finally {
      await s.cleanup()
    }
  })

  test('E8.8 — notes are added newest first, deleted after confirming, and survive a restart', async () => {
    let s = await launch()
    const { dir, scratch } = s
    try {
      await connectDevice(s.win)
      await openCustomerChat(s)
      await s.win.getByTestId('contact-panel-toggle').click()

      await expect(s.win.getByTestId('note-add')).toBeDisabled()
      for (const text of [
        'Prefers calls after 5 pm',
        'Asked for a bulk discount',
        'Typo note',
      ]) {
        await s.win.getByTestId('note-input').fill(text)
        await s.win.getByTestId('note-add').click()
        await expect(s.win.getByTestId('note-item').first()).toContainText(text)
      }
      await expect(s.win.getByTestId('note-body')).toHaveText([
        'Typo note',
        'Asked for a bulk discount',
        'Prefers calls after 5 pm',
      ])

      await s.win.getByTestId('note-item').first().getByTestId('note-delete').click()
      await s.win.getByTestId('note-confirm-delete').click()
      await expect(s.win.getByTestId('note-item')).toHaveCount(2)
      await s.close()

      s = await launch({ reuse: { dir, scratch } })
      await s.win.getByTestId('nav-inbox').click()
      await s.win.getByTestId('chat-item').filter({ hasText: CUSTOMER }).click()
      await s.win.getByTestId('contact-panel-toggle').click()
      await expect(s.win.getByTestId('note-body')).toHaveText([
        'Asked for a bulk discount',
        'Prefers calls after 5 pm',
      ])
    } finally {
      await s.cleanup()
    }
  })
})

test.describe('Inbox tools — scheduled messages', () => {
  test('E8.9–E8.11 — schedule from the composer, reject a past time, cancel before it sends', async () => {
    const s = await launch({ pick: 'photo' })
    try {
      await connectDevice(s.win)
      await openCustomerChat(s)

      // E8.10 — a time in the past is refused.
      await s.win.getByTestId('message-input').fill('See you tomorrow')
      await s.win.getByTestId('schedule-open').click()
      await expect(s.win.getByTestId('schedule-body')).toHaveValue('See you tomorrow')
      await s.win.getByTestId('schedule-at').fill('2020-01-01T09:00')
      await s.win.getByTestId('schedule-submit').click()
      await expect(s.win.getByTestId('schedule-error')).toContainText('in the future')

      // E8.9 — a future time with an attachment chosen through the file picker.
      const tomorrow = new Date(Date.now() + 86_400_000)
      const local = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}T10:30`
      await s.win.getByTestId('schedule-at').fill(local)
      await s.win.getByTestId('schedule-pick-file').click()
      await expect(s.win.getByTestId('schedule-file-name')).toContainText('flyer.png')
      await s.win.getByTestId('schedule-submit').click()
      await expect(s.win.getByTestId('schedule-dialog')).toHaveCount(0)
      await expect(s.win.getByTestId('message-input')).toHaveValue('')
      const item = s.win.getByTestId('scheduled-item')
      await expect(item).toHaveCount(1)
      await expect(item).toContainText('See you tomorrow')
      await expect(item).toContainText('flyer.png')
      await expect(item).toHaveAttribute('data-status', 'scheduled')

      // E8.11 — a message due in a few seconds, cancelled first, never goes out.
      const soon = await scheduleIn(s.win, 6, 'Cancel me')
      expect(soon.ok).toBe(true)
      await expect(s.win.getByTestId('scheduled-item')).toHaveCount(2)
      await s.win
        .getByTestId('scheduled-item')
        .filter({ hasText: 'Cancel me' })
        .getByTestId('scheduled-cancel')
        .click()
      await s.win.getByTestId('scheduled-confirm-yes').click()
      await expect(s.win.getByTestId('scheduled-item')).toHaveCount(1)
      await s.win.waitForTimeout(8_000)
      expect(sendsTo(s, CHAT_ID)).toHaveLength(0)
      const rows = scheduledRows(s.dir)
      expect(rows.map((r) => r.status).sort()).toEqual(['cancelled', 'scheduled'])
    } finally {
      await s.cleanup()
    }
  })

  test('E8.12–E8.13 — a due message is sent by the scheduler, with its attachment, and shows in the thread', async () => {
    const s = await launch()
    try {
      await connectDevice(s.win)
      await openCustomerChat(s)

      expect((await scheduleIn(s.win, 2, 'Your order shipped today')).ok).toBe(true)
      await expect(s.win.getByTestId('scheduled-item')).toHaveCount(1)

      // E8.12 — text: sent through the throttle, shown in the thread, gone from the strip.
      await expect.poll(() => sendsTo(s, CHAT_ID).length, { timeout: 20_000 }).toBe(1)
      expect(sendsTo(s, CHAT_ID)[0]?.message).toEqual({
        kind: 'text',
        body: 'Your order shipped today',
      })
      await expect(s.win.getByTestId('message-thread')).toContainText(
        'Your order shipped today',
      )
      await expect(s.win.getByTestId('scheduled-item')).toHaveCount(0)
      expect(scheduledRows(s.dir)[0]?.status).toBe('sent')

      // E8.13 — a photo goes out as media with the text as its caption.
      expect((await scheduleIn(s.win, 2, 'This week’s flyer', s.files.photo)).ok).toBe(
        true,
      )
      await expect.poll(() => sendsTo(s, CHAT_ID).length, { timeout: 20_000 }).toBe(2)
      const media = sendsTo(s, CHAT_ID)[1]?.message
      expect(media).toMatchObject({
        kind: 'media',
        mediaType: 'image',
        caption: 'This week’s flyer',
      })
      // The app sent a stored copy, not the user's original file.
      expect(String(media?.path)).not.toBe(s.files.photo)
      const bubble = s.win.getByTestId('message-rich').filter({ hasText: 'Photo' })
      await expect(bubble).toBeVisible()
      await expect(s.win.getByTestId('message-thread')).toContainText('This week’s flyer')
    } finally {
      await s.cleanup()
    }
  })

  test('E8.14 — a scheduled message to an opted-out number fails with a clear reason', async () => {
    const s = await launch()
    try {
      await connectDevice(s.win)
      await openCustomerChat(s)
      await s.win.evaluate(
        (phone) => window.api.invoke('suppression:add', { phones: [phone] }),
        CUSTOMER,
      )

      expect((await scheduleIn(s.win, 2, 'Last chance offer')).ok).toBe(true)
      const item = s.win.getByTestId('scheduled-item')
      await expect(item).toHaveAttribute('data-status', 'failed', { timeout: 20_000 })
      await expect(item.getByTestId('scheduled-error')).toContainText('opted out')
      expect(sendsTo(s, CHAT_ID)).toHaveLength(0)

      // The profile says so too, and a failed row can be dismissed.
      await s.win.getByTestId('contact-panel-toggle').click()
      await expect(s.win.getByTestId('profile-opted-out')).toBeVisible()
      await item.getByTestId('scheduled-cancel').click()
      await expect(s.win.getByTestId('scheduled-item')).toHaveCount(0)
    } finally {
      await s.cleanup()
    }
  })

  test('E8.15 — a message left "sending" by a crash is recovered and sent on the next start', async () => {
    let s = await launch()
    const { dir, scratch } = s
    let id: string | undefined
    try {
      await connectDevice(s.win)
      await openCustomerChat(s)
      const created = await scheduleIn(s.win, 86_400, 'Interrupted reminder')
      expect(created.ok).toBe(true)
      id = created.id
      await s.close()

      // The previous process died mid-send: the row is `sending` and overdue.
      const db = new DatabaseSync(join(dir, 'rapbooster.db'))
      try {
        db.prepare(
          "UPDATE ScheduledMessage SET status = 'sending', sendAt = ? WHERE id = ?",
        ).run(new Date(Date.now() - 60_000).toISOString(), id ?? '')
      } finally {
        db.close()
      }

      s = await launch({ reuse: { dir, scratch } })
      await connectDevice(s.win)
      await expect
        .poll(
          () =>
            sendsTo(s, CHAT_ID).filter((x) => x.message.body === 'Interrupted reminder')
              .length,
          {
            timeout: 30_000,
          },
        )
        .toBe(1)
      await expect
        .poll(() => scheduledRows(dir)[0]?.status, { timeout: 10_000 })
        .toBe('sent')
    } finally {
      await s.cleanup()
    }
  })
})

test.describe('Inbox tools — rich bubbles, file picker and deep link', () => {
  test('E8.16 — injected photo, location and contact messages render as rich bubbles', async () => {
    const s = await launch()
    try {
      await connectDevice(s.win)
      await openCustomerChat(s)
      // NOTE: the mock's inject format carries type and body but no file name or
      // size, so a document bubble's name/size line cannot be driven from here.
      inject(s, {
        type: 'message',
        from: CUSTOMER,
        messageType: 'media',
        body: 'Is this one in stock?',
      })
      inject(s, {
        type: 'message',
        from: CUSTOMER,
        messageType: 'location',
        body: '19.076,72.8777',
      })
      inject(s, {
        type: 'message',
        from: CUSTOMER,
        messageType: 'contact',
        body: 'Ravi Kumar',
      })

      const media = s.win.locator('[data-testid="message-rich"][data-kind="media"]')
      await expect(media).toContainText('Photo or video')
      await expect(s.win.getByTestId('message-thread')).toContainText(
        'Is this one in stock?',
      )
      const location = s.win.locator('[data-testid="message-rich"][data-kind="location"]')
      await expect(location).toContainText('Location')
      await expect(location.getByTestId('message-rich-detail')).toHaveText(
        'Pinned at 19.076, 72.8777',
      )
      const contact = s.win.locator('[data-testid="message-rich"][data-kind="contact"]')
      await expect(contact).toContainText('Contact card')
      await expect(contact).toContainText('Ravi Kumar')
    } finally {
      await s.cleanup()
    }
  })

  test('E8.17 — the attach menu picks a sticker with the file picker, no typed path', async () => {
    const s = await launch({ pick: 'sticker' })
    try {
      await connectDevice(s.win)
      await openCustomerChat(s)
      await s.win.getByTestId('rich-attach').click()
      await s.win.getByTestId('rich-option-sticker').click()
      await expect(s.win.getByTestId('rich-file-path')).toHaveCount(0)
      await s.win.getByTestId('rich-send').click()
      await expect(s.win.getByTestId('rich-error')).toContainText('Choose the file')

      await s.win.getByTestId('rich-pick-file').click()
      await expect(s.win.getByTestId('rich-file-name')).toHaveText('smile.webp')
      await s.win.getByTestId('rich-send').click()
      await expect(s.win.getByTestId('rich-dialog')).toHaveCount(0)
      await expect.poll(() => sendsTo(s, CHAT_ID).length, { timeout: 15_000 }).toBe(1)
      expect(sendsTo(s, CHAT_ID)[0]?.message.kind).toBe('sticker')
      await expect(
        s.win.locator('[data-testid="message-rich"][data-kind="sticker"]'),
      ).toContainText('Sticker')
    } finally {
      await s.cleanup()
    }
  })

  test('E8.18–E8.19 — /inbox?chat= opens that chat; an unknown quick reply shortcut shows a hint', async () => {
    const s = await launch()
    try {
      await connectDevice(s.win)
      inject(s, { type: 'message', from: CUSTOMER, body: 'First customer' })
      inject(s, { type: 'message', from: '+919811100002', body: 'Second customer' })
      await s.win.getByTestId('nav-inbox').click()
      await expect(s.win.getByTestId('chat-item')).toHaveCount(2, { timeout: 30_000 })
      await s.win.getByTestId('nav-dashboard').click()
      await expect(s.win.getByTestId('page-title')).not.toHaveText('Unified inbox')

      // E8.18 — the URL a notification or another screen uses.
      await s.win.evaluate(
        (chatId) => window.location.assign(`/inbox/?chat=${encodeURIComponent(chatId)}`),
        CHAT_ID,
      )
      await expect(s.win.getByTestId('page-title')).toHaveText('Unified inbox')
      await expect(s.win.getByTestId('chat-name')).toBeVisible({ timeout: 15_000 })
      await expect(s.win.getByTestId('message-thread')).toContainText('First customer')
      await expect(s.win.getByTestId('message-thread')).not.toContainText(
        'Second customer',
      )

      // E8.19 — no matches: the picker says so and Enter does not insert anything.
      const input = s.win.getByTestId('message-input')
      await input.fill('/nothing')
      await expect(s.win.getByTestId('qr-picker-empty')).toContainText('/nothing')
      await s.win.getByTestId('qr-manage').click()
      await expect(s.win.getByTestId('quick-replies-dialog')).toBeVisible()
    } finally {
      await s.cleanup()
    }
  })
})
