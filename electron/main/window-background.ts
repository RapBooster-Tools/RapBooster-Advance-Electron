import { nativeTheme } from 'electron'

/**
 * The window colour behind the page, matching the theme's app background.
 * WHY: it shows for a frame before the renderer paints and while resizing —
 * a light flash on every launch is jarring for someone using dark mode.
 */
export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? '#0b141a' : '#f3f5f7'
}
