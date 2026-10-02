import { inQuietHours } from '../../shared/quiet-hours'

/**
 * Send pacing — the anti-ban core (SPRINTS.md §6.1, CLAUDE.md §5.4).
 *
 * WHY it lives in wa-service rather than in the caller: this is the last gate
 * before the socket, so nothing can bypass it. A campaign worker, a group
 * runner, an inbox reply and an AI auto-reply all end up here, and a bug in any
 * one of them still cannot flood WhatsApp. Pacing enforced at the call site
 * would only be as good as the least careful caller.
 *
 * Per device it enforces, in order:
 *   1. quiet hours (automated sends only)
 *   2. the daily cap (automated sends only)
 *   3. a sleep pause after every N messages
 *   4. a random delay drawn fresh for each send
 *   5. "typing…"/"recording…" before the send, when enabled
 *   6. strictly one in-flight message
 *
 * A *manual* send — a person replying in the inbox — skips 1 and 2 (D89): the
 * caps and quiet hours exist to stop automation from looking like a spammer,
 * and blocking a human mid-conversation would only push them to reply from
 * their phone instead. It still queues behind in-flight automation and still
 * counts toward today's total.
 *
 * Concurrency comes from running several devices, never from parallel sends on
 * one account — that is the fastest route to a ban.
 */

export interface ThrottleConfig {
  delayFromMs: number
  delayToMs: number
  sleepDurationMs: number
  sleepAfter: number
  /** 0 means unlimited. */
  dailyCap: number
  /** Minutes after local midnight. start > end wraps midnight (21:00–09:00). */
  quietHours: { start: number; end: number } | null
  simulateTyping: boolean
}

export const DEFAULT_THROTTLE: ThrottleConfig = {
  delayFromMs: 0,
  delayToMs: 5_000,
  sleepDurationMs: 10_000,
  sleepAfter: 10,
  dailyCap: 0,
  quietHours: null,
  simulateTyping: false,
}

/** Thrown for automated sends inside the quiet-hours window; the caller parks. */
export class QuietHoursError extends Error {
  constructor(deviceId: string) {
    super(`device ${deviceId} is in quiet hours`)
    this.name = 'QuietHoursError'
  }
}

export interface RunOptions {
  /** A person's inbox reply: exempt from quiet hours and the daily cap. */
  manual?: boolean
  /** Who sees the typing indicator, and which kind, when simulation is on. */
  typing?: { to: string; state: 'composing' | 'recording'; chars: number }
}

type PresenceFn = (
  deviceId: string,
  to: string,
  state: 'composing' | 'recording' | 'paused',
) => Promise<void>

/**
 * How long "typing…" shows: roughly a fast typist, bounded so a long template
 * does not hold the device for half a minute.
 */
export function typingMs(chars: number): number {
  return Math.min(6_000, 1_200 + chars * 35)
}

export class DailyCapReachedError extends Error {
  constructor(deviceId: string, cap: number) {
    super(`device ${deviceId} reached its daily cap of ${cap}`)
    this.name = 'DailyCapReachedError'
  }
}

interface DeviceState {
  config: ThrottleConfig
  sentSinceSleep: number
  sentToday: number
  dayStamp: string
  /** Serializes sends: each waits for the previous one to finish. */
  chain: Promise<void>
}

const localDay = (now: Date): string =>
  `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`

const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))

export class ThrottleScheduler {
  private readonly devices = new Map<string, DeviceState>()
  /** Injectable so tests can assert pacing without waiting in real time. */
  constructor(
    private readonly wait: (ms: number) => Promise<void> = sleep,
    private readonly presence?: PresenceFn,
  ) {}

  configure(deviceId: string, config: Partial<ThrottleConfig>): void {
    const state = this.state(deviceId)
    state.config = { ...state.config, ...config }
  }

  private state(deviceId: string): DeviceState {
    let state = this.devices.get(deviceId)
    if (!state) {
      state = {
        config: { ...DEFAULT_THROTTLE },
        sentSinceSleep: 0,
        sentToday: 0,
        dayStamp: localDay(new Date()),
        chain: Promise.resolve(),
      }
      this.devices.set(deviceId, state)
    }
    return state
  }

  /**
   * Restore today's count after a restart, so the cap survives one.
   *
   * Rolls the day over first. Without that, a seed value carried across
   * midnight would be treated as today's usage and could exhaust the cap
   * against sends that happened yesterday. The caller is expected to pass a
   * count for the current day, but this is the layer that enforces the cap, so
   * it does not rely on that.
   */
  seed(deviceId: string, sentToday: number): void {
    const state = this.state(deviceId)
    this.rollDay(state)
    state.sentToday = sentToday
  }

  sentToday(deviceId: string): number {
    const state = this.state(deviceId)
    this.rollDay(state)
    return state.sentToday
  }

  private rollDay(state: DeviceState): void {
    const today = localDay(new Date())
    if (state.dayStamp !== today) {
      state.dayStamp = today
      state.sentToday = 0
    }
  }

  /**
   * Run `task` under this device's pacing rules.
   *
   * Returning the task's value rather than a permit means a caller cannot
   * acquire and then forget to release, which would wedge the device forever.
   */
  async run<T>(
    deviceId: string,
    task: () => Promise<T>,
    options: RunOptions = {},
  ): Promise<T> {
    const state = this.state(deviceId)

    // Queue behind whatever this device is already doing. This is what
    // guarantees one in-flight message per account.
    const previous = state.chain
    let release!: () => void
    state.chain = new Promise<void>((resolve) => {
      release = resolve
    })

    await previous.catch(() => {
      // A failed predecessor must not block the queue.
    })

    try {
      this.rollDay(state)

      const { dailyCap, sleepAfter, sleepDurationMs, delayFromMs, delayToMs } =
        state.config

      if (!options.manual && inQuietHours(state.config.quietHours)) {
        throw new QuietHoursError(deviceId)
      }
      if (!options.manual && dailyCap > 0 && state.sentToday >= dailyCap) {
        throw new DailyCapReachedError(deviceId, dailyCap)
      }

      if (sleepAfter > 0 && state.sentSinceSleep >= sleepAfter) {
        await this.wait(sleepDurationMs)
        state.sentSinceSleep = 0
      }

      const low = Math.min(delayFromMs, delayToMs)
      const high = Math.max(delayFromMs, delayToMs)
      await this.wait(low + Math.random() * (high - low))

      const typing =
        !options.manual && state.config.simulateTyping && this.presence
          ? options.typing
          : undefined
      if (typing && this.presence) {
        // Best effort: a presence update that fails must never cost the send.
        await this.presence(deviceId, typing.to, typing.state).catch((err: unknown) =>
          console.debug('throttle: presence update failed', err),
        )
        await this.wait(typingMs(typing.chars))
      }

      let result: T
      try {
        result = await task()
      } finally {
        if (typing && this.presence) {
          await this.presence(deviceId, typing.to, 'paused').catch((err: unknown) =>
            console.debug('throttle: presence reset failed', err),
          )
        }
      }

      // Counted only on success: a failed send did not reach WhatsApp, so it
      // must not consume the user's daily allowance.
      state.sentSinceSleep += 1
      state.sentToday += 1
      return result
    } finally {
      release()
    }
  }

  reset(deviceId: string): void {
    this.devices.delete(deviceId)
  }
}
