/**
 * The tray (Windows, Linux) / menu-bar (macOS) icon.
 *
 * WHY it matters: with "keep running in the background" on, closing the window
 * leaves campaigns sending with nothing on screen. The tray is the user's proof
 * the app is still working and their way back in — or out.
 */
import { Menu, nativeImage, Tray, type NativeImage } from 'electron'
import { getPrisma } from '../../db/client'
import { campaignEngine } from '../campaign-engine'
import { toast } from '../notify'
import tray16 from './icons/tray-16.png?asset'
import tray32 from './icons/tray-32.png?asset'
import template16 from './icons/trayTemplate-16.png?asset'
import template32 from './icons/trayTemplate-32.png?asset'

export interface TrayActions {
  showWindow: () => void
  quit: () => void
}

interface Status {
  devices: number
  campaigns: number
}

let tray: Tray | undefined
let actions: TrayActions | undefined
let status: Status = { devices: 0, campaigns: 0 }
let refreshTimer: NodeJS.Timeout | undefined

/**
 * Both resolutions in one image so the OS picks the sharp one on a HiDPI
 * display. On macOS the monochrome glyph is a template image: the menu bar
 * tints it for light and dark mode, which a coloured icon cannot follow.
 * The PNGs in ./icons are generated from assets/branding/icon.png (the
 * template is its white bubble glyph); they live beside this module because
 * electron-vite copies a `?asset` import into out/main, which is packaged —
 * its `resources/` folder is not.
 */
function trayIcon(): NativeImage {
  const mac = process.platform === 'darwin'
  const image = nativeImage.createFromPath(mac ? template16 : tray16)
  const hiDpi = nativeImage.createFromPath(mac ? template32 : tray32)
  if (!hiDpi.isEmpty()) image.addRepresentation({ scaleFactor: 2, buffer: hiDpi.toPNG() })
  if (mac) image.setTemplateImage(true)
  if (image.isEmpty()) console.warn('desktop: tray icon asset is missing')
  return image
}

function statusLine(s: Status): string {
  const devices = `${s.devices} device${s.devices === 1 ? '' : 's'} connected`
  const campaigns = `${s.campaigns} campaign${s.campaigns === 1 ? '' : 's'} running`
  return `${devices} · ${campaigns}`
}

async function pauseAll(): Promise<void> {
  const running = await getPrisma().campaign.findMany({
    where: { status: 'running' },
    select: { id: true },
    take: 500,
  })
  for (const c of running) await campaignEngine.pause(c.id)
  toast('info', `Paused ${running.length} campaign${running.length === 1 ? '' : 's'}.`)
  await refreshStatus()
}

export function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'Open RapBooster', click: () => actions?.showWindow() },
    { type: 'separator' },
    { id: 'status', label: statusLine(status), enabled: false },
    {
      id: 'pause-all',
      label: 'Pause all campaigns',
      enabled: status.campaigns > 0,
      click: () => {
        void pauseAll().catch((err: unknown) =>
          console.error('desktop: could not pause campaigns from the tray', err),
        )
      },
    },
    { type: 'separator' },
    { label: 'Quit RapBooster', click: () => actions?.quit() },
  ])
}

/** Labels of the current menu — read by the E2E seam. */
export function menuLabels(): string[] {
  return buildMenu().items.map((i) => i.label)
}

async function refreshStatus(): Promise<void> {
  const prisma = getPrisma()
  const [devices, campaigns] = await Promise.all([
    prisma.device.count({ where: { status: 'connected' } }),
    prisma.campaign.count({ where: { status: 'running' } }),
  ])
  status = { devices, campaigns }
  // Linux has no click events on most trays: the attached menu is the only
  // menu, so it is rebuilt whenever the status changes.
  if (tray && !tray.isDestroyed() && process.platform === 'linux') {
    tray.setContextMenu(buildMenu())
  }
}

/**
 * Recount devices and campaigns, debounced so a fleet of devices reconnecting
 * at once costs one pair of COUNT queries.
 */
export function scheduleStatusRefresh(): void {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    void refreshStatus().catch((err: unknown) =>
      console.error('desktop: could not refresh the tray status', err),
    )
  }, 500)
}

/** Fresh counts, then the menu — on Windows and macOS the menu opens on demand. */
function popUpMenu(): void {
  void refreshStatus()
    .catch((err: unknown) => console.error('desktop: tray status unavailable', err))
    .then(() => tray?.popUpContextMenu(buildMenu()))
}

export function createTray(a: TrayActions): void {
  actions = a
  try {
    tray = new Tray(trayIcon())
  } catch (err) {
    // A Linux desktop without a status-notifier host has nowhere to draw one;
    // the app still works, and a second launch brings the window back.
    console.warn('desktop: the system tray is unavailable', err)
    return
  }
  tray.setToolTip('RapBooster Advance')

  if (process.platform === 'linux') {
    tray.setContextMenu(buildMenu())
    // Only some Linux trays report a click; where they do, it opens the app.
    tray.on('click', () => a.showWindow())
  } else if (process.platform === 'darwin') {
    // Menu-bar convention: any click opens the menu.
    tray.on('click', popUpMenu)
    tray.on('right-click', popUpMenu)
  } else {
    // Windows convention: click opens the app, right-click opens the menu.
    tray.on('click', () => a.showWindow())
    tray.on('right-click', popUpMenu)
  }
  scheduleStatusRefresh()
}

export function destroyTray(): void {
  clearTimeout(refreshTimer)
  if (tray && !tray.isDestroyed()) tray.destroy()
  tray = undefined
}
