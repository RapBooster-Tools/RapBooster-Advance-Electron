/**
 * Desktop integration (Wave 3, E8.60–E8.79): preferences, notifications,
 * background running, the tray and the `app:navigate` deep link.
 *
 * Notifications are observed through the RB_NOTIFY_LOG seam (NODE_ENV=test):
 * each one is appended as `{title, chatId}` — never the body — instead of
 * reaching an OS notification server, which a headless run does not have.
 * Window focus is unreliable under xvfb, so "the user is not looking" is made
 * deterministic by hiding the window.
 */
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { APP_READY_TIMEOUT_MS } from './fixtures/constants'
import { cleanupUserDataDir, newUserDataDir } from './fixtures/licensed-app'

type Prefs = {
  notifications: boolean
  runInBackground: boolean
  startAtLogin: boolean
  onboardingCompleted: boolean
  toursSeen: string[]
}
type Logged = { title: string; chatId?: string }

/** The seam only exists in main under NODE_ENV=test; see services/desktop.ts. */
type Seam = { clickLastNotification: () => void; trayMenuLabels: () => string[] }

interface Launched {
  app: ElectronApplication
  win: Page
}

async function launch(
  dir: string,
  logDir: string,
  extraArgs: string[] = [],
): Promise<Launched> {
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${dir}`, ...extraArgs],
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: undefined,
      LICENSE_SERVICE: 'mock',
      WA_TRANSPORT: 'mock',
      WA_MOCK_INJECT: join(logDir, 'inject.jsonl'),
      RB_NOTIFY_LOG: join(logDir, 'notify.jsonl'),
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

async function call<T = unknown>(
  win: Page,
  channel: string,
  request?: unknown,
): Promise<T> {
  const result = (await win.evaluate(
    async ([c, r]) => window.api.invoke(c as never, r as never),
    [channel, request] as const,
  )) as { ok: true; data: T } | { ok: false; error: { code: string } }
  if (!result.ok) throw new Error(`${channel}: ${result.error.code}`)
  return result.data
}

function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as T)
}

function windowState(app: ElectronApplication) {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => ({ visible: w.isVisible() })),
  )
}

const hideWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.hide())

const closeWindow = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())

test.describe('notifications, tray and background running', () => {
  test.describe.configure({ mode: 'serial' })

  let dir: string
  let logDir: string
  let app: ElectronApplication
  let win: Page

  const notifyLog = () => readJsonl<Logged>(join(logDir, 'notify.jsonl'))
  const forPhone = (phone: string) =>
    notifyLog().filter((n) => n.chatId?.includes(phone.replace(/^\+/, '')))

  function inject(from: string, body: string): void {
    appendFileSync(
      join(logDir, 'inject.jsonl'),
      `${JSON.stringify({ type: 'message', deviceId: '*', from, body })}\n`,
    )
  }

  /** Messages stored for a sender — proof the inbound path ran to completion. */
  function stored(phone: string): number {
    const db = new DatabaseSync(join(dir, 'rapbooster.db'), { readOnly: true })
    try {
      const row = db
        .prepare(`SELECT COUNT(*) AS n FROM Message WHERE chatId LIKE ?`)
        .get(`%${phone.replace(/^\+/, '')}%`) as { n: number }
      return Number(row.n)
    } finally {
      db.close()
    }
  }

  const clickLastNotification = () =>
    app.evaluate(() =>
      (
        globalThis as unknown as { __rbDesktop: Seam }
      ).__rbDesktop.clickLastNotification(),
    )
  const trayLabels = () =>
    app.evaluate(() =>
      (globalThis as unknown as { __rbDesktop: Seam }).__rbDesktop.trayMenuLabels(),
    )

  test.beforeAll(async () => {
    dir = newUserDataDir()
    logDir = mkdtempSync(join(tmpdir(), 'rapbooster-desktop-'))
    ;({ app, win } = await launch(dir, logDir))
    const device = await call<{ id: string }>(win, 'device:create', { name: 'Desk' })
    await call(win, 'device:connect', { id: device.id })
    await expect
      .poll(
        async () =>
          (await call<{ id: string; status: string }[]>(win, 'device:list')).find(
            (d) => d.id === device.id,
          )?.status,
        { timeout: 30_000 },
      )
      .toBe('connected')
  })

  test.afterAll(async () => {
    await app?.close()
    cleanupUserDataDir(dir)
    rmSync(logDir, { recursive: true, force: true })
  })

  test('E8.60 — preferences start from the documented defaults', async () => {
    // Onboarding and tours read as done here: under E2E, without
    // RB_ONBOARDING=1, the onboarding seam in prefs.ts reports them that way so
    // the welcome and tour prompts stay out of specs that predate them. E9.x
    // covers the real defaults with the seam switched on.
    expect(await call<Prefs>(win, 'app:getPrefs')).toEqual({
      notifications: true,
      runInBackground: true,
      startAtLogin: false,
      onboardingCompleted: true,
      toursSeen: ['*'],
    })
  })

  test('E8.61 — a message arriving while the window is hidden notifies, without its content', async () => {
    await hideWindow(app)
    inject('+919800000061', 'SECRET-BODY-E861 please call me')
    await expect.poll(() => forPhone('+919800000061').length, { timeout: 15_000 }).toBe(1)

    const [note] = forPhone('+919800000061')
    expect(note?.title).toBe('Mock Contact')
    // The seam never carries the body, and no log file may either.
    expect(readFileSync(join(logDir, 'notify.jsonl'), 'utf8')).not.toContain(
      'SECRET-BODY',
    )
    const mainLog = join(dir, 'logs', 'main.log')
    expect(existsSync(mainLog)).toBe(true)
    expect(readFileSync(mainLog, 'utf8')).not.toContain('SECRET-BODY-E861')
  })

  test('E8.62 — clicking a notification shows the window and asks for that chat', async () => {
    // Record what main tells the renderer, independently of who acts on it
    // (following the route is the navigate listener's job — E8.70).
    await win.evaluate(() => {
      const seen: unknown[] = []
      Object.assign(window, { __navigations: seen })
      window.api.on('app:navigate', (p) => seen.push(p))
    })
    await clickLastNotification()
    await expect.poll(async () => (await windowState(app))[0]?.visible).toBe(true)
    await expect
      .poll(() =>
        win.evaluate(
          () =>
            (window as unknown as { __navigations: { route: string; chatId?: string }[] })
              .__navigations,
        ),
      )
      .toEqual([{ route: '/inbox', chatId: expect.stringContaining('919800000061') }])
  })

  test('E8.63 — one chat notifies at most once per 10 seconds', async () => {
    await hideWindow(app)
    const before = stored('+919800000061')
    inject('+919800000061', 'second')
    inject('+919800000061', 'third')
    await expect.poll(() => stored('+919800000061'), { timeout: 15_000 }).toBe(before + 2)
    await win.waitForTimeout(500)
    expect(forPhone('+919800000061')).toHaveLength(1)
  })

  test('E8.64 — no notification when notifications are switched off', async () => {
    await call(win, 'app:setPrefs', { notifications: false })
    inject('+919800000064', 'quiet please')
    await expect.poll(() => stored('+919800000064'), { timeout: 15_000 }).toBe(1)
    await win.waitForTimeout(500)
    expect(forPhone('+919800000064')).toHaveLength(0)
    await call(win, 'app:setPrefs', { notifications: true })
  })

  test('E8.65 — no notification while the window is in front', async () => {
    const focused = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]
      w?.show()
      w?.focus()
      return w?.isFocused() ?? false
    })
    // Without a window manager focus can be refused; the check is then moot.
    test.skip(!focused, 'the display server did not give the window focus')
    inject('+919800000065', 'while looking')
    await expect.poll(() => stored('+919800000065'), { timeout: 15_000 }).toBe(1)
    await win.waitForTimeout(500)
    expect(forPhone('+919800000065')).toHaveLength(0)
  })

  test('E8.66 — a burst from many chats collapses into one summary', async () => {
    await hideWindow(app)
    // Let every earlier arrival age out of the 10-second burst window.
    await win.waitForTimeout(10_500)
    const before = notifyLog().length
    const phones = ['+919800000101', '+919800000102', '+919800000103', '+919800000104']
    for (const p of phones) inject(p, 'burst')
    await expect
      .poll(() => phones.reduce((n, p) => n + stored(p), 0), { timeout: 15_000 })
      .toBe(4)
    await win.waitForTimeout(500)

    const fresh = notifyLog().slice(before)
    const individual = fresh.filter((n) => n.chatId !== undefined)
    const summaries = fresh.filter((n) => /new messages?$/.test(n.title))
    expect(individual).toHaveLength(3)
    expect(summaries.map((s) => s.title)).toEqual(['4 new messages'])
  })

  test('E8.67 — closing the window hides it to the tray and the app keeps running', async () => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show())
    await closeWindow(app)
    await expect.poll(async () => (await windowState(app))[0]?.visible).toBe(false)
    expect(await windowState(app)).toHaveLength(1)
    // Still alive: main answers and the renderer still serves IPC.
    expect(await app.evaluate(({ app: a }) => a.isReady())).toBe(true)
    expect((await call<Prefs>(win, 'app:getPrefs')).runInBackground).toBe(true)
    // The first hide explains itself, once.
    await expect
      .poll(() => notifyLog().filter((n) => n.title === 'RapBooster Advance').length)
      .toBe(1)

    // The Dock / tray path brings the same window back.
    await app.evaluate(({ app: a }) => a.emit('activate'))
    await expect.poll(async () => (await windowState(app))[0]?.visible).toBe(true)

    await closeWindow(app)
    await expect.poll(async () => (await windowState(app))[0]?.visible).toBe(false)
    await win.waitForTimeout(500)
    expect(notifyLog().filter((n) => n.title === 'RapBooster Advance')).toHaveLength(1)
    await app.evaluate(({ app: a }) => a.emit('second-instance'))
    await expect.poll(async () => (await windowState(app))[0]?.visible).toBe(true)
  })

  test('E8.68 — the tray menu shows live device and campaign counts', async () => {
    await expect
      .poll(trayLabels, { timeout: 10_000 })
      .toContain('1 device connected · 0 campaigns running')
    const labels = await trayLabels()
    expect(labels).toEqual(
      expect.arrayContaining([
        'Open RapBooster',
        'Pause all campaigns',
        'Quit RapBooster',
      ]),
    )
  })

  test('E8.69 — the Settings Desktop section saves each switch', async () => {
    await win.getByTestId('nav-settings').click()
    const section = win.getByTestId('desktop-prefs')
    await expect(section).toBeVisible()
    await expect(win.getByTestId('pref-notifications')).toBeChecked()
    await expect(win.getByTestId('pref-runInBackground')).toBeChecked()

    await win.getByTestId('pref-notifications').click()
    await expect(win.getByTestId('pref-notifications')).not.toBeChecked()
    await expect
      .poll(async () => (await call<Prefs>(win, 'app:getPrefs')).notifications)
      .toBe(false)

    // Start at login is a Windows/macOS feature; elsewhere the switch says so.
    if (process.platform === 'linux') {
      await expect(win.getByTestId('pref-startAtLogin')).toBeDisabled()
      await expect(section).toContainText('Not available on this operating system')
    }

    await win.getByTestId('pref-notifications').click()
    await expect(win.getByTestId('pref-notifications')).toBeChecked()
    await expect
      .poll(async () => (await call<Prefs>(win, 'app:getPrefs')).notifications)
      .toBe(true)
  })

  // Last in this block on purpose: it needs NavigateListener mounted in the
  // (app) layout, and a serial block stops at its first failure.
  test('E8.70 — app:navigate from main opens the named screen', async () => {
    const send = (payload: { route: string; chatId?: string }) =>
      app.evaluate(({ BrowserWindow }, p) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('app:navigate', p)
      }, payload)

    await send({ route: '/campaigns' })
    await expect(win).toHaveURL(/\/campaigns\/?$/, { timeout: 10_000 })
    await send({ route: '/inbox', chatId: 'chat-e870' })
    await expect(win).toHaveURL(/\/inbox\/?\?chat=chat-e870$/, { timeout: 10_000 })
  })
})

test.describe('persistence, quitting and starting hidden', () => {
  test.describe.configure({ mode: 'serial' })

  let dir: string
  let logDir: string

  test.beforeAll(() => {
    dir = newUserDataDir()
    logDir = mkdtempSync(join(tmpdir(), 'rapbooster-desktop-'))
  })

  test.afterAll(() => {
    cleanupUserDataDir(dir)
    rmSync(logDir, { recursive: true, force: true })
  })

  test('E8.71 — preferences survive a restart', async () => {
    const first = await launch(dir, logDir)
    try {
      await call(first.win, 'app:setPrefs', {
        notifications: false,
        runInBackground: false,
        onboardingCompleted: true,
        toursSeen: ['inbox', 'campaigns'],
      })
    } finally {
      await first.app.close()
    }

    const second = await launch(dir, logDir)
    try {
      expect(await call<Prefs>(second.win, 'app:getPrefs')).toEqual({
        notifications: false,
        runInBackground: false,
        startAtLogin: false,
        onboardingCompleted: true,
        toursSeen: ['inbox', 'campaigns'],
      })
    } finally {
      await second.app.close()
    }
  })

  test('E8.72 — with background running off, closing the window quits (Windows/Linux)', async () => {
    test.skip(process.platform === 'darwin', 'macOS never quits on window close')
    const { app } = await launch(dir, logDir)
    const exited = new Promise<void>((resolve) => app.once('close', () => resolve()))
    await closeWindow(app).catch(() => {
      // The process may exit before evaluate's reply arrives — that is the point.
    })
    await expect(
      Promise.race([
        exited.then(() => 'quit'),
        new Promise((resolve) => setTimeout(() => resolve('still running'), 15_000)),
      ]),
    ).resolves.toBe('quit')
  })

  test('E8.73 — a --hidden launch starts in the tray and a second launch shows it', async () => {
    const { app, win } = await launch(dir, logDir, ['--hidden'])
    try {
      // The page loaded (above) but the window was never shown.
      await win.waitForTimeout(1000)
      expect(await windowState(app)).toEqual([{ visible: false }])
      await app.evaluate(({ app: a }) => a.emit('second-instance'))
      await expect.poll(async () => (await windowState(app))[0]?.visible).toBe(true)
    } finally {
      await app.close()
    }
  })
})
