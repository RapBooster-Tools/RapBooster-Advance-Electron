/**
 * Desktop preferences: notifications, background running, start at login, onboarding and tours (Wave 3).
 *
 * The values live in services/desktop/prefs.ts, which keeps the in-memory copy
 * the window-close path reads synchronously.
 */
import { loadPrefs, setPrefs } from '../services/desktop/prefs'
import { registerHandler } from './router'

export function registerAppPrefHandlers(): void {
  // Load now, so the cache is warm before the first window can be closed.
  void loadPrefs()

  registerHandler('app:getPrefs', () => loadPrefs())
  registerHandler('app:setPrefs', (patch) => setPrefs(patch))
}
