/**
 * Desktop integration (Wave 3): notifications, tray, background running and
 * start-at-login. index.ts owns window creation; this module only hooks into
 * the windows it is handed.
 *
 * The pieces live in services/desktop/: prefs (cached settings), notifications
 * (coalescing, badge) and tray.
 */
import { app, BrowserWindow } from 'electron'
import { emitToAll } from '../ipc/router'
import { waBridge } from '../wa-bridge'
import { campaignEngine } from './campaign-engine'
import {
  appInForeground,
  Coalescer,
  flashForAttention,
  lastNotification,
  refreshBadge,
  show,
  type IncomingMessage,
} from './desktop/notifications'
import { currentPrefs, firstTime, launchedHidden, loadPrefs } from './desktop/prefs'
import {
  createTray,
  destroyTray,
  menuLabels,
  scheduleStatusRefresh,
} from './desktop/tray'

export interface DesktopHooks {
  /** Show and focus the main window, recreating it if it was closed. */
  showWindow: () => void
}

let hooks: DesktopHooks | undefined
/** Set on `before-quit`, so a real quit is never turned into a hide. */
let quitting = false
let firstWindow = true
/** The tray notice is checked once per run; the database remembers it across runs. */
let hideNoticeDone = false
const bootedAt = Date.now()

function openApp(route: string, chatId?: string): void {
  hooks?.showWindow()
  const send = () =>
    emitToAll(BrowserWindow.getAllWindows(), 'app:navigate', {
      route,
      ...(chatId ? { chatId } : {}),
    })
  // A window recreated by showWindow has not loaded yet; the event would be lost.
  const loading = BrowserWindow.getAllWindows().find(
    (w) => !w.isDestroyed() && w.webContents.isLoading(),
  )
  if (loading) loading.webContents.once('did-finish-load', send)
  else send()
}

const coalescer = new Coalescer((n) =>
  show({
    title: n.title,
    body: n.body,
    ...(n.chatId ? { chatId: n.chatId } : {}),
    onClick: () => openApp('/inbox', n.chatId),
  }),
)

function hideNoticeText(): string {
  const where =
    process.platform === 'darwin'
      ? 'in the menu bar'
      : process.platform === 'win32'
        ? 'in the system tray'
        : 'in the tray'
  return `RapBooster is still running ${where}. Campaigns keep sending.`
}

/** The first hide surprises people who expected the app to quit — say why once. */
function noticeFirstHide(): void {
  if (hideNoticeDone) return
  hideNoticeDone = true
  void firstTime('tray-notice')
    .then((first) => {
      if (!first) return
      show({
        title: 'RapBooster Advance',
        body: hideNoticeText(),
        onClick: () => hooks?.showWindow(),
      })
    })
    .catch((err: unknown) =>
      console.error('desktop: could not record the tray notice', err),
    )
}

function hideWindow(win: BrowserWindow): void {
  // Hiding a full-screen window on macOS leaves a black Space behind.
  if (win.isFullScreen()) {
    win.once('leave-full-screen', () => win.hide())
    win.setFullScreen(false)
  } else {
    win.hide()
  }
}

/**
 * NOTE: E2E seam, installed only under NODE_ENV=test. Playwright's
 * `electronApp.evaluate` runs in main but cannot reach bundled modules, so a
 * spec clicks the last notification and reads the tray menu through this.
 */
function installTestSeam(): void {
  if (process.env.NODE_ENV !== 'test') return
  Object.assign(globalThis, {
    __rbDesktop: {
      clickLastNotification: () => lastNotification()?.onClick(),
      trayMenuLabels: () => menuLabels(),
    },
  })
}

/** Called once after the first window exists. */
export function initDesktop(h: DesktopHooks): void {
  hooks = h
  void loadPrefs()
  installTestSeam()

  app.on('before-quit', () => {
    quitting = true
    destroyTray()
  })
  // The window may be hidden rather than gone (macOS close, or the tray), and
  // index.ts only recreates a window when none exists — so show it here.
  // NOTE: macOS can also send `activate` while a login launch is starting up;
  // honouring that would defeat starting hidden.
  app.on('activate', () => {
    if (launchedHidden() && Date.now() - bootedAt < 5000) return
    h.showWindow()
  })

  createTray({
    showWindow: () => h.showWindow(),
    quit: () => app.quit(),
  })

  // Device and campaign counts for the tray come from the same events that
  // drive the renderer; nothing polls.
  waBridge.on('status', () => scheduleStatusRefresh())
  // Progress arrives up to once a second per campaign; only a change of
  // status (started, paused, finished) changes the tray's count.
  const lastStatus = new Map<string, string>()
  campaignEngine.onProgress((campaignId, _counters, status) => {
    if (lastStatus.get(campaignId) === status) return
    lastStatus.set(campaignId, status)
    scheduleStatusRefresh()
  })
  refreshBadge()
}

/** Called for every window created; may intercept close to hide to the tray. */
export function attachWindow(win: BrowserWindow): void {
  // A start-at-login launch opens to the tray. index.ts registers its
  // `ready-to-show → show` listener just before calling us, so removing the
  // listeners here is what keeps this first window hidden.
  if (firstWindow && launchedHidden()) win.removeAllListeners('ready-to-show')
  firstWindow = false

  win.on('close', (event) => {
    if (quitting) return
    // macOS convention: closing a window never quits; the Dock icon reopens it.
    if (process.platform !== 'darwin' && !currentPrefs().runInBackground) return
    event.preventDefault()
    hideWindow(win)
    noticeFirstHide()
  })

  // The user is looking: stop the taskbar flash, and pick up chats read in the
  // window (the badge recounts on every focus change rather than per click).
  win.on('focus', () => {
    win.flashFrame(false)
    refreshBadge()
    scheduleStatusRefresh()
  })
  win.on('blur', () => {
    refreshBadge()
    scheduleStatusRefresh()
  })
  win.on('hide', () => scheduleStatusRefresh())
}

/** Whether the app should keep running when its last window closes. */
export function keepRunningInBackground(): boolean {
  return currentPrefs().runInBackground
}

/** A new inbound message was stored — maybe show a desktop notification. */
export function notifyIncoming(message: IncomingMessage): void {
  refreshBadge()
  if (!currentPrefs().notifications || appInForeground()) return
  flashForAttention()
  coalescer.add(message)
}
