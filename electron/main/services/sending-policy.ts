/**
 * Sending policy: the settings that decide when and how much each device may
 * send, and the one place that pushes them into the wa-service throttle.
 *
 * WHY a single module: before D89 only the campaign engine configured the
 * throttle, so a group job, an AI reply or anything else sent on a device no
 * campaign had touched ran with the throttle's built-in defaults — no daily cap
 * at all. Every automated sender now shares the same base policy, applied
 * whenever a device connects or a setting changes; a campaign still layers its
 * own delays on top when it starts.
 */
import type { IpcResponse } from '../../../shared/ipc'
import { getPrisma } from '../db/client'
import { waBridge } from '../wa-bridge'

export type SendingDefaults = IpcResponse<'settings:getSendingDefaults'>

/**
 * Defaults for a new install (D80): a 200-per-day cap and quiet hours from 21:00
 * to 09:00 local time. Both are editable; they are on by default because an
 * account banned on day one cannot be recovered.
 */
const PRODUCTION_DEFAULTS: SendingDefaults = {
  delayFrom: 0,
  delayTo: 5,
  sleepDuration: 10,
  sleepAfter: 10,
  groupMessageDelay: 2,
  groupCreateDelay: 2,
  dailyCapPerDevice: 200,
  retryAttempts: 2,
  maxConcurrentDevices: 20,
  quietHoursEnabled: true,
  quietHoursStart: '21:00',
  quietHoursEnd: '09:00',
  simulateTyping: true,
  markReadOnReply: true,
  healthBreaker: true,
  attributionHours: 72,
}

/**
 * NOTE: under E2E (NODE_ENV=test) quiet hours and typing simulation start off.
 * Otherwise the suite's outcome would depend on the wall clock — every campaign
 * spec would park when run after 21:00 — and typing adds seconds to each send.
 * Specs that cover these features switch them on explicitly.
 */
export const SENDING_DEFAULTS: SendingDefaults =
  process.env.NODE_ENV === 'test'
    ? { ...PRODUCTION_DEFAULTS, quietHoursEnabled: false, simulateTyping: false }
    : PRODUCTION_DEFAULTS

const KEY_PREFIX = 'sending.'

export async function readSendingDefaults(): Promise<SendingDefaults> {
  const rows = await getPrisma().setting.findMany({
    where: { key: { startsWith: KEY_PREFIX } },
    take: 100,
  })
  const stored = new Map(rows.map((r) => [r.key.slice(KEY_PREFIX.length), r.value]))
  const out = { ...SENDING_DEFAULTS } as Record<string, unknown>
  for (const [field, fallback] of Object.entries(SENDING_DEFAULTS)) {
    const raw = stored.get(field)
    if (raw === undefined) continue
    if (typeof fallback === 'number') {
      const n = Number(raw)
      if (Number.isFinite(n)) out[field] = n
    } else if (typeof fallback === 'boolean') {
      out[field] = raw === 'true'
    } else {
      out[field] = raw
    }
  }
  return out as SendingDefaults
}

export async function writeSendingDefaults(input: SendingDefaults): Promise<void> {
  const prisma = getPrisma()
  await prisma.$transaction(
    Object.entries(input).map(([field, value]) =>
      prisma.setting.upsert({
        where: { key: `${KEY_PREFIX}${field}` },
        create: {
          key: `${KEY_PREFIX}${field}`,
          value: String(value),
          isEncrypted: false,
        },
        update: { value: String(value) },
      }),
    ),
  )
}

/** "21:30" -> 1290. */
export function minutesOf(clock: string): number {
  const [h, m] = clock.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function quietWindow(
  defaults: SendingDefaults,
): { start: number; end: number } | null {
  if (!defaults.quietHoursEnabled) return null
  return {
    start: minutesOf(defaults.quietHoursStart),
    end: minutesOf(defaults.quietHoursEnd),
  }
}

/**
 * Warmup ramp (D89): the daily cap for days 1..10 of a new number. After the
 * ramp the configured cap applies. Conservative on purpose — WhatsApp scores
 * new accounts on how quickly their volume grows.
 */
export const WARMUP_RAMP = [20, 30, 40, 55, 70, 90, 110, 135, 160, 200] as const

/** 1-based day of warmup, or null when warmup is off. */
export function warmupDay(
  device: { warmupEnabled: boolean; warmupStartedAt: Date | null },
  now: Date = new Date(),
): number | null {
  if (!device.warmupEnabled || !device.warmupStartedAt) return null
  const start = new Date(device.warmupStartedAt)
  start.setHours(0, 0, 0, 0)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - start.getTime()) / 86_400_000) + 1
}

/** The warmup ceiling for a day, or null once the ramp is complete. */
export function warmupCap(day: number | null): number | null {
  if (day === null || day > WARMUP_RAMP.length) return null
  return WARMUP_RAMP[Math.max(1, day) - 1] ?? null
}

/** Today's cap for a device: the lower of the global cap and warmup. 0 = unlimited. */
export function effectiveCap(
  globalCap: number,
  device: { warmupEnabled: boolean; warmupStartedAt: Date | null },
): number {
  const ramp = warmupCap(warmupDay(device))
  if (ramp === null) return globalCap
  return globalCap === 0 ? ramp : Math.min(globalCap, ramp)
}

/** The configured global cap, or 0 for unlimited. */
export async function dailyCapPerDevice(): Promise<number> {
  return (await readSendingDefaults()).dailyCapPerDevice
}

/** True when a stored daily counter belongs to an earlier local day. */
export function isStaleDay(resetAt: Date | null): boolean {
  if (!resetAt) return true
  const now = new Date()
  return (
    resetAt.getFullYear() !== now.getFullYear() ||
    resetAt.getMonth() !== now.getMonth() ||
    resetAt.getDate() !== now.getDate()
  )
}

/**
 * Push the base policy for one device into the throttle. `pacing` overrides the
 * delays — the campaign engine passes the campaign's own.
 */
export async function applyDevicePolicy(
  deviceId: string,
  pacing?: {
    delayFrom: number
    delayTo: number
    sleepDuration: number
    sleepAfter: number
  },
): Promise<void> {
  const prisma = getPrisma()
  const device = await prisma.device.findUnique({ where: { id: deviceId } })
  if (!device) return

  let sentToday = device.dailySentCount
  if (isStaleDay(device.dailyCountResetAt)) {
    await prisma.device.update({
      where: { id: deviceId },
      data: { dailySentCount: 0, dailyCountResetAt: new Date() },
    })
    sentToday = 0
  }

  const defaults = await readSendingDefaults()
  const p = pacing ?? defaults
  await waBridge
    .request('throttle:configure', {
      deviceId,
      delayFromMs: p.delayFrom * 1_000,
      delayToMs: p.delayTo * 1_000,
      sleepDurationMs: p.sleepDuration * 1_000,
      sleepAfter: p.sleepAfter,
      dailyCap: effectiveCap(defaults.dailyCapPerDevice, device),
      sentToday,
      quietHours: quietWindow(defaults),
      simulateTyping: defaults.simulateTyping,
    })
    .catch((err: unknown) =>
      console.error(`throttle:configure failed for ${deviceId}`, err),
    )
}

/** Re-apply to every connected device — after a settings change or a restart. */
export async function applyAllDevicePolicies(): Promise<void> {
  const devices = await getPrisma().device.findMany({
    where: { status: 'connected' },
    select: { id: true },
    take: 100,
  })
  for (const d of devices) await applyDevicePolicy(d.id)
}

/**
 * An automated send that hit a parking condition rather than failing: the
 * daily cap or quiet hours. Such a send never reached WhatsApp, must not use up
 * a retry, and resumes on its own once the condition lifts.
 */
export function isParkingError(message: string): boolean {
  return message.includes('daily cap') || message.includes('quiet hours')
}

/**
 * Count one accepted send against the device's daily allowance, rolling the
 * counter over first if it belongs to an earlier day. Wired once, to the
 * wa-bridge `onSent` hook, so every sender is counted exactly once.
 */
export async function bumpDailyCount(deviceId: string): Promise<void> {
  const prisma = getPrisma()
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { dailyCountResetAt: true },
  })
  if (!device) return
  await prisma.device.update({
    where: { id: deviceId },
    data: isStaleDay(device.dailyCountResetAt)
      ? { dailySentCount: 1, dailyCountResetAt: new Date() }
      : { dailySentCount: { increment: 1 } },
  })
}
