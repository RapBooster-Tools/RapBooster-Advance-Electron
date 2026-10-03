/**
 * Warmup conversations between the user's own devices.
 *
 * A new number that only ever sends outbound marketing looks like a spammer to
 * WhatsApp. Warmup devices chat with each other a few times a day — short,
 * natural exchanges, both directions — so each account builds a history of
 * two-way conversation while its daily cap ramps up (sending-policy.ts).
 *
 * Every message is an ordinary automated send through the throttle: it obeys
 * quiet hours and counts toward the device's daily cap, which is the point —
 * warmup traffic is real traffic.
 */
import { inQuietHours } from '../../../shared/quiet-hours'
import { getPrisma } from '../db/client'
import { waBridge } from '../wa-bridge'
import {
  isParkingError,
  isStaleDay,
  minutesOf,
  quietWindow,
  readSendingDefaults,
} from './sending-policy'
import { WARMUP_SCRIPTS } from './warmup-phrases'

export interface WarmupConfig {
  autoConversations: boolean
  conversationsPerDay: number
}

const DEFAULT_CONFIG: WarmupConfig = { autoConversations: true, conversationsPerDay: 6 }
const KEY_AUTO = 'warmup.autoConversations'
const KEY_PER_DAY = 'warmup.conversationsPerDay'
const KEY_STATE = 'warmup.state'

/**
 * NOTE: with quiet hours off there is no user-defined night, but a burst of
 * chat at 4 a.m. is no more natural for it. These bound the day instead.
 */
const DAY_START = minutesOf('08:00')
const DAY_END = minutesOf('22:00')

const PAUSE_MIN_MS = 20_000
const PAUSE_MAX_MS = 90_000

export async function readWarmupConfig(): Promise<WarmupConfig> {
  const rows = await getPrisma().setting.findMany({
    where: { key: { in: [KEY_AUTO, KEY_PER_DAY] } },
    take: 2,
  })
  const byKey = new Map(rows.map((r) => [r.key, r.value]))
  const perDay = Number(byKey.get(KEY_PER_DAY))
  return {
    autoConversations: byKey.has(KEY_AUTO)
      ? byKey.get(KEY_AUTO) === 'true'
      : DEFAULT_CONFIG.autoConversations,
    conversationsPerDay:
      Number.isInteger(perDay) && perDay > 0
        ? perDay
        : DEFAULT_CONFIG.conversationsPerDay,
  }
}

export async function writeWarmupConfig(config: WarmupConfig): Promise<void> {
  const prisma = getPrisma()
  await prisma.$transaction(
    (
      [
        [KEY_AUTO, String(config.autoConversations)],
        [KEY_PER_DAY, String(config.conversationsPerDay)],
      ] as const
    ).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value, isEncrypted: false },
        update: { value },
      }),
    ),
  )
}

/** Today's plan: when each conversation is due, and how many have run. */
interface DayState {
  date: string
  perDay: number
  slots: string[]
  done: number
}

function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
}

const randomBetween = (low: number, high: number): number =>
  low + Math.floor(Math.random() * (high - low + 1))

/**
 * Spread `count` start times at random over the rest of today's permitted
 * minutes. Planning from "now" rather than midnight means an app opened in the
 * afternoon does not fire the whole morning's backlog at once.
 */
function planSlots(
  count: number,
  window: { start: number; end: number } | null,
  now: Date,
): string[] {
  const nowMinute = now.getHours() * 60 + now.getMinutes()
  const allowed: number[] = []
  for (let m = nowMinute + 1; m < 24 * 60; m += 1) {
    const at = new Date(now)
    at.setHours(Math.floor(m / 60), m % 60, 0, 0)
    const permitted = window ? !inQuietHours(window, at) : m >= DAY_START && m < DAY_END
    if (permitted) allowed.push(m)
  }
  const picked = new Set<number>()
  while (picked.size < Math.min(count, allowed.length)) {
    picked.add(allowed[randomBetween(0, allowed.length - 1)] ?? 0)
  }
  return [...picked]
    .sort((a, b) => a - b)
    .map((m) => {
      const at = new Date(now)
      at.setHours(Math.floor(m / 60), m % 60, randomBetween(0, 59), 0)
      return at.toISOString()
    })
}

async function readState(): Promise<DayState | null> {
  const row = await getPrisma().setting.findUnique({ where: { key: KEY_STATE } })
  if (!row) return null
  try {
    return JSON.parse(row.value) as DayState
  } catch (err) {
    // A corrupt plan is only a schedule; replanning today loses nothing.
    console.debug('warmup: stored plan unreadable, replanning', err)
    return null
  }
}

async function writeState(state: DayState): Promise<void> {
  const value = JSON.stringify(state)
  await getPrisma().setting.upsert({
    where: { key: KEY_STATE },
    create: { key: KEY_STATE, value, isEncrypted: false },
    update: { value },
  })
}

/** Same rollover as the campaign engine's counter, so the cap survives restarts. */
async function bumpDailyCount(deviceId: string): Promise<void> {
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

type Peer = { id: string; phone: string }

/** Connected, unpaused warmup devices with a known number — distinct numbers only. */
async function warmupPeers(now: Date): Promise<Peer[]> {
  const rows = await getPrisma().device.findMany({
    where: {
      warmupEnabled: true,
      status: 'connected',
      phone: { not: null },
      OR: [{ healthPausedUntil: null }, { healthPausedUntil: { lt: now } }],
    },
    select: { id: true, phone: true },
    take: 20,
  })
  const seen = new Set<string>()
  const peers: Peer[] = []
  for (const r of rows) {
    if (!r.phone) continue
    const phone = r.phone.startsWith('+') ? r.phone : `+${r.phone.replace(/\D/g, '')}`
    if (seen.has(phone)) continue
    seen.add(phone)
    peers.push({ id: r.id, phone })
  }
  return peers
}

let lastScript = -1

function pickScript(): readonly string[] {
  let index = randomBetween(0, WARMUP_SCRIPTS.length - 1)
  if (index === lastScript) index = (index + 1) % WARMUP_SCRIPTS.length
  lastScript = index
  const script = WARMUP_SCRIPTS[index] ?? WARMUP_SCRIPTS[0] ?? []
  return script.slice(0, randomBetween(2, Math.min(4, script.length)))
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One exchange between two of the user's own devices. `to` is always the
 * other device's own number — warmup never messages anyone else.
 */
async function converse(a: Peer, b: Peer, pause: boolean): Promise<void> {
  const lines = pickScript()
  for (let turn = 0; turn < lines.length; turn += 1) {
    const [from, to] = turn % 2 === 0 ? [a, b] : [b, a]
    try {
      await waBridge.request('message:send', {
        deviceId: from.id,
        to: to.phone,
        message: { kind: 'text', body: lines[turn] ?? '' },
      })
      await bumpDailyCount(from.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Hitting the cap or quiet hours mid-conversation simply ends it; it is
      // not a fault, and the next planned slot tries again.
      if (isParkingError(message)) console.debug('warmup: conversation parked', message)
      else console.warn('warmup: conversation stopped after a failed send', message)
      return
    }
    if (pause && turn < lines.length - 1) {
      await sleep(randomBetween(PAUSE_MIN_MS, PAUSE_MAX_MS))
    }
  }
  console.info(`warmup: exchanged ${lines.length} messages between two own devices`)
}

let conversing = false
let forceUsed = false

/** E2E seam: run one conversation now, no pauses. Ignored outside tests. */
function forced(): boolean {
  return (
    process.env.NODE_ENV === 'test' && process.env.RB_WARMUP_FORCE === '1' && !forceUsed
  )
}

export async function warmupTick(): Promise<void> {
  if (conversing) return
  const config = await readWarmupConfig()
  if (!config.autoConversations) return

  const now = new Date()
  const window = quietWindow(await readSendingDefaults())
  if (inQuietHours(window, now)) return

  const peers = await warmupPeers(now)
  if (peers.length < 2) return

  const today = localDate(now)
  let state = await readState()
  if (!state || state.date !== today || state.perDay !== config.conversationsPerDay) {
    const done = state?.date === today ? state.done : 0
    state = {
      date: today,
      perDay: config.conversationsPerDay,
      done,
      slots: planSlots(Math.max(0, config.conversationsPerDay - done), window, now),
    }
    // Slots are indexed from `done`, so pad the ones already used.
    state.slots = [...Array<string>(done).fill(now.toISOString()), ...state.slots]
    await writeState(state)
  }

  const force = forced()
  const due = state.slots[state.done]
  if (!force && (state.done >= config.conversationsPerDay || !due || new Date(due) > now))
    return

  if (force) forceUsed = true
  state.done += 1
  await writeState(state)

  const first = randomBetween(0, peers.length - 1)
  let second = randomBetween(0, peers.length - 2)
  if (second >= first) second += 1
  const a = peers[first]
  const b = peers[second]
  if (!a || !b) return

  // NOTE: a conversation spans minutes of pauses. Running it inline would hold
  // the shared scheduler tick — and every other job — for that long, so it
  // runs alongside; `conversing` keeps it to one at a time.
  conversing = true
  void converse(a, b, !force)
    .catch((err: unknown) => console.error('warmup: conversation failed', err))
    .finally(() => {
      conversing = false
    })
}
