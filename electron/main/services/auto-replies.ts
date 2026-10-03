/**
 * Welcome and away messages (Wave 3).
 *
 * Welcome: once per chat, on the customer's very first message. Away: when a
 * message arrives outside the business hours set for that weekday, at most once
 * per cooldown per chat. Both are sent alongside — never instead of — whatever
 * the flows, rules or bot answer next.
 *
 * Neither reaches a group, a chat that opted out of automatic replies, or a
 * suppressed number. Each goes through the throttle; quiet hours or the daily
 * cap park it, and a parked welcome or away message is dropped with a log —
 * arriving hours later it would no longer make sense.
 *
 * WHY the claim-then-send stamps: two messages from a new chat can arrive
 * together. Stamping `welcomedAt` / `lastAwayAt` with a conditional update
 * first means only one of them can win, so nobody is welcomed twice.
 */
import { autoReplyConfig } from '../../../shared/contract/workspace'
import type { IpcResponse } from '../../../shared/ipc'
import { renderTemplate } from '../../../shared/merge-tags'
import { getPrisma } from '../db/client'
import { sendBotMessage } from './ai/bot-send'
import { chatMergeValues, chatPhone, isFirstInbound } from './flows/merge-values'
import type { InboundContext } from './inbound'
import { toast } from './notify'
import { isSuppressed } from './optout'
import { isParkingError } from './sending-policy'

export type AutoReplyConfig = IpcResponse<'autoreply:getConfig'>
type WeeklyHours = AutoReplyConfig['away']['hours']
type Weekday = keyof WeeklyHours

const SETTING_KEY = 'autoreply.config'
const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const OFFICE = [{ start: '09:00', end: '18:00' }]

export const DEFAULT_AUTOREPLY_CONFIG: AutoReplyConfig = {
  welcome: {
    enabled: false,
    text: 'Hi {{Name}}, thanks for getting in touch! We will reply shortly.',
  },
  away: {
    enabled: false,
    text: "Thanks for your message! We're closed right now and will reply as soon as we're back.",
    hours: {
      mon: OFFICE,
      tue: OFFICE,
      wed: OFFICE,
      thu: OFFICE,
      fri: OFFICE,
      sat: [],
      sun: [],
    },
    cooldownHours: 12,
  },
}

let cached: AutoReplyConfig | undefined

export async function readAutoReplyConfig(): Promise<AutoReplyConfig> {
  if (cached) return cached
  const row = await getPrisma().setting.findUnique({ where: { key: SETTING_KEY } })
  let config = DEFAULT_AUTOREPLY_CONFIG
  if (row) {
    try {
      const parsed = autoReplyConfig.safeParse(JSON.parse(row.value))
      if (parsed.success) config = parsed.data
      else console.warn('auto-replies: stored config is invalid; using defaults')
    } catch (err) {
      // Defaults are both switched off, so a corrupt value fails quiet, not loud.
      console.warn('auto-replies: stored config is not JSON; using defaults', err)
    }
  }
  cached = config
  return config
}

export async function writeAutoReplyConfig(config: AutoReplyConfig): Promise<void> {
  const value = JSON.stringify(config)
  await getPrisma().setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value },
    update: { value },
  })
  cached = undefined
}

function minutes(clock: string): number {
  const [h, m] = clock.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Is the business open at `at`, local time? A day with no ranges is closed. */
export function isOpenAt(hours: WeeklyHours, at: Date): boolean {
  const ranges = hours[WEEKDAYS[at.getDay()] ?? 'sun']
  const now = at.getHours() * 60 + at.getMinutes()
  return ranges.some((r) => now >= minutes(r.start) && now < minutes(r.end))
}

/** Plain-English problem with the hours, or null. Ranges must not wrap midnight. */
export function hoursProblem(hours: WeeklyHours): string | null {
  const names: Record<Weekday, string> = {
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday',
  }
  for (const day of Object.keys(names) as Weekday[]) {
    for (const range of hours[day]) {
      if (minutes(range.end) <= minutes(range.start)) {
        return `On ${names[day]}, the closing time must be later than the opening time.`
      }
    }
  }
  return null
}

/** Send, reporting a parked message as "not sent" rather than an error. */
async function deliver(
  ctx: InboundContext,
  label: string,
  text: string,
): Promise<boolean> {
  try {
    // Quiet hours do not hold these: an away message is for exactly the hours
    // the business is closed (D151). The daily cap still applies.
    await sendBotMessage(
      ctx.deviceId,
      ctx.chatId,
      { kind: 'text', body: text },
      { reply: true },
    )
    return true
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    if (isParkingError(detail)) {
      console.info(`auto-replies: ${label} message not sent — ${detail}`)
    } else {
      console.error(`auto-replies: ${label} message failed`, detail)
      toast('error', `The ${label} message could not be sent.`)
    }
    return false
  }
}

async function sendWelcome(ctx: InboundContext, text: string): Promise<void> {
  if (!(await isFirstInbound(ctx.chatId))) return
  const prisma = getPrisma()
  const at = new Date()
  const claimed = await prisma.chat.updateMany({
    where: { id: ctx.chatId, welcomedAt: null },
    data: { welcomedAt: at },
  })
  if (claimed.count === 0) return
  // Not un-stamped on failure: the next message is no longer the first, and a
  // welcome arriving mid-conversation would read as a glitch.
  await deliver(ctx, 'welcome', text)
}

async function sendAway(
  ctx: InboundContext,
  text: string,
  cooldownHours: number,
  previous: Date | null,
): Promise<void> {
  const prisma = getPrisma()
  const at = new Date()
  const cutoff = new Date(at.getTime() - cooldownHours * 3_600_000)
  const claimed = await prisma.chat.updateMany({
    where: {
      id: ctx.chatId,
      OR: [{ lastAwayAt: null }, { lastAwayAt: { lte: cutoff } }],
    },
    data: { lastAwayAt: at },
  })
  if (claimed.count === 0) return
  if (await deliver(ctx, 'away', text)) return
  // Not sent, so not a cooldown: the customer's next message may try again.
  await prisma.chat.updateMany({
    where: { id: ctx.chatId, lastAwayAt: at },
    data: { lastAwayAt: previous },
  })
}

async function welcomeOrAway(ctx: InboundContext): Promise<void> {
  const config = await readAutoReplyConfig()
  const { welcome, away } = config
  if (!welcome.enabled && !away.enabled) return

  const chat = await getPrisma().chat.findUnique({
    where: { id: ctx.chatId },
    select: {
      name: true,
      phone: true,
      isGroup: true,
      autoReplyOptOut: true,
      welcomedAt: true,
      lastAwayAt: true,
    },
  })
  if (!chat || chat.isGroup || chat.autoReplyOptOut) return
  if (await isSuppressed(chatPhone(ctx.phone))) return

  const values = await chatMergeValues(chat)
  const render = (text: string) => renderTemplate(text, values).text.trim()

  const welcomeText = render(welcome.text)
  if (welcome.enabled && !chat.welcomedAt && welcomeText !== '') {
    await sendWelcome(ctx, welcomeText)
  }

  const awayText = render(away.text)
  if (away.enabled && awayText !== '' && !isOpenAt(away.hours, new Date())) {
    await sendAway(ctx, awayText, away.cooldownHours, chat.lastAwayAt)
  }
}

/** Welcome on a chat's first message; away outside business hours. Never blocks later steps. */
export async function sendWelcomeOrAway(ctx: InboundContext): Promise<void> {
  if (ctx.isGroup) return
  try {
    await welcomeOrAway(ctx)
  } catch (err) {
    // Never thrown into the inbound pipeline: the flows, rules and bot after
    // this step must still answer the customer.
    console.error('auto-replies: welcome/away step failed', err)
  }
}
