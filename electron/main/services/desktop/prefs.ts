/**
 * Desktop preferences (Wave 3): notifications, background running, start at
 * login, onboarding and guided tours.
 *
 * Stored as `app.<field>` rows in the Setting table, like every other small
 * piece of configuration. WHY an in-memory cache: `keepRunningInBackground()`
 * is called from `window-all-closed` and the close handler, both synchronous —
 * a window cannot wait on a database read to decide whether to close.
 */
import { app } from 'electron'
import { appPrefs } from '../../../../shared/contract/workspace'
import { AppError } from '../../../../shared/errors'
import type { IpcResponse } from '../../../../shared/ipc'
import { getPrisma } from '../../db/client'

export type AppPrefs = IpcResponse<'app:getPrefs'>

/** Launch flag for a start-at-login launch: open straight to the tray. */
export const HIDDEN_FLAG = '--hidden'

const KEY_PREFIX = 'app.'

const DEFAULTS: AppPrefs = {
  notifications: true,
  runInBackground: true,
  startAtLogin: false,
  onboardingCompleted: false,
  toursSeen: [],
}

let cache: AppPrefs = { ...DEFAULTS, toursSeen: [] }
let loading: Promise<AppPrefs> | undefined
const listeners = new Set<(prefs: AppPrefs) => void>()

/** The cached preferences — defaults until the first load completes. */
export function currentPrefs(): AppPrefs {
  return cache
}

export function onPrefsChanged(listener: (prefs: AppPrefs) => void): void {
  listeners.add(listener)
}

function decode(rows: { key: string; value: string }[]): AppPrefs {
  const stored = new Map(rows.map((r) => [r.key.slice(KEY_PREFIX.length), r.value]))
  const out: AppPrefs = { ...DEFAULTS, toursSeen: [] }
  for (const field of [
    'notifications',
    'runInBackground',
    'startAtLogin',
    'onboardingCompleted',
  ] as const) {
    const raw = stored.get(field)
    if (raw !== undefined) out[field] = raw === 'true'
  }
  const tours = stored.get('toursSeen')
  if (tours !== undefined) {
    try {
      const parsed = appPrefs.shape.toursSeen.safeParse(JSON.parse(tours))
      if (parsed.success) out.toursSeen = parsed.data
    } catch (err) {
      // Written only by setPrefs as JSON; an unreadable value just means the
      // tours show again, which is harmless.
      console.debug('desktop: unreadable toursSeen preference, using none', err)
    }
  }
  return onboardingTestSeam(out, stored)
}

/** `toursSeen` entry meaning "every tour": the renderer offers none. */
export const ALL_TOURS_SEEN = '*'

/**
 * NOTE: test seam. Under E2E (NODE_ENV=test) the first-run welcome and the
 * "take the tour" prompts would sit over every screen of ~300 specs that were
 * written before they existed, so they report onboarding as done and every
 * tour as seen — unless a spec opts in with RB_ONBOARDING=1. Only the
 * defaults are replaced: a value a spec stored itself is reported as stored.
 * Never active in a real install, where NODE_ENV is not "test".
 */
function onboardingTestSeam(prefs: AppPrefs, stored: Map<string, string>): AppPrefs {
  if (process.env.NODE_ENV !== 'test' || process.env.RB_ONBOARDING === '1') return prefs
  return {
    ...prefs,
    onboardingCompleted: stored.has('onboardingCompleted')
      ? prefs.onboardingCompleted
      : true,
    toursSeen: stored.has('toursSeen') ? prefs.toursSeen : [ALL_TOURS_SEEN],
  }
}

/** Read once from the database; later calls share the first read. */
export function loadPrefs(): Promise<AppPrefs> {
  loading ??= getPrisma()
    .setting.findMany({ where: { key: { startsWith: KEY_PREFIX } }, take: 50 })
    .then((rows) => {
      cache = decode(rows)
      return cache
    })
    .catch((err: unknown) => {
      // Allow a retry on the next call rather than caching the failure.
      loading = undefined
      console.error('desktop: could not read preferences, using defaults', err)
      return cache
    })
  return loading
}

function encode(field: keyof AppPrefs, value: AppPrefs[keyof AppPrefs]): string {
  return field === 'toursSeen' ? JSON.stringify(value) : String(value)
}

export async function setPrefs(patch: Partial<AppPrefs>): Promise<AppPrefs> {
  const before = await loadPrefs()
  const next: AppPrefs = { ...before, ...patch }
  // The OS first: if it refuses, nothing is stored and the toggle stays as it was.
  if (patch.startAtLogin !== undefined && patch.startAtLogin !== before.startAtLogin) {
    applyLoginItem(next.startAtLogin)
  }
  const prisma = getPrisma()
  const fields = Object.keys(patch) as (keyof AppPrefs)[]
  await prisma.$transaction(
    fields.map((field) => {
      const key = `${KEY_PREFIX}${field}`
      const value = encode(field, next[field])
      return prisma.setting.upsert({
        where: { key },
        create: { key, value, isEncrypted: false },
        update: { value },
      })
    }),
  )
  cache = next
  loading = Promise.resolve(next)
  for (const listener of listeners) listener(next)
  return next
}

/** Whether the OS lets this app register itself to start at login. */
export function loginItemSupported(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin'
}

/**
 * Register or remove the OS login item.
 *
 * NOTE: skipped under E2E and in an unpackaged dev run — both would register
 * the bare Electron binary to start with the developer's computer.
 */
function applyLoginItem(openAtLogin: boolean): void {
  if (!loginItemSupported()) {
    console.debug(`desktop: start at login is not supported on ${process.platform}`)
    return
  }
  if (process.env.NODE_ENV === 'test' || !app.isPackaged) {
    console.debug('desktop: start at login not registered outside a packaged build')
    return
  }
  try {
    // macOS has no launch arguments for a login item; a login launch is
    // detected with wasOpenedAtLogin instead (see launchedHidden).
    app.setLoginItemSettings(
      process.platform === 'win32'
        ? { openAtLogin, args: [HIDDEN_FLAG] }
        : { openAtLogin },
    )
  } catch (err) {
    throw new AppError('UNKNOWN', {
      userMessage: 'Could not change the start-at-login setting.',
      detail: `setLoginItemSettings failed: ${String(err)}`,
      cause: err,
    })
  }
}

/** True when this launch should open to the tray instead of showing a window. */
export function launchedHidden(): boolean {
  if (process.argv.includes(HIDDEN_FLAG)) return true
  if (process.platform !== 'darwin') return false
  try {
    return app.getLoginItemSettings().wasOpenedAtLogin
  } catch (err) {
    console.debug('desktop: login item state unavailable; showing the window', err)
    return false
  }
}

/**
 * True exactly once per install for `flag` — for one-time notices. Kept out of
 * the preferences object: it is not something the user sets.
 */
export async function firstTime(flag: string): Promise<boolean> {
  const key = `desktop.once.${flag}`
  const prisma = getPrisma()
  const seen = await prisma.setting.findUnique({ where: { key } })
  if (seen) return false
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: new Date().toISOString(), isEncrypted: false },
    update: {},
  })
  return true
}
