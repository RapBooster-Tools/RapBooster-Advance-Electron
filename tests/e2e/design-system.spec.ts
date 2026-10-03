/**
 * Design system (E7.1–E7.10): light/dark/system theme, the grouped and
 * collapsible sidebar, the modal dialog's keyboard contract, and the WhatsApp
 * phone preview.
 *
 * One app and one userData directory for the whole file, because persistence
 * across a reload and a relaunch is exactly what several of these assert.
 */
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_READY_TIMEOUT_MS } from './fixtures/constants'
import {
  cleanupUserDataDir,
  launchLicensed,
  newUserDataDir,
} from './fixtures/licensed-app'

test.describe.configure({ mode: 'serial' })

let dir: string
let app: ElectronApplication
let win: Page

const html = () => win.locator('html')

/** Computed background of <body>, which is painted with --color-app-bg. */
const bodyBackground = () =>
  win.evaluate(() => getComputedStyle(document.body).backgroundColor)

const LIGHT_APP_BG = 'rgb(243, 245, 247)'
const DARK_APP_BG = 'rgb(11, 20, 26)'

async function launch(): Promise<void> {
  ;({ app, win } = await launchLicensed(dir))
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

test('E7.1 — a fresh install follows the operating system ("System")', async () => {
  await expect(html()).toHaveAttribute('data-theme-preference', 'system')
  await expect(win.getByTestId('theme-system')).toHaveAttribute('aria-checked', 'true')

  const osDark = await win.evaluate(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  await expect(html()).toHaveAttribute('data-theme', osDark ? 'dark' : 'light')
})

test('E7.2 — choosing Dark switches the whole app to the dark tokens', async () => {
  await win.getByTestId('theme-light').click()
  await expect(html()).toHaveAttribute('data-theme', 'light')
  expect(await bodyBackground()).toBe(LIGHT_APP_BG)

  await win.getByTestId('theme-dark').click()
  await expect(html()).toHaveAttribute('data-theme', 'dark')
  await expect(html()).toHaveAttribute('data-theme-preference', 'dark')
  await expect(win.getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'true')
  await expect(win.getByTestId('theme-system')).toHaveAttribute('aria-checked', 'false')
  expect(await bodyBackground()).toBe(DARK_APP_BG)
  // The OS window frame follows too (nativeTheme in main).
  await expect
    .poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource))
    .toBe('dark')
})

test('E7.3 — the choice survives a reload and is applied before first paint', async () => {
  await win.reload()
  await win
    .getByTestId('nav-dashboard')
    .waitFor({ state: 'visible', timeout: APP_READY_TIMEOUT_MS })
  await expect(html()).toHaveAttribute('data-theme', 'dark')
  await expect(win.getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'true')

  // No flash of the light theme: the bootstrap script sits in <head> of the
  // shipped HTML and the CSP admits it by hash (a blocked script would leave
  // the first frame light until React hydrated).
  const page = readFileSync(join('out', 'renderer', 'index.html'), 'utf8')
  const bootstrap = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]!)
    .find((body) => body.includes('rb.theme'))
  expect(bootstrap, 'bootstrap script present in index.html').toBeTruthy()
  expect(page.indexOf(bootstrap!)).toBeLessThan(page.indexOf('<body'))
  const hashes = JSON.parse(
    readFileSync(join('out', 'renderer', 'csp-script-hashes.json'), 'utf8'),
  ) as string[]
  const digest = createHash('sha256').update(bootstrap!, 'utf8').digest('base64')
  expect(hashes).toContain(`sha256-${digest}`)
})

test('E7.4 — the choice survives a full relaunch', async () => {
  await app.close()
  await launch()
  await expect(html()).toHaveAttribute('data-theme', 'dark')
  await expect(html()).toHaveAttribute('data-theme-preference', 'dark')
  expect(await bodyBackground()).toBe(DARK_APP_BG)
})

test('E7.5 — "System" follows prefers-color-scheme live, without a reload', async () => {
  await win.getByTestId('theme-system').click()
  await expect(html()).toHaveAttribute('data-theme-preference', 'system')

  await win.emulateMedia({ colorScheme: 'dark' })
  await expect(html()).toHaveAttribute('data-theme', 'dark')
  await win.emulateMedia({ colorScheme: 'light' })
  await expect(html()).toHaveAttribute('data-theme', 'light')
  await win.emulateMedia({ colorScheme: 'dark' })
  await expect(html()).toHaveAttribute('data-theme', 'dark')

  // An explicit choice is not overridden by the OS.
  await win.getByTestId('theme-light').click()
  await expect(html()).toHaveAttribute('data-theme', 'light')
  await win.emulateMedia({ colorScheme: 'light' })
  await win.emulateMedia({ colorScheme: 'dark' })
  await expect(html()).toHaveAttribute('data-theme', 'light')
  await win.emulateMedia({ colorScheme: null })
})

test('E7.6 — Settings › Appearance mirrors the header, and is keyboard operable', async () => {
  await win.getByTestId('nav-settings').click()
  await expect(win.getByTestId('page-title')).toHaveText('Settings')
  await expect(win.getByTestId('appearance-section')).toBeVisible()

  await win.getByTestId('appearance-dark').click()
  await expect(html()).toHaveAttribute('data-theme', 'dark')
  await expect(win.getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'true')

  // Radio group: arrow keys move the selection, one Tab stop for the group.
  await win.getByTestId('appearance-dark').focus()
  await win.keyboard.press('ArrowRight')
  await expect(win.getByTestId('appearance-system')).toBeFocused()
  await expect(win.getByTestId('appearance-system')).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await win.keyboard.press('ArrowRight')
  await expect(win.getByTestId('appearance-light')).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(html()).toHaveAttribute('data-theme', 'light')
  await expect(win.getByTestId('appearance-dark')).toHaveAttribute('tabindex', '-1')
})

test('E7.7 — the sidebar is grouped, collapses to icons, and remembers it', async () => {
  for (const group of ['overview', 'messaging', 'audience', 'automation', 'setup']) {
    await expect(win.getByTestId(`nav-group-${group}`)).toBeVisible()
  }
  await expect(win.getByTestId('nav-group-messaging')).toContainText('Messaging')

  const sidebar = win.getByTestId('app-sidebar')
  const toggle = win.getByTestId('sidebar-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect((await sidebar.boundingBox())!.width).toBeGreaterThan(200)

  await toggle.click()
  await expect(html()).toHaveAttribute('data-sidebar', 'collapsed')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(100)

  // Icons only, yet every link keeps its accessible name and still navigates.
  await expect(win.getByRole('link', { name: 'Campaigns' })).toBeVisible()
  await win.getByTestId('nav-inbox').hover()
  await expect(win.getByRole('tooltip')).toHaveText('Inbox')
  await win.getByTestId('nav-campaigns').click()
  await expect(win.getByTestId('page-title')).toHaveText('WhatsApp Bulk Campaigns')

  await win.reload()
  await win
    .getByTestId('nav-dashboard')
    .waitFor({ state: 'visible', timeout: APP_READY_TIMEOUT_MS })
  await expect(html()).toHaveAttribute('data-sidebar', 'collapsed')

  await win.getByTestId('sidebar-toggle').click()
  await expect(html()).toHaveAttribute('data-sidebar', 'expanded')
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(200)
})

test('E7.8 — every screen renders in dark mode with no console errors', async () => {
  const errors: string[] = []
  const onConsole = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === 'error') errors.push(msg.text())
  }
  const onPageError = (err: Error) => errors.push(err.message)
  win.on('console', onConsole)
  win.on('pageerror', onPageError)

  await win.getByTestId('theme-dark').click()
  await expect(html()).toHaveAttribute('data-theme', 'dark')

  const routes: Array<[string, string]> = [
    ['nav-dashboard', 'Dashboard'],
    ['nav-inbox', 'Unified inbox'],
    ['nav-campaigns', 'WhatsApp Bulk Campaigns'],
    ['nav-sequences', 'Drip Sequences'],
    ['nav-broadcast', 'Status & Channels'],
    ['nav-templates', 'WhatsApp Templates'],
    ['nav-contacts', 'Contact Lists'],
    ['nav-groups', 'WhatsApp Groups'],
    ['nav-automation', 'Automation'],
    ['nav-chatbot', 'AI Chatbot Configuration'],
    ['nav-devices', 'WhatsApp Devices'],
    ['nav-settings', 'Settings'],
  ]
  for (const [testId, title] of routes) {
    await win.getByTestId(testId).click()
    await expect(win.getByTestId('page-title')).toHaveText(title)
    await expect(win.getByTestId(testId)).toHaveAttribute('aria-current', 'page')
    // Dark text on the dark surface would be unreadable: the title must be light.
    const color = await win
      .getByTestId('page-title')
      .evaluate((el) => getComputedStyle(el).color)
    expect(color, `${title} title colour`).toBe('rgb(233, 237, 239)')
  }

  win.off('console', onConsole)
  win.off('pageerror', onPageError)
  expect(errors).toEqual([])
})

test('E7.9 — a dialog takes focus, closes on Escape and returns focus', async () => {
  await win.getByTestId('nav-templates').click()
  const trigger = win.getByTestId('new-template')
  const dialog = win.getByTestId('create-template-dialog')

  await trigger.click()
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(win.getByRole('dialog', { name: 'Create Template' })).toBeVisible()
  // Focus lands on the first field, not on the header's close button.
  await expect(win.getByTestId('tpl-name')).toBeFocused()

  // Focus is trapped: Shift+Tab from the first control wraps to the last.
  await dialog.getByRole('button', { name: 'Close dialog' }).focus()
  await win.keyboard.press('Shift+Tab')
  await expect(win.getByTestId('submit-template')).toBeFocused()

  await win.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()

  await trigger.click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
  await expect(dialog).toBeHidden()
})

test('E7.10 — the phone preview renders WhatsApp formatting in both palettes', async () => {
  await win.getByTestId('nav-settings').click()
  const preview = win.getByTestId('appearance-preview')
  await preview.scrollIntoViewIfNeeded()
  await expect(preview).toBeVisible()

  const first = preview.getByTestId('preview-bubble').first()
  await expect(first).toHaveAttribute('data-kind', 'text')
  await expect(first.locator('strong')).toHaveText('Diwali sale')
  await expect(first.locator('em')).toHaveText('20% off')
  await expect(first.locator('del')).toHaveText('₹999')
  await expect(first.locator('code')).toHaveText('DIWALI20')
  // The markers themselves are consumed, as in WhatsApp.
  await expect(first).not.toContainText('*Diwali')
  await expect(first).not.toContainText('```')

  const buttons = preview.locator('[data-kind="buttons"]')
  await expect(buttons).toContainText('Yes, remind me')
  await expect(buttons).toContainText('Shop now')
  await expect(buttons).toContainText('Reply STOP to opt out')

  // Recipient view: the business's message arrives on the left in WhatsApp's
  // incoming-bubble colour, which follows the theme.
  const bubbleColour = () =>
    first.evaluate((el) => getComputedStyle(el.lastElementChild!).backgroundColor)
  await win.getByTestId('theme-dark').click()
  await expect.poll(bubbleColour).toBe('rgb(32, 44, 51)')
  await win.getByTestId('theme-light').click()
  await expect.poll(bubbleColour).toBe('rgb(255, 255, 255)')
})
