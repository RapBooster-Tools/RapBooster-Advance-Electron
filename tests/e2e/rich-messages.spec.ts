import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { activateWith, cleanupUserDataDir, newUserDataDir } from './fixtures/licensed-app'
import { APP_READY_TIMEOUT_MS } from './fixtures/constants'

/**
 * E5.40–E5.59 — rich messages and spintax (tracker D89).
 *
 * What goes on the wire is read from WA_MOCK_SEND_LOG; nothing here talks to a
 * real WhatsApp account. Each test launches with its own send log so one
 * test's sends can never satisfy another's assertion.
 */

interface LoggedSend {
  deviceId: string
  to: string
  message: Record<string, unknown> & { kind: string }
}

function readSends(logPath: string): LoggedSend[] {
  if (!existsSync(logPath)) return []
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as LoggedSend)
}

interface Session {
  app: ElectronApplication
  win: Page
  dir: string
  logPath: string
  files: { voice: string; sticker: string; png: string }
  cleanup: () => Promise<void>
}

async function launch(extraEnv: Record<string, string> = {}): Promise<Session> {
  const dir = newUserDataDir()
  const scratch = mkdtempSync(join(tmpdir(), 'rapbooster-rich-'))
  const logPath = join(scratch, 'sends.jsonl')
  // Content is irrelevant to the mock; the media policy checks extension and size.
  const files = {
    voice: join(scratch, 'note.ogg'),
    sticker: join(scratch, 'smile.webp'),
    png: join(scratch, 'smile.png'),
  }
  for (const path of Object.values(files)) writeFileSync(path, Buffer.alloc(2048, 1))

  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${dir}`],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: undefined,
      LICENSE_SERVICE: 'mock',
      WA_TRANSPORT: 'mock',
      WA_MOCK_SEND_LOG: logPath,
      NODE_ENV: 'test',
      ...extraEnv,
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
    logPath,
    files,
    cleanup: async () => {
      await app.close()
      cleanupUserDataDir(dir)
      rmSync(scratch, { recursive: true, force: true })
    },
  }
}

/** A connected device; waits for the mock to report the socket up. */
async function connectDevice(win: Page): Promise<string> {
  return win.evaluate(async () => {
    const d = await window.api.invoke('device:create', { name: 'Rich Sender' })
    if (!d.ok) throw new Error('device')
    await window.api.invoke('device:connect', { id: d.data.id })
    for (let i = 0; i < 80; i += 1) {
      const list = await window.api.invoke('device:list')
      if (list.ok && list.data.find((x) => x.id === d.data.id)?.status === 'connected')
        break
      await new Promise((r) => setTimeout(r, 250))
    }
    return d.data.id
  })
}

type TemplateInput = NonNullable<
  Parameters<typeof window.api.invoke<'template:create'>>[1]
>

/** Create a template, a list of the given contacts and a campaign; start it. */
async function runCampaign(
  win: Page,
  deviceId: string,
  template: TemplateInput,
  contacts: Array<Record<string, string>>,
): Promise<void> {
  await win.evaluate(
    async ({ deviceId: device, template: tpl, contacts: people }) => {
      const created = await window.api.invoke('template:create', tpl)
      if (!created.ok) throw new Error(`template: ${JSON.stringify(created.error)}`)
      const list = await window.api.invoke('contactList:create', {
        name: `List ${Math.random()}`,
        customFields: [],
      })
      if (!list.ok) throw new Error('list')
      for (const data of people) {
        const c = await window.api.invoke('contacts:create', {
          listId: list.data.id,
          data,
        })
        if (!c.ok) throw new Error(`contact: ${JSON.stringify(c.error)}`)
      }
      const campaign = await window.api.invoke('campaign:create', {
        name: `Campaign ${Math.random()}`,
        templateId: created.data.id,
        deviceIds: [device],
        listIds: [list.data.id],
        delayFrom: 0,
        delayTo: 0,
        sleepDuration: 0,
        sleepAfter: 100,
      })
      if (!campaign.ok) throw new Error(`campaign: ${JSON.stringify(campaign.error)}`)
      const started = await window.api.invoke('campaign:start', { id: campaign.data.id })
      if (!started.ok) throw new Error(`start: ${JSON.stringify(started.error)}`)
    },
    { deviceId, template, contacts },
  )
}

const POLL: TemplateInput = {
  name: 'Lunch poll',
  type: 'poll',
  content: 'Hi {{Name}}, which day works?',
  extra: { options: ['Monday', 'Tuesday', 'Friday'], selectableCount: 1 },
}

/** One template of every rich type; voice and sticker need real file paths. */
function richTemplates(files: Session['files']): TemplateInput[] {
  return [
    { name: 'Voice', type: 'voice', content: '', mediaSourcePath: files.voice },
    { name: 'Sticker', type: 'sticker', content: '', mediaSourcePath: files.sticker },
    {
      name: 'Office',
      type: 'location',
      content: '',
      extra: { latitude: 19.076, longitude: 72.8777, name: 'Office', address: 'Mumbai' },
    },
    {
      name: 'Support card',
      type: 'contact',
      content: '',
      extra: { contacts: [{ name: 'Support Desk', phone: '+919800000001' }] },
    },
    POLL,
    {
      name: 'Launch',
      type: 'event',
      content: 'Launch party',
      extra: {
        startAt: '2026-12-01T18:00:00+05:30',
        endAt: '2026-12-01T21:00:00+05:30',
        location: 'Rooftop',
        description: 'Drinks and demos',
      },
    },
    {
      name: 'Featured',
      type: 'product',
      content: 'Our best seller, {{Name}}',
      extra: {
        deviceId: 'device-snapshot',
        productId: 'prod-1',
        title: 'Blue Kettle',
        priceAmount1000: 1499000,
        currency: 'INR',
      },
    },
  ]
}

test.describe('rich messages', () => {
  test('E5.40 — one template of each rich type saves and lists with its payload', async () => {
    const s = await launch()
    try {
      const result = await s.win.evaluate(async (inputs) => {
        const out: Array<{ type: string; ok: boolean; error?: unknown }> = []
        for (const input of inputs) {
          const r = await window.api.invoke('template:create', input)
          out.push({ type: input.type, ok: r.ok, ...(r.ok ? {} : { error: r.error }) })
        }
        const list = await window.api.invoke('template:list')
        return { out, list: list.ok ? list.data : [] }
      }, richTemplates(s.files))

      expect(result.out.filter((r) => !r.ok)).toEqual([])
      const byType = new Map(result.list.map((t) => [t.type, t]))
      for (const type of ['voice', 'sticker'] as const) {
        const t = byType.get(type)
        // Copied into the managed store, not referenced in place.
        expect(t?.mediaPath).toContain(join('media', 'templates'))
        expect(t?.mediaType).toBe(type === 'voice' ? 'audio' : 'sticker')
      }
      expect(byType.get('location')?.extra).toMatchObject({ latitude: 19.076 })
      expect(byType.get('contact')?.extra).toMatchObject({
        contacts: [{ name: 'Support Desk' }],
      })
      expect(byType.get('poll')?.extra).toMatchObject({
        options: ['Monday', 'Tuesday', 'Friday'],
        selectableCount: 1,
      })
      expect(byType.get('event')?.extra).toMatchObject({ location: 'Rooftop' })
      expect(byType.get('product')?.extra).toMatchObject({ productId: 'prod-1' })
    } finally {
      await s.cleanup()
    }
  })

  test('E5.41 — invalid rich templates are rejected with a reason', async () => {
    const s = await launch()
    try {
      const errors = await s.win.evaluate(async (files) => {
        const attempt = async (
          input: Parameters<typeof window.api.invoke<'template:create'>>[1],
        ) => {
          const r = await window.api.invoke('template:create', input)
          return r.ok ? null : r.error
        }
        return {
          oneOption: await attempt({
            name: 'Bad poll',
            type: 'poll',
            content: 'Pick one',
            extra: { options: ['Only'], selectableCount: 1 },
          }),
          noQuestion: await attempt({
            name: 'Blank poll',
            type: 'poll',
            content: '  ',
            extra: { options: ['A', 'B'], selectableCount: 1 },
          }),
          tooManyChoices: await attempt({
            name: 'Wide poll',
            type: 'poll',
            content: 'Pick',
            extra: { options: ['A', 'B'], selectableCount: 3 },
          }),
          latitude: await attempt({
            name: 'Nowhere',
            type: 'location',
            content: '',
            extra: { latitude: 91, longitude: 10 },
          }),
          sticker: await attempt({
            name: 'PNG sticker',
            type: 'sticker',
            content: '',
            mediaSourcePath: files.png,
          }),
          noVoice: await attempt({ name: 'Silent', type: 'voice', content: '' }),
          backwardsEvent: await attempt({
            name: 'Time travel',
            type: 'event',
            content: 'Party',
            extra: {
              startAt: '2026-12-01T18:00:00+05:30',
              endAt: '2026-12-01T17:00:00+05:30',
            },
          }),
          list: await window.api.invoke('template:list'),
        }
      }, s.files)

      for (const key of [
        'oneOption',
        'noQuestion',
        'tooManyChoices',
        'latitude',
        'sticker',
        'noVoice',
        'backwardsEvent',
      ] as const) {
        expect(errors[key]?.code, key).toBe('VALIDATION_FAILED')
      }
      expect(errors.noQuestion?.userMessage).toBe('Write the poll question.')
      expect(errors.sticker?.userMessage).toContain('.webp')
      expect(errors.noVoice?.userMessage).toContain('audio file')
      expect(errors.backwardsEvent?.userMessage).toContain('end after it starts')
      // A rejected media template must not leave a row behind.
      expect(errors.list.ok && errors.list.data).toEqual([])
    } finally {
      await s.cleanup()
    }
  })

  test('E5.42 — a campaign with a poll template sends a real poll', async () => {
    const s = await launch()
    try {
      const deviceId = await connectDevice(s.win)
      await runCampaign(s.win, deviceId, POLL, [
        { Name: 'Asha', Mobile: '+919876543210' },
      ])

      await expect.poll(() => readSends(s.logPath).length, { timeout: 30_000 }).toBe(1)
      const [sent] = readSends(s.logPath)
      expect(sent?.to).toBe('+919876543210')
      expect(sent?.message).toEqual({
        kind: 'poll',
        name: 'Hi Asha, which day works?',
        options: ['Monday', 'Tuesday', 'Friday'],
        selectableCount: 1,
      })
    } finally {
      await s.cleanup()
    }
  })

  test('E5.43 — spintax gives recipients different wording; merge tags stay intact', async () => {
    const s = await launch()
    try {
      const deviceId = await connectDevice(s.win)
      const people = Array.from({ length: 8 }, (_, i) => ({
        Name: `Person${i}`,
        Mobile: `+9198765432${String(i).padStart(2, '0')}`,
      }))
      // Customer data that looks like spintax must be sent exactly as stored.
      people.push({ Name: '{Acme|Zenith} Corp', Mobile: '+919876543299' })

      await runCampaign(
        s.win,
        deviceId,
        {
          name: 'Spun',
          type: 'text',
          content:
            '{Hi|Hello|Hey|Greetings|Hiya} {{Name}}, {our|the} {big|great} {sale|offer} starts {today|now}! \\{literal\\}',
        },
        people,
      )

      await expect
        .poll(() => readSends(s.logPath).length, { timeout: 60_000 })
        .toBe(people.length)

      const bodies = readSends(s.logPath).map((x) => String(x.message.body))
      expect(new Set(bodies).size).toBeGreaterThan(1)

      for (const person of people) {
        const body = bodies.find((b) => b.includes(person.Name))
        expect(body, person.Name).toBeDefined()
        expect(body).not.toContain('{{')
        expect(body).toMatch(/^(Hi|Hello|Hey|Greetings|Hiya) /)
        expect(body).toContain('{literal}')
        // Strip the person's own name and the escaped literal: nothing of the
        // template's spintax may remain.
        const rest = body!.replace(person.Name, '').replace('{literal}', '')
        expect(rest).not.toMatch(/[{}|]/)
      }
      expect(bodies.some((b) => b.includes('{Acme|Zenith} Corp'))).toBe(true)
    } finally {
      await s.cleanup()
    }
  })

  test('E5.44 — every rich template type puts its own kind on the wire', async () => {
    const s = await launch()
    try {
      const deviceId = await connectDevice(s.win)
      const templates = richTemplates(s.files).filter((t) => t.type !== 'poll')
      for (const template of templates) {
        await runCampaign(s.win, deviceId, template, [
          { Name: 'Ravi', Mobile: '+919812345678' },
        ])
      }

      await expect
        .poll(() => readSends(s.logPath).length, { timeout: 60_000 })
        .toBe(templates.length)

      const byKind = new Map(readSends(s.logPath).map((x) => [x.message.kind, x.message]))
      expect(byKind.get('audio')).toMatchObject({ ptt: true })
      expect(String(byKind.get('audio')?.path)).toContain('note.ogg')
      expect(String(byKind.get('sticker')?.path)).toContain('smile.webp')
      expect(byKind.get('location')).toEqual({
        kind: 'location',
        latitude: 19.076,
        longitude: 72.8777,
        name: 'Office',
        address: 'Mumbai',
      })
      expect(byKind.get('contacts')).toEqual({
        kind: 'contacts',
        contacts: [{ name: 'Support Desk', phone: '+919800000001' }],
      })
      expect(byKind.get('event')).toEqual({
        kind: 'event',
        name: 'Launch party',
        description: 'Drinks and demos',
        startAt: '2026-12-01T18:00:00+05:30',
        endAt: '2026-12-01T21:00:00+05:30',
        location: 'Rooftop',
      })
      expect(byKind.get('product')).toEqual({
        kind: 'product',
        productId: 'prod-1',
        title: 'Blue Kettle',
        priceAmount1000: 1499000,
        currency: 'INR',
        body: 'Our best seller, Ravi',
      })
    } finally {
      await s.cleanup()
    }
  })

  test('E5.45 — preview renders one spintax variant and reports unresolved tags', async () => {
    const s = await launch()
    try {
      const previews = await s.win.evaluate(async () => {
        const t = await window.api.invoke('template:create', {
          name: 'Preview me',
          type: 'text',
          content: '{Hi|Hello} {{Name}}{, from {{Company}}|}',
        })
        if (!t.ok) throw new Error('template')
        const out: Array<{ rendered: string; unresolvedTags: string[] }> = []
        for (let i = 0; i < 12; i += 1) {
          const p = await window.api.invoke('template:preview', { id: t.data.id })
          if (p.ok) out.push(p.data)
        }
        return out
      })

      expect(previews).toHaveLength(12)
      for (const p of previews) {
        expect(p.rendered).toMatch(/^(Hi|Hello) /)
        expect(p.rendered).not.toMatch(/[{}|]/)
        // Reported whether or not this variant happened to include the tag.
        expect(p.unresolvedTags.sort()).toEqual(['Company', 'Name'])
      }
    } finally {
      await s.cleanup()
    }
  })

  test('E5.46 — inbox rich sends go out as manual sends, even in quiet hours', async () => {
    const s = await launch({ WA_MOCK_INCOMING: '1' })
    try {
      await connectDevice(s.win)
      const result = await s.win.evaluate(async (files) => {
        let chatId: string | undefined
        for (let i = 0; i < 120 && !chatId; i += 1) {
          const chats = await window.api.invoke('chat:list', { limit: 10 })
          chatId = chats.ok ? chats.data.items[0]?.id : undefined
          if (!chatId) await new Promise((r) => setTimeout(r, 250))
        }
        if (!chatId) throw new Error('no chat')

        // Quiet hours around "now": automated sends would park, a person's do not.
        const now = new Date()
        const hhmm = (d: Date) =>
          `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        await window.api.invoke('settings:setSendingDefaults', {
          quietHoursEnabled: true,
          quietHoursStart: hhmm(new Date(now.getTime() - 60 * 60_000)),
          quietHoursEnd: hhmm(new Date(now.getTime() + 60 * 60_000)),
        })

        const send = (
          message: Parameters<typeof window.api.invoke<'chat:sendRich'>>[1]['message'],
        ) => window.api.invoke('chat:sendRich', { chatId: chatId!, message })
        const sent = [
          await send({
            kind: 'location',
            payload: { latitude: 12.97, longitude: 77.59, name: 'Office' },
          }),
          await send({
            kind: 'poll',
            question: 'Best time to call?',
            payload: { options: ['Morning', 'Evening'], selectableCount: 1 },
          }),
          await send({
            kind: 'contact',
            payload: { contacts: [{ name: 'Sales', phone: '+919800000002' }] },
          }),
          await send({ kind: 'voice', mediaSourcePath: files.voice }),
          await send({ kind: 'sticker', mediaSourcePath: files.sticker }),
        ]
        const rejected = await send({ kind: 'sticker', mediaSourcePath: files.png })
        const history = await window.api.invoke('chat:messages', { chatId, limit: 20 })
        return { chatId, sent, rejected, history }
      }, s.files)

      expect(result.sent.map((r) => r.ok)).toEqual([true, true, true, true, true])
      const bodies = result.sent.map((r) => (r.ok ? r.data.body : null))
      expect(bodies).toEqual([
        '📍 Office',
        '📊 Poll: Best time to call?',
        '👤 Sales',
        '🎤 Voice note',
        '🏷️ Sticker',
      ])
      expect(result.sent.map((r) => (r.ok ? r.data.type : null))).toEqual([
        'location',
        'poll',
        'contact',
        'voice',
        'sticker',
      ])
      expect(result.rejected.ok).toBe(false)
      if (!result.rejected.ok)
        expect(result.rejected.error.code).toBe('VALIDATION_FAILED')

      // Persisted, so the thread shows them after a reload.
      expect(
        result.history.ok && result.history.data.items.length,
      ).toBeGreaterThanOrEqual(6)

      const sends = readSends(s.logPath)
      expect(sends.map((x) => x.message.kind)).toEqual([
        'location',
        'poll',
        'contacts',
        'audio',
        'sticker',
      ])
      expect(sends.every((x) => x.to === result.chatId)).toBe(true)
      expect(sends[1]?.message).toEqual({
        kind: 'poll',
        name: 'Best time to call?',
        options: ['Morning', 'Evening'],
        selectableCount: 1,
      })
      // Files are copied into the managed inbox store before sending.
      expect(String(sends[3]?.message.path)).toContain(join('media', 'inbox'))
      expect(existsSync(String(sends[3]?.message.path))).toBe(true)
    } finally {
      await s.cleanup()
    }
  })

  test('E5.47 — a poll template built in the editor', async () => {
    const s = await launch()
    try {
      await s.win.getByTestId('nav-templates').click()
      await s.win.getByTestId('new-template').click()

      await s.win.getByTestId('tpl-name').fill('Team poll')
      await s.win.getByTestId('tpl-type').selectOption('poll')
      await s.win
        .getByTestId('tpl-content')
        .fill('{Quick|Short} question: which {slot|time}?')
      await expect(s.win.getByTestId('spintax-count')).toHaveText('4 variations')

      // Two empty options are offered; one filled is not a poll.
      await s.win.getByTestId('poll-option-0').fill('Morning')
      await s.win.getByTestId('submit-template').click()
      await expect(s.win.getByTestId('template-error')).toContainText('two options')

      await s.win.getByTestId('poll-option-1').fill('Afternoon')
      await s.win.getByTestId('poll-add-option').click()
      await s.win.getByTestId('poll-option-2').fill('Evening')
      await s.win.getByTestId('poll-multiple').check()
      await s.win.getByTestId('submit-template').click()
      await expect(s.win.getByTestId('create-template-dialog')).toHaveCount(0)

      const card = s.win.getByTestId('template-card').filter({ hasText: 'Team poll' })
      await expect(card).toContainText('Poll')
      await expect(card.getByTestId('rich-summary')).toContainText('Evening')

      const saved = await s.win.evaluate(async () => {
        const list = await window.api.invoke('template:list')
        return list.ok ? list.data.find((t) => t.name === 'Team poll') : undefined
      })
      expect(saved?.type).toBe('poll')
      expect(saved?.extra).toEqual({
        options: ['Morning', 'Afternoon', 'Evening'],
        selectableCount: 0,
      })
    } finally {
      await s.cleanup()
    }
  })

  test('E5.48 — location and event editors validate and save', async () => {
    const s = await launch()
    try {
      await s.win.getByTestId('nav-templates').click()
      await s.win.getByTestId('new-template').click()
      await s.win.getByTestId('tpl-name').fill('Store pin')
      await s.win.getByTestId('tpl-type').selectOption('location')
      // A location carries no text, so there is no content box to fill.
      await expect(s.win.getByTestId('tpl-content')).toHaveCount(0)
      await s.win.getByTestId('rich-lat').fill('95')
      await s.win.getByTestId('rich-lng').fill('72.8')
      await s.win.getByTestId('submit-template').click()
      await expect(s.win.getByTestId('template-error')).toContainText('Latitude')
      await s.win.getByTestId('rich-lat').fill('19.07')
      await s.win.getByTestId('rich-loc-name').fill('Flagship store')
      await s.win.getByTestId('submit-template').click()
      await expect(s.win.getByTestId('create-template-dialog')).toHaveCount(0)

      await s.win.getByTestId('new-template').click()
      await s.win.getByTestId('tpl-name').fill('Open day')
      await s.win.getByTestId('tpl-type').selectOption('event')
      await s.win.getByTestId('tpl-content').fill('Open day')
      await s.win.getByTestId('event-start').fill('2026-12-05T10:00')
      await s.win.getByTestId('event-end').fill('2026-12-05T16:00')
      await s.win.getByTestId('event-location').fill('Main hall')
      await s.win.getByTestId('submit-template').click()
      await expect(s.win.getByTestId('create-template-dialog')).toHaveCount(0)

      const saved = await s.win.evaluate(async () => {
        const list = await window.api.invoke('template:list')
        return list.ok ? list.data : []
      })
      const pin = saved.find((t) => t.name === 'Store pin')
      expect(pin?.extra).toEqual({
        latitude: 19.07,
        longitude: 72.8,
        name: 'Flagship store',
      })
      const event = saved.find((t) => t.name === 'Open day')
      // datetime-local is local time; it is stored with the local offset.
      expect(event?.extra).toMatchObject({ location: 'Main hall' })
      const startAt = (event?.extra as { startAt: string }).startAt
      expect(startAt).toMatch(/^2026-12-05T10:00:00[+-]\d{2}:\d{2}$/)
      expect(new Date(startAt).getTime()).toBe(new Date('2026-12-05T10:00').getTime())
    } finally {
      await s.cleanup()
    }
  })

  test('E5.49 — the product picker degrades gracefully without a catalog', async () => {
    const s = await launch()
    try {
      await connectDevice(s.win)
      await s.win.getByTestId('nav-templates').click()
      await s.win.getByTestId('new-template').click()
      await s.win.getByTestId('tpl-name').fill('Kettle card')
      await s.win.getByTestId('tpl-type').selectOption('product')
      await s.win.getByTestId('tpl-content').fill('Back in stock')
      await s.win.getByTestId('product-device').selectOption({ label: 'Rich Sender' })

      // Either the catalog cannot be read (shown, nothing to pick) or it lists
      // products — never a crash or a silent empty state.
      const error = s.win.getByTestId('product-error')
      const select = s.win.getByTestId('product-select')
      await expect(error.or(select)).toBeVisible()

      if (await error.isVisible()) {
        await s.win.getByTestId('submit-template').click()
        await expect(s.win.getByTestId('template-error')).toContainText(
          'Choose a product',
        )
      } else {
        await expect(select.locator('option[value="prod-1"]')).toHaveCount(1)
        await select.selectOption('prod-1')
        await s.win.getByTestId('submit-template').click()
        await expect(s.win.getByTestId('create-template-dialog')).toHaveCount(0)
      }
    } finally {
      await s.cleanup()
    }
  })

  test('E5.50 — the inbox attach menu sends a poll into the open chat', async () => {
    const s = await launch({ WA_MOCK_INCOMING: '1' })
    try {
      await connectDevice(s.win)
      await s.win.getByTestId('nav-inbox').click()
      await expect(s.win.getByTestId('chat-item').first()).toBeVisible({
        timeout: 30_000,
      })
      await s.win.getByTestId('chat-item').first().click()

      await s.win.getByTestId('rich-attach').click()
      await s.win.getByTestId('rich-option-poll').click()
      await s.win.getByTestId('rich-poll-question').fill('Delivery slot?')
      await s.win.getByTestId('poll-option-0').fill('Today')
      await s.win.getByTestId('poll-option-1').fill('Tomorrow')
      await s.win.getByTestId('rich-send').click()

      await expect(s.win.getByTestId('rich-dialog')).toHaveCount(0)
      await expect(s.win.getByTestId('message-thread')).toContainText(
        '📊 Poll: Delivery slot?',
      )
      await expect.poll(() => readSends(s.logPath).length, { timeout: 15_000 }).toBe(1)
      expect(readSends(s.logPath)[0]?.message).toEqual({
        kind: 'poll',
        name: 'Delivery slot?',
        options: ['Today', 'Tomorrow'],
        selectableCount: 1,
      })

      // A bad sticker is reported in the dialog and nothing is sent.
      await s.win.getByTestId('rich-attach').click()
      await s.win.getByTestId('rich-option-sticker').click()
      await s.win.getByTestId('rich-file-path').fill(s.files.png)
      await s.win.getByTestId('rich-send').click()
      await expect(s.win.getByTestId('rich-error')).toContainText('.webp')
      expect(readSends(s.logPath)).toHaveLength(1)
    } finally {
      await s.cleanup()
    }
  })
})
