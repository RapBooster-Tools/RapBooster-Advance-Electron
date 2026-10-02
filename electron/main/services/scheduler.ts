/**
 * One clock for every time-driven job: scheduled campaigns, parked campaigns,
 * drip sequences, status/channel posts, webhook retries, warmup conversations
 * and AI replies held by quiet hours.
 *
 * WHY one interval rather than one per feature: each job compares against the
 * wall clock and reads its state from SQLite, so a single tick is enough, a
 * laptop that slept still catches up on wake, and there is exactly one timer to
 * stop on shutdown. Jobs run one after another so they never compete for the
 * database's write lock.
 */

type Job = { name: string; run: () => Promise<void> }

const jobs: Job[] = []
let timer: NodeJS.Timeout | undefined
let running = false

/**
 * Tick period. One minute in production. E2E may shorten it with RB_TICK_MS so
 * time-driven specs do not wait a minute per step; ignored outside tests.
 */
function tickMs(): number {
  const override = Number(process.env.RB_TICK_MS)
  return process.env.NODE_ENV === 'test' && Number.isFinite(override) && override >= 200
    ? override
    : 60_000
}

export function registerJob(name: string, run: () => Promise<void>): void {
  jobs.push({ name, run })
}

async function tick(): Promise<void> {
  // A slow tick must not overlap the next one.
  if (running) return
  running = true
  try {
    for (const job of jobs) {
      try {
        await job.run()
      } catch (err) {
        console.error(`scheduler: ${job.name} failed`, err)
      }
    }
  } finally {
    running = false
  }
}

export function startScheduler(): void {
  if (timer) return
  timer = setInterval(() => void tick(), tickMs())
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer)
  timer = undefined
}

/** Run every job once now — used after boot so nothing waits a full period. */
export function tickNow(): Promise<void> {
  return tick()
}
