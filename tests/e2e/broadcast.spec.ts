/**
 * Status updates and WhatsApp Channels (D89), E5.80–E5.99.
 *
 * A status is marketing traffic from the account, so these specs hold it to
 * the same rules as a campaign: it goes out through the mock transport (and so
 * through the throttle), only to the chosen audience, and never to a number on
 * the opt-out list. Suppression is seeded by writing the database while the
 * app is closed — the opt-out screens belong to another slice.
 */
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { APP_READY_TIMEOUT_MS } from './fixtures/constants'
import { cleanupUserDataDir, newUserDataDir } from './fixtures/licensed-app'

test.describe.configure({ mode: 'serial' })

const LIST_A = ['+919700000001', '+919700000002', '+919700000003']
const LIST_B = ['+919700000011']
/** In list A, then opted out — must never be in a status audience. */
const SUPPRESSED = LIST_A[1]!

let dir: string
let sendLog: string
let app: ElectronApplication
let win: Page
let deviceId: string
let offlineDeviceId: string
let listA: string
let listB: string

interface LoggedSend {
  deviceId: string
  to: string
  message: { kind: string; body: string }
}

function sends(): LoggedSend[] {
  if (!existsSync(sendLog)) return []
  return readFileSync(sendLog, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LoggedSend)
}

function statusPosts(): Array<{
  content: { kind: string; body?: string; backgroundColor?: string; path?: string }
  statusJidList: string[]
}> {
  return sends()
    .filter((s) => s.to === 'status@broadcast')
    .map((s) => JSON.parse(s.message.body))
}

const jid = (phone: string) => `${phone.slice(1)}@s.whatsapp.net`

async function launch(): Promise<void> {
  app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${dir}`],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: undefined,
      LICENSE_SERVICE: 'mock',
      WA_TRANSPORT: 'mock',
      WA_MOCK_SEND_LOG: sendLog,
      RB_TICK_MS: '1000',
      NODE_ENV: 'test',
    } as NodeJS.ProcessEnv,
  })
  win = await app.firstWindow()
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
}

async function invoke<T = unknown>(
  channel: string,
  request?: unknown,
): Promise<
  { ok: true; data: T } | { ok: false; error: { code: string; userMessage: string } }
> {
  return win.evaluate(
    ([c, r]) =>
      (
        window.api.invoke as unknown as (
          channel: string,
          request: unknown,
        ) => Promise<unknown>
      )(c as string, r),
    [channel, request] as const,
  ) as Promise<
    { ok: true; data: T } | { ok: false; error: { code: string; userMessage: string } }
  >
}

async function ok<T>(channel: string, request?: unknown): Promise<T> {
  const result = await invoke<T>(channel, request)
  if (!result.ok) throw new Error(`${channel}: ${result.error.userMessage}`)
  return result.data
}

interface Post {
  id: string
  status: string
  error: string | null
  mediaPath: string | null
  channelId: string | null
}
interface Channel {
  id: string
  role: string
  subscribers: number
  inviteUrl: string | null
}

async function postStatus(id: string): Promise<string | undefined> {
  const posts = await ok<Post[]>('post:list', {})
  return posts.find((p) => p.id === id)?.status
}

/** Prisma's on-disk DateTime format, copied from a row it wrote. */
function prismaNow(db: DatabaseSync): string | number {
  const row = db.prepare('SELECT createdAt FROM Device LIMIT 1').get() as {
    createdAt: string | number
  }
  return typeof row.createdAt === 'number' ? Date.now() : new Date().toISOString()
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  dir = newUserDataDir()
  sendLog = join(dir, 'sends.jsonl')

  await launch()
  try {
    const seeded = await win.evaluate(
      async ([a, b]) => {
        const lists: string[] = []
        for (const [name, phones] of [
          ['Status A', a],
          ['Status B', b],
        ] as const) {
          const list = await window.api.invoke('contactList:create', {
            name,
            customFields: [],
          })
          if (!list.ok) throw new Error('list')
          for (const [i, phone] of phones.entries()) {
            await window.api.invoke('contacts:create', {
              listId: list.data.id,
              data: { Name: `${name} ${i}`, Mobile: phone },
            })
          }
          lists.push(list.data.id)
        }
        const device = await window.api.invoke('device:create', { name: 'Poster' })
        const offline = await window.api.invoke('device:create', { name: 'Offline' })
        if (!device.ok || !offline.ok) throw new Error('device')
        return { lists, device: device.data.id, offline: offline.data.id }
      },
      [LIST_A, LIST_B] as const,
    )
    listA = seeded.lists[0]!
    listB = seeded.lists[1]!
    deviceId = seeded.device
    offlineDeviceId = seeded.offline
  } finally {
    await app.close()
  }

  const db = new DatabaseSync(join(dir, 'rapbooster.db'))
  try {
    db.prepare(
      'INSERT INTO Suppression (phone, reason, source, createdAt) VALUES (?, ?, ?, ?)',
    ).run(SUPPRESSED, 'test', 'manual', prismaNow(db))
  } finally {
    db.close()
  }

  await launch()
  await ok('device:connect', { id: deviceId })
  await expect
    .poll(
      async () =>
        (await ok<Array<{ id: string; status: string }>>('device:list')).find(
          (d) => d.id === deviceId,
        )?.status,
      { timeout: 30_000 },
    )
    .toBe('connected')
})

test.afterAll(async () => {
  await app?.close()
  cleanupUserDataDir(dir)
})

test('E5.80 — a text status reaches the chosen lists and never a suppressed number', async () => {
  const post = await ok<Post>('post:create', {
    deviceId,
    target: 'status',
    kind: 'text',
    body: 'E5.80 status',
    backgroundColor: '#128C7E',
    listIds: [listA],
  })

  await expect.poll(() => postStatus(post.id), { timeout: 30_000 }).toBe('posted')
  const sent = statusPosts().find((s) => s.content.body === 'E5.80 status')
  expect(sent).toBeDefined()
  expect(sent!.content.backgroundColor).toBe('#128C7E')
  expect(sent!.statusJidList.sort()).toEqual([jid(LIST_A[0]!), jid(LIST_A[2]!)].sort())
  expect(sent!.statusJidList).not.toContain(jid(SUPPRESSED))
  expect(sent!.statusJidList).not.toContain(jid(LIST_B[0]!))
})

test('E5.81 — "everyone" covers every contact on file, still without opt-outs', async () => {
  const post = await ok<Post>('post:create', {
    deviceId,
    target: 'status',
    kind: 'text',
    body: 'E5.81 everyone',
  })
  await expect.poll(() => postStatus(post.id), { timeout: 30_000 }).toBe('posted')

  const sent = statusPosts().find((s) => s.content.body === 'E5.81 everyone')
  expect(sent!.statusJidList.sort()).toEqual(
    [LIST_A[0]!, LIST_A[2]!, LIST_B[0]!].map(jid).sort(),
  )
})

test('E5.82 — a scheduled post waits for its time, then posts and pushes events', async () => {
  await win.evaluate(() => {
    const w = window as unknown as { postEvents: Array<{ id: string; status: string }> }
    w.postEvents = []
    window.api.on('post:changed', (p) => w.postEvents.push(p))
  })

  const post = await ok<Post>('post:create', {
    deviceId,
    target: 'status',
    kind: 'text',
    body: 'E5.82 later',
    listIds: [listB],
    scheduledAt: new Date(Date.now() + 3_000).toISOString(),
  })
  expect(post.status).toBe('scheduled')
  expect(statusPosts().some((s) => s.content.body === 'E5.82 later')).toBe(false)

  await expect.poll(() => postStatus(post.id), { timeout: 30_000 }).toBe('posted')
  expect(statusPosts().find((s) => s.content.body === 'E5.82 later')).toBeDefined()

  const events = await win.evaluate(
    () =>
      (window as unknown as { postEvents: Array<{ id: string; status: string }> })
        .postEvents,
  )
  const mine = events.filter((e) => e.id === post.id).map((e) => e.status)
  expect(mine).toContain('posting')
  expect(mine).toContain('posted')
})

test('E5.83 — a created channel is owned, has an invite link, and can be posted to', async () => {
  const channel = await ok<Channel>('channel:create', {
    deviceId,
    name: 'E5 Deals',
    description: 'Weekly offers',
  })
  expect(channel.role).toBe('owner')
  expect(channel.inviteUrl).toMatch(/^https:\/\/whatsapp\.com\/channel\/\S+$/)

  const post = await ok<Post>('post:create', {
    deviceId,
    target: 'channel',
    channelId: channel.id,
    kind: 'text',
    body: 'E5.83 channel post',
  })
  await expect.poll(() => postStatus(post.id), { timeout: 30_000 }).toBe('posted')

  const sent = sends().find((s) => s.to === channel.id)
  expect(sent).toBeDefined()
  expect(JSON.parse(sent!.message.body)).toMatchObject({
    kind: 'text',
    body: 'E5.83 channel post',
  })
})

test('E5.84 — following by link, code or JID stores a subscriber, once', async () => {
  const followed = await ok<Channel>('channel:follow', {
    deviceId,
    invite: 'https://whatsapp.com/channel/0029VaE5Follow',
  })
  expect(followed.role).toBe('subscriber')
  expect(followed.subscribers).toBeGreaterThan(0)
  expect(followed.inviteUrl).toBe('https://whatsapp.com/channel/0029VaE5Follow')

  // Same channel again, by its JID: an upsert, not a second row.
  await ok('channel:follow', { deviceId, invite: followed.id })
  const all = await ok<Channel[]>('channel:list', { deviceId })
  expect(all.filter((c) => c.id === followed.id)).toHaveLength(1)

  // Following our own channel by its link must not demote it.
  const owned = all.find((c) => c.role === 'owner')!
  await ok('channel:follow', { deviceId, invite: owned.inviteUrl })
  const again = await ok<Channel[]>('channel:list', {})
  expect(again.find((c) => c.id === owned.id)?.role).toBe('owner')

  // A subscriber cannot post.
  const refused = await invoke('post:create', {
    deviceId,
    target: 'channel',
    channelId: followed.id,
    kind: 'text',
    body: 'nope',
  })
  expect(refused.ok).toBe(false)
})

test('E5.85 — only a scheduled post can be cancelled', async () => {
  const post = await ok<Post>('post:create', {
    deviceId,
    target: 'status',
    kind: 'text',
    body: 'E5.85 cancel me',
    scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
  })
  await ok('post:cancel', { id: post.id })
  expect(await postStatus(post.id)).toBe('cancelled')

  const twice = await invoke('post:cancel', { id: post.id })
  expect(twice.ok).toBe(false)
  if (!twice.ok) expect(twice.error.code).toBe('CONFLICT')

  const cancelled = await ok<Post[]>('post:list', { status: 'cancelled' })
  expect(cancelled.map((p) => p.id)).toContain(post.id)
})

test('E5.86 — invalid posts and invites are refused with a readable reason', async () => {
  const cases: Array<[string, unknown]> = [
    ['post:create', { deviceId, target: 'status', kind: 'text', body: '   ' }],
    ['post:create', { deviceId, target: 'status', kind: 'image', body: 'x' }],
    [
      'post:create',
      {
        deviceId,
        target: 'status',
        kind: 'image',
        mediaSourcePath: join(dir, 'sends.jsonl'),
      },
    ],
    ['post:create', { deviceId, target: 'channel', kind: 'text', body: 'no channel' }],
    ['channel:follow', { deviceId, invite: 'https://example.com/not a channel' }],
  ]
  for (const [channel, request] of cases) {
    const result = await invoke(channel, request)
    expect(result.ok, `${channel} ${JSON.stringify(request)}`).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED')
      expect(result.error.userMessage.length).toBeGreaterThan(0)
    }
  }
})

test('E5.87 — an image status is copied into the media store and posted from there', async () => {
  const source = join(dir, 'promo.png')
  writeFileSync(source, Buffer.from('89504e470d0a1a0a', 'hex'))

  const post = await ok<Post>('post:create', {
    deviceId,
    target: 'status',
    kind: 'image',
    body: 'E5.87 caption',
    mediaSourcePath: source,
    listIds: [listB],
  })
  expect(post.mediaPath).toContain(join('media', 'posts', post.id))
  expect(existsSync(post.mediaPath!)).toBe(true)

  await expect.poll(() => postStatus(post.id), { timeout: 30_000 }).toBe('posted')
  const sent = statusPosts().find((s) => s.content.path === post.mediaPath)
  expect(sent?.content).toMatchObject({ kind: 'media', mediaType: 'image' })
})

test('E5.88 — a post for a disconnected device waits instead of failing', async () => {
  const post = await ok<Post>('post:create', {
    deviceId: offlineDeviceId,
    target: 'status',
    kind: 'text',
    body: 'E5.88 offline',
  })
  await expect
    .poll(
      async () =>
        (await ok<Post[]>('post:list', {})).find((p) => p.id === post.id)?.error ?? '',
      { timeout: 15_000 },
    )
    .toContain('connect')
  expect(await postStatus(post.id)).toBe('scheduled')

  // The waiting post is the oldest due row; it must not hold up other devices.
  const other = await ok<Post>('post:create', {
    deviceId,
    target: 'status',
    kind: 'text',
    body: 'E5.88 not starved',
    listIds: [listB],
    scheduledAt: new Date(Date.now() + 1_500).toISOString(),
  })
  await expect.poll(() => postStatus(other.id), { timeout: 30_000 }).toBe('posted')
  expect(await postStatus(post.id)).toBe('scheduled')

  await ok('post:cancel', { id: post.id })
})

test('E5.89 — removing a channel forgets it locally only', async () => {
  const channel = await ok<Channel>('channel:create', {
    deviceId,
    name: 'E5 Temporary',
  })
  await ok('channel:delete', { id: channel.id })
  const all = await ok<Channel[]>('channel:list', {})
  expect(all.some((c) => c.id === channel.id)).toBe(false)
})

test('E5.90 — posting a text status from the page', async () => {
  await win.getByTestId('nav-broadcast').click()
  await expect(win.getByTestId('page-title')).toHaveText('Status & Channels')

  await win.getByTestId('post-device').selectOption(deviceId)
  const body = win.getByTestId('post-body')
  await body.fill('E5.90 from the UI')
  await expect(body).toHaveValue('E5.90 from the UI')
  await win.getByTestId('post-bg-7E57C2').click()
  await win.getByTestId('post-submit').click()

  const row = win.getByTestId('post-row').filter({ hasText: 'E5.90 from the UI' })
  await expect(row.getByTestId('post-status')).toHaveText('Posted', { timeout: 30_000 })
  const sent = statusPosts().find((s) => s.content.body === 'E5.90 from the UI')
  expect(sent?.content.backgroundColor).toBe('#7E57C2')
})

test('E5.91 — creating a channel and following one from the Channels tab', async () => {
  await win.getByTestId('nav-broadcast').click()
  await win.getByTestId('tab-channels').click()

  await win.getByTestId('channel-create-open').click()
  await win.getByTestId('channel-device').selectOption(deviceId)
  await win.getByTestId('channel-name').fill('E5.91 UI channel')
  await expect(win.getByTestId('channel-name')).toHaveValue('E5.91 UI channel')
  await win.getByTestId('channel-create-submit').click()

  const row = win.getByTestId('channel-row').filter({ hasText: 'E5.91 UI channel' })
  await expect(row).toBeVisible()
  await expect(row.getByTestId('channel-invite-url')).toContainText(
    'https://whatsapp.com/channel/',
  )

  await win.getByTestId('channel-follow-open').click()
  await win.getByTestId('channel-device').selectOption(deviceId)
  await win.getByTestId('channel-invite').fill('https://whatsapp.com/channel/E591Follow')
  await win.getByTestId('channel-follow-submit').click()
  await expect(
    win.getByTestId('channel-row').filter({ hasText: 'Channel E591Follow' }),
  ).toBeVisible()

  // Post to the new channel from the channel composer.
  const channelId = await row.getAttribute('data-channel-id')
  await win.getByTestId('post-channel').selectOption(channelId!)
  await win.getByTestId('post-body').fill('E5.91 channel from UI')
  await expect(win.getByTestId('post-body')).toHaveValue('E5.91 channel from UI')
  await win.getByTestId('post-submit').click()
  await expect(
    win
      .getByTestId('post-row')
      .filter({ hasText: 'E5.91 channel from UI' })
      .getByTestId('post-status'),
  ).toHaveText('Posted', { timeout: 30_000 })
  expect(sends().some((s) => s.to === channelId)).toBe(true)
})
