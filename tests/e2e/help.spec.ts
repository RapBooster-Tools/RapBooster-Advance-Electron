/**
 * E9 — the help system: F1 drawer, InfoTips, guided tours, first-run welcome,
 * getting-started checklist, Help Center and the generated user guide.
 *
 * Two apps: the first runs as every other spec does (NODE_ENV=test, no
 * RB_ONBOARDING), which must show no welcome and offer no tours; the second
 * opts in with RB_ONBOARDING=1 to exercise the first-run experience.
 */
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { FIELD_HELP, GLOSSARY, TOURS, resolveHelpAnchor } from '../../renderer/help'
import { APP_READY_TIMEOUT_MS } from './fixtures/constants'
import {
  activateWith,
  cleanupUserDataDir,
  launchLicensed,
  newUserDataDir,
} from './fixtures/licensed-app'

test.describe.configure({ mode: 'serial' })

const drawer = (win: Page) => win.getByTestId('help-drawer')
const topicShown = (win: Page) => drawer(win).getByTestId('help-topic')

async function call<T>(win: Page, channel: string, request?: unknown): Promise<T> {
  const result = await win.evaluate(
    ([c, r]) => window.api.invoke(c as never, r as never),
    [channel, request] as const,
  )
  if (!result.ok) throw new Error(`${channel}: ${result.error.userMessage}`)
  return result.data as T
}

/** Every renderer source file, for the static content checks. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === 'node_modules' || name === '.next' || name === 'out') return []
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

test.describe('help without onboarding (the default under E2E)', () => {
  let dir: string
  let app: ElectronApplication
  let win: Page

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    dir = newUserDataDir()
    ;({ app, win } = await launchLicensed(dir))
  })

  test.afterAll(async () => {
    await app?.close()
    cleanupUserDataDir(dir)
  })

  test('E9.1 — under test without RB_ONBOARDING there is no welcome, tour offer or checklist', async () => {
    await expect(win.getByTestId('renderer-ready')).toBeAttached()
    await win.getByTestId('nav-devices').click()
    await expect(win.getByTestId('page-title')).toHaveText('WhatsApp Devices')
    await win.getByTestId('nav-dashboard').click()
    await expect(win.getByTestId('dashboard-stats')).toBeVisible()
    await expect(win.getByTestId('welcome-dialog')).toHaveCount(0)
    await expect(win.getByTestId('tour-offer')).toHaveCount(0)
    await expect(win.getByTestId('getting-started')).toHaveCount(0)
    const prefs = await call<{ onboardingCompleted: boolean; toursSeen: string[] }>(
      win,
      'app:getPrefs',
    )
    expect(prefs.onboardingCompleted).toBe(true)
    expect(prefs.toursSeen).toEqual(['*'])
  })

  test('E9.2 — the title-bar "?" opens help for the current screen; Escape closes it', async () => {
    const button = win.getByTestId('help-button')
    await button.click()
    await expect(drawer(win)).toBeVisible()
    await expect(topicShown(win)).toHaveAttribute('data-topic', 'dashboard')
    await expect(drawer(win).getByTestId('help-topic-title')).toHaveText('Dashboard')
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(win.getByTestId('help-search')).toBeFocused()

    await win.keyboard.press('Escape')
    await expect(drawer(win)).toHaveCount(0)
    // Focus goes back to where the user was.
    await expect(button).toBeFocused()
  })

  test('E9.3 — F1 opens the right topic on each screen and closes it again', async () => {
    const screens: Array<[string, string]> = [
      ['nav-devices', 'devices'],
      ['nav-campaigns', 'campaigns'],
      ['nav-inbox', 'inbox'],
      ['nav-chatbot', 'chatbot'],
      ['nav-settings', 'settings'],
    ]
    for (const [nav, topic] of screens) {
      await win.getByTestId(nav).click()
      await expect(win.getByTestId(nav)).toHaveAttribute('aria-current', 'page')
      await win.keyboard.press('F1')
      await expect(topicShown(win)).toHaveAttribute('data-topic', topic)
      await win.keyboard.press('F1')
      await expect(drawer(win)).toHaveCount(0)
    }
  })

  test('E9.4 — F1 inside a panel opens help on that panel', async () => {
    await win.getByTestId('nav-settings').click()
    const cap = win.getByTestId('sd-dailyCapPerDevice')
    await cap.focus()
    await win.keyboard.press('F1')
    await expect(topicShown(win)).toHaveAttribute('data-topic', 'settings-sending')
    await expect(drawer(win).getByTestId('help-back')).toBeVisible()
    await win.keyboard.press('Escape')
    // F1 never takes the field's value or focus away for good.
    await expect(cap).toBeFocused()
  })

  test('E9.5 — the "?" beside a screen title opens that screen\'s help', async () => {
    await win.getByTestId('nav-templates').click()
    await win.getByTestId('page-help').click()
    await expect(topicShown(win)).toHaveAttribute('data-topic', 'templates')
    await expect(drawer(win).getByTestId('help-take-tour')).toBeVisible()
    await win.getByTestId('help-close').click()
  })

  test('E9.6 — help search finds a task across screens and opens it highlighted', async () => {
    await win.keyboard.press('F1')
    await win.getByTestId('help-search').fill('pairing code')
    const results = drawer(win).getByTestId('help-result')
    await expect(results.first()).toBeVisible()
    await drawer(win)
      .locator('[data-testid="help-result"][data-key="task:devices-link-code"]')
      .click()
    await expect(topicShown(win)).toHaveAttribute('data-topic', 'devices')
    await expect(
      drawer(win).locator('[data-testid="help-task"][data-focused="true"]'),
    ).toContainText('Link with a pairing code instead')

    await win.getByTestId('help-search').fill('zzqqxx')
    await expect(drawer(win).getByTestId('help-result-empty')).toBeVisible()
    await win.getByTestId('help-close').click()
  })

  test('E9.7 — an InfoTip beside a setting shows its explanation', async () => {
    await win.getByTestId('nav-settings').click()
    await win.getByTestId('info-daily-cap').hover()
    await expect(win.getByRole('tooltip')).toHaveText(FIELD_HELP['daily-cap'].text)
    await win.mouse.move(0, 0)

    await win.getByTestId('nav-campaigns').click()
    await win.getByTestId('new-campaign').click()
    await win.getByTestId('info-pacing-sleep').first().focus()
    await expect(win.getByRole('tooltip')).toHaveText(FIELD_HELP['pacing-sleep'].text)
    // Escape on an open tooltip dismisses only the tooltip, never the dialog.
    await win.keyboard.press('Escape')
    await expect(win.getByRole('tooltip')).toHaveCount(0)
    await expect(win.getByTestId('cmp-name')).toBeVisible()
    // F1 over an open dialog: help opens above it, and Escape closes only help.
    await win.getByTestId('cmp-name').focus()
    await win.keyboard.press('F1')
    await expect(topicShown(win)).toHaveAttribute('data-topic', 'campaigns')
    await win.keyboard.press('Escape')
    await expect(drawer(win)).toHaveCount(0)
    await expect(win.getByTestId('create-campaign-dialog')).toBeVisible()
    await expect(win.getByTestId('cmp-name')).toBeFocused()
    await win.getByRole('button', { name: 'Close dialog' }).click()
    await expect(win.getByTestId('create-campaign-dialog')).toHaveCount(0)
  })

  test('E9.8 — a guided tour runs from start to finish', async () => {
    await win.getByTestId('nav-dashboard').click()
    await expect(win.getByTestId('dashboard-stats')).toBeVisible()
    await win.keyboard.press('F1')
    await win.getByTestId('help-take-tour').click()
    await expect(drawer(win)).toHaveCount(0)

    const popover = win.getByTestId('tour-popover')
    await expect(popover).toBeVisible()
    await expect(win.getByTestId('tour-title')).toHaveText('Your business at a glance')
    await expect(win.getByTestId('tour-progress')).toHaveText(/^Step 1 of \d+$/)
    await expect(win.getByTestId('tour-back')).toBeDisabled()

    const total = Number(
      (await win.getByTestId('tour-progress').textContent())?.match(/of (\d+)/)?.[1],
    )
    for (let step = 2; step <= total; step += 1) {
      await win.getByTestId('tour-next').click()
      await expect(win.getByTestId('tour-progress')).toHaveText(
        `Step ${step} of ${total}`,
      )
    }
    // The last step points at the help button in the title bar.
    await expect(win.getByTestId('tour-title')).toHaveText('Help is always here')
    await expect(win.getByTestId('tour-next')).toHaveText('Finish')
    await win.getByTestId('tour-next').click()
    await expect(win.getByTestId('tour')).toHaveCount(0)
  })

  test('E9.9 — tours use the keyboard, skip missing targets and can be skipped', async () => {
    await win.getByTestId('nav-devices').click()
    await expect(win.getByTestId('page-title')).toHaveText('WhatsApp Devices')
    await win.keyboard.press('F1')
    await expect(topicShown(win)).toHaveAttribute('data-topic', 'devices')
    await win.getByTestId('help-take-tour').click()
    // No device is linked, so only the "+ Add Device" step can be shown.
    await expect(win.getByTestId('tour-title')).toHaveText('Link a WhatsApp number')
    await expect(win.getByTestId('tour-progress')).toHaveText('Step 1 of 1')
    await expect(win.getByTestId('tour-next')).toBeFocused()
    await win.keyboard.press('Escape')
    await expect(win.getByTestId('tour')).toHaveCount(0)

    await win.getByTestId('nav-dashboard').click()
    await expect(win.getByTestId('dashboard-stats')).toBeVisible()
    await win.keyboard.press('F1')
    await win.getByTestId('help-take-tour').click()
    await expect(win.getByTestId('tour-progress')).toHaveText(/^Step 1 of/)
    await win.keyboard.press('ArrowRight')
    await expect(win.getByTestId('tour-progress')).toHaveText(/^Step 2 of/)
    await win.keyboard.press('ArrowLeft')
    await expect(win.getByTestId('tour-progress')).toHaveText(/^Step 1 of/)
    await win.getByTestId('tour-skip').click()
    await expect(win.getByTestId('tour')).toHaveCount(0)
  })

  test('E9.10 — Help Center lists every topic, searches, and has a glossary', async () => {
    await win.getByTestId('nav-help').click()
    await expect(win.getByTestId('page-title')).toHaveText('Help Center')
    await expect(win.getByTestId('nav-help')).toHaveAttribute('aria-current', 'page')
    await expect(win.getByTestId('nav-group-setup')).toContainText('Help Center')

    for (const id of ['dashboard', 'devices', 'contacts', 'settings-sending', 'help']) {
      await expect(win.getByTestId(`help-topic-${id}`)).toBeVisible()
    }
    await win.getByTestId('help-topic-contacts').click()
    await expect(win.getByTestId('help-topic')).toHaveAttribute('data-topic', 'contacts')

    await win.getByTestId('help-center-search').fill('quiet hours')
    await expect(win.getByTestId('help-center-result').first()).toBeVisible()
    await win
      .locator('[data-testid="help-center-result"][data-key="glossary:Quiet hours"]')
      .click()
    await expect(win.getByTestId('help-entry')).toContainText('21:00')

    await win.getByTestId('help-tab-glossary').click()
    await expect(win.getByTestId('help-glossary')).toContainText('Spintax')
    await expect(win.getByTestId('help-glossary-term')).toHaveCount(GLOSSARY.length)
    await win.getByTestId('help-tab-troubleshooting').click()
    const problem = win.getByTestId('help-problem-qr-expired')
    await problem.locator('summary').click()
    await expect(problem).toContainText('Pairing code')
    await win.getByTestId('help-tab-shortcuts').click()
    await expect(win.getByTestId('help-shortcuts')).toContainText('F1')
    await expect(win.getByTestId('help-support')).toContainText('Export diagnostics')
  })

  test('E9.11 — Help Center restarts a tour on its own screen', async () => {
    await win.getByTestId('help-tour-campaigns').click()
    await expect(win.getByTestId('page-title')).toHaveText('WhatsApp Bulk Campaigns')
    await expect(win.getByTestId('tour-title')).toHaveText('Create a campaign')
    await win.getByTestId('tour-skip').click()
    await expect(win.getByTestId('tour')).toHaveCount(0)
  })

  test('E9.12 — Help Center brings the getting-started checklist back', async () => {
    await win.getByTestId('nav-help').click()
    await win.getByTestId('help-show-checklist').click()
    await expect(win.getByTestId('page-title')).toHaveText('Dashboard')
    await expect(win.getByTestId('getting-started')).toBeVisible()
    await expect(win.getByTestId('checklist-device')).toHaveAttribute(
      'data-done',
      'false',
    )
    await win.getByTestId('checklist-hide').click()
    await expect(win.getByTestId('getting-started')).toHaveCount(0)
  })

  test('E9.13 — help is readable in dark mode', async () => {
    await win.getByTestId('theme-dark').click()
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'dark')
    await win.keyboard.press('F1')
    const panel = drawer(win)
    await expect(panel).toBeVisible()
    expect(await panel.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgb(26, 37, 44)',
    )
    expect(
      await panel
        .getByTestId('help-topic-title')
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe('rgb(233, 237, 239)')
    await win.keyboard.press('Escape')
    await win.getByTestId('theme-system').click()
  })
})

test.describe('help content and the user guide', () => {
  test('E9.14 — docs/USER-GUIDE.md is up to date with the help content', () => {
    const out = execFileSync(
      process.execPath,
      ['scripts/build-user-guide.mjs', '--check'],
      {
        encoding: 'utf8',
      },
    )
    expect(out).toContain('user guide OK')
  })

  test('E9.15 — every tour target and data-help id exists in the screens', () => {
    const source = sourceFiles(join(process.cwd(), 'renderer'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
    const tourTargets = new Set(
      [...source.matchAll(/(?:data-tour|\btour)=["{']+([a-z0-9-]+)["}']/g)].map(
        (m) => m[1],
      ),
    )
    for (const tour of TOURS) {
      for (const step of tour.steps) {
        expect(tourTargets, `${tour.id} → ${step.target}`).toContain(step.target)
      }
    }
    const helpIds = [...source.matchAll(/(?:data-help|\bhelp)="([a-z0-9-]+)"/g)].map(
      (m) => m[1]!,
    )
    expect(helpIds.length).toBeGreaterThan(10)
    for (const id of helpIds) {
      expect(resolveHelpAnchor(id), `data-help="${id}"`).toBeDefined()
    }
  })
})

test.describe('first run with RB_ONBOARDING=1', () => {
  let dir: string
  let app: ElectronApplication
  let win: Page

  async function launch(): Promise<void> {
    app = await electron.launch({
      args: ['out/main/index.js', `--user-data-dir=${dir}`],
      env: {
        ...process.env,
        ELECTRON_RENDERER_URL: undefined,
        LICENSE_SERVICE: 'mock',
        WA_TRANSPORT: 'mock',
        NODE_ENV: 'test',
        RB_ONBOARDING: '1',
      } as NodeJS.ProcessEnv,
    })
    win = await app.firstWindow()
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
  }

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    dir = newUserDataDir()
    await launch()
  })

  test.afterAll(async () => {
    await app?.close()
    cleanupUserDataDir(dir)
  })

  test('E9.16 — a fresh install is welcomed with the safety limits that are really on', async () => {
    const welcome = win.getByTestId('welcome-dialog')
    await expect(welcome).toBeVisible()
    await expect(welcome).toContainText('Welcome to RapBooster Advance')
    await expect(win.getByTestId('welcome-cap')).toContainText('200')
    // Under E2E quiet hours start off, and the welcome says so rather than
    // promising a window that is not in force.
    await expect(win.getByTestId('welcome-quiet')).toContainText('Quiet hours are off')
    // No tour is offered over the welcome.
    await expect(win.getByTestId('tour-offer')).toHaveCount(0)

    await win.getByTestId('welcome-start').click()
    await expect(welcome).toHaveCount(0)
    await expect(win.getByTestId('getting-started')).toBeVisible()
    for (const id of ['device', 'contacts', 'template', 'campaign', 'autoreply']) {
      await expect(win.getByTestId(`checklist-${id}`)).toHaveAttribute(
        'data-done',
        'false',
      )
    }
    await expect
      .poll(
        async () =>
          (await call<{ onboardingCompleted: boolean }>(win, 'app:getPrefs'))
            .onboardingCompleted,
      )
      .toBe(true)
  })

  test('E9.17 — each screen offers its tour once, and only once', async () => {
    const offer = win.getByTestId('tour-offer')
    await expect(offer).toBeVisible()
    await expect(offer).toHaveAttribute('data-tour-id', 'dashboard')
    // It does not take focus from anything.
    await expect(offer.getByTestId('tour-offer-start')).not.toBeFocused()
    await win.getByTestId('tour-offer-dismiss').click()
    await expect(offer).toHaveCount(0)

    await win.getByTestId('nav-templates').click()
    await expect(offer).toHaveAttribute('data-tour-id', 'templates')
    await win.getByTestId('nav-dashboard').click()
    await expect(win.getByTestId('dashboard-stats')).toBeVisible()
    await expect(offer).toHaveCount(0)
    await win.getByTestId('nav-templates').click()
    await expect(win.getByTestId('page-title')).toHaveText('WhatsApp Templates')
    await expect(offer).toHaveCount(0)

    await expect
      .poll(
        async () => (await call<{ toursSeen: string[] }>(win, 'app:getPrefs')).toursSeen,
      )
      .toEqual(expect.arrayContaining(['dashboard', 'templates']))
  })

  test('E9.18 — checklist steps tick themselves as a device links and contacts arrive', async () => {
    await win.getByTestId('nav-dashboard').click()
    await expect(win.getByTestId('getting-started')).toBeVisible()

    const device = await call<{ id: string }>(win, 'device:create', {
      name: 'Shop phone',
    })
    await call(win, 'device:connect', { id: device.id })
    await expect(win.getByTestId('checklist-device')).toHaveAttribute(
      'data-done',
      'true',
      {
        timeout: 30_000,
      },
    )

    const list = await call<{ id: string }>(win, 'contactList:create', {
      name: 'Customers',
    })
    await call(win, 'contacts:create', {
      listId: list.id,
      data: { Name: 'Priya', Mobile: '+919800000918' },
    })
    // Counts are read when the Dashboard opens, as a user coming back would.
    await win.getByTestId('nav-contacts').click()
    await expect(win.getByTestId('page-title')).toHaveText('Contact Lists')
    await win.getByTestId('nav-dashboard').click()
    await expect(win.getByTestId('checklist-contacts')).toHaveAttribute(
      'data-done',
      'true',
    )
    await expect(win.getByTestId('checklist-template')).toHaveAttribute(
      'data-done',
      'false',
    )
  })

  test('E9.19 — "Show me" opens the screen and starts its tour', async () => {
    await win.getByTestId('checklist-show-campaign').click()
    await expect(win.getByTestId('page-title')).toHaveText('WhatsApp Bulk Campaigns')
    await expect(win.getByTestId('tour-title')).toHaveText('Create a campaign')
    // Starting a tour counts as seeing it: no separate offer on this screen.
    await expect(win.getByTestId('tour-offer')).toHaveCount(0)
    await win.keyboard.press('Escape')
    await expect(win.getByTestId('tour')).toHaveCount(0)
  })

  test('E9.20 — onboarding is remembered after a restart', async () => {
    await app.close()
    await launch()
    await expect(win.getByTestId('dashboard-stats')).toBeVisible()
    await expect(win.getByTestId('getting-started')).toBeVisible()
    await expect(win.getByTestId('welcome-dialog')).toHaveCount(0)
    // The Dashboard tour was offered before the restart; it is not offered again.
    await expect(win.getByTestId('tour-offer')).toHaveCount(0)
    const prefs = await call<{ onboardingCompleted: boolean; toursSeen: string[] }>(
      win,
      'app:getPrefs',
    )
    expect(prefs.onboardingCompleted).toBe(true)
    expect(prefs.toursSeen).toEqual(
      expect.arrayContaining(['dashboard', 'templates', 'campaigns']),
    )
    await win.getByTestId('checklist-hide').click()
    await expect(win.getByTestId('getting-started')).toHaveCount(0)
  })
})
