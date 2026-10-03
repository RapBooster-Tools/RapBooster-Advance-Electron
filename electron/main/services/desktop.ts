/**
 * Desktop integration (Wave 3): notifications, tray, background running and
 * start-at-login.
 */
import type { BrowserWindow } from 'electron'

export interface DesktopHooks {
  /** Show and focus the main window, recreating it if it was closed. */
  showWindow: () => void
}

/** Called once after the first window exists. */
export function initDesktop(hooks: DesktopHooks): void {
  void hooks
}

/** Called for every window created; may intercept close to hide to the tray. */
export function attachWindow(win: BrowserWindow): void {
  void win
}

/** Whether the app should keep running when its last window closes. */
export function keepRunningInBackground(): boolean {
  return false
}

/** A new inbound message was stored — maybe show a desktop notification. */
export function notifyIncoming(message: {
  chatId: string
  chatName: string
  preview: string | null
  isGroup: boolean
}): void {
  void message
}
