/**
 * Push an event to every renderer window from anywhere in main.
 *
 * Services that react to WhatsApp traffic (opt-outs, drafts, posts) need to
 * tell the UI without holding a window reference; this is the one way to do it,
 * and it still validates through the event contract.
 */
import { BrowserWindow } from 'electron'
import type { IpcEvent, IpcEventPayload } from '../../../shared/ipc'
import { emitToAll } from '../ipc/router'

export function notify<E extends IpcEvent>(event: E, payload: IpcEventPayload<E>): void {
  emitToAll(BrowserWindow.getAllWindows(), event, payload)
}

export function toast(
  level: 'info' | 'success' | 'warning' | 'error',
  message: string,
): void {
  notify('toast', { level, message })
}
