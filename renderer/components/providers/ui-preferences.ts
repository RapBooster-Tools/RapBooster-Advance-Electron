/**
 * Per-machine UI preferences: colour theme and sidebar collapse.
 *
 * WHY localStorage and not the database: these are cosmetic, per-window
 * conveniences with no business meaning, and they must be readable by a
 * synchronous inline script *before first paint* — an IPC round trip would
 * always arrive after the wrong theme had already flashed on screen. Losing them
 * (cleared site data, a private profile) costs nothing but a default look.
 *
 * Deliberately not a `'use client'` module: the root layout is a server
 * component and needs the bootstrap script string itself, not a client
 * reference to it.
 *
 * The state lives on <html> as data attributes, which is what the CSS keys on:
 *   data-theme            light | dark          (resolved, drives the tokens)
 *   data-theme-preference light | dark | system (what the user chose)
 *   data-sidebar          expanded | collapsed
 */

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'rb.theme'
export const SIDEBAR_STORAGE_KEY = 'rb.sidebar'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * Runs inline in <head>, before the body paints, so the first frame already
 * has the right theme. Kept tiny and dependency-free on purpose; the CSP admits
 * it by hash (scripts/copy-renderer.mjs pins every inline script at build).
 */
export const UI_BOOTSTRAP_SCRIPT = `(function(){var r=document.documentElement,p='system',s='expanded';try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'||t==='system')p=t;if(localStorage.getItem('${SIDEBAR_STORAGE_KEY}')==='collapsed')s='collapsed'}catch(e){console.warn('ui preferences unavailable; using defaults',e)}var d=p==='dark'||(p==='system'&&window.matchMedia('${DARK_QUERY}').matches);r.setAttribute('data-theme',d?'dark':'light');r.setAttribute('data-theme-preference',p);r.setAttribute('data-sidebar',s)})()`

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch (err) {
    // Ignorable: the default look is used instead (see the module comment).
    console.warn(`ui preferences: cannot read ${key}`, err)
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch (err) {
    // Ignorable: the choice still applies now, it just will not survive a restart.
    console.warn(`ui preferences: cannot save ${key}`, err)
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

// ───────────────────────────── theme ─────────────────────────────

export function readThemePreference(): ThemePreference {
  const fromDom = document.documentElement.getAttribute('data-theme-preference')
  if (isPreference(fromDom)) return fromDom
  const stored = readStorage(THEME_STORAGE_KEY)
  return isPreference(stored) ? stored : 'system'
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return preference
}

export function readResolvedTheme(): ResolvedTheme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

const listeners = new Set<() => void>()
let systemQuery: MediaQueryList | null = null

function emit(): void {
  for (const listener of listeners) listener()
}

function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement
  root.setAttribute('data-theme', resolveTheme(preference))
  root.setAttribute('data-theme-preference', preference)
}

export function setThemePreference(preference: ThemePreference): void {
  writeStorage(THEME_STORAGE_KEY, preference)
  applyTheme(preference)
  emit()
}

// ──────────────────────────── sidebar ────────────────────────────

export function readSidebarCollapsed(): boolean {
  return document.documentElement.getAttribute('data-sidebar') === 'collapsed'
}

export function setSidebarCollapsed(collapsed: boolean): void {
  const value = collapsed ? 'collapsed' : 'expanded'
  writeStorage(SIDEBAR_STORAGE_KEY, value)
  document.documentElement.setAttribute('data-sidebar', value)
  emit()
}

// ─────────────────────────── subscription ───────────────────────────

/**
 * useSyncExternalStore subscription. The first subscriber also re-applies the
 * stored state — a fallback for when the bootstrap script did not run (a dev
 * server without pinned CSP hashes) — and starts following the OS theme.
 */
export function subscribeUiPreferences(listener: () => void): () => void {
  if (listeners.size === 0) {
    applyTheme(readThemePreference())
    if (!document.documentElement.hasAttribute('data-sidebar')) {
      document.documentElement.setAttribute(
        'data-sidebar',
        readStorage(SIDEBAR_STORAGE_KEY) === 'collapsed' ? 'collapsed' : 'expanded',
      )
    }
    // One MediaQueryList, kept: removeEventListener only works on the same object.
    systemQuery = window.matchMedia(DARK_QUERY)
    systemQuery.addEventListener('change', onSystemThemeChange)
  }
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      systemQuery?.removeEventListener('change', onSystemThemeChange)
      systemQuery = null
    }
  }
}

/** Live-follow the OS (Windows/macOS appearance) while the choice is "System". */
function onSystemThemeChange(): void {
  if (readThemePreference() !== 'system') return
  applyTheme('system')
  emit()
}
