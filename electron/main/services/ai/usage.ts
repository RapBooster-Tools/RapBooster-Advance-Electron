/**
 * AI usage accounting and daily caps (D89).
 *
 * Every model call is recorded as an AiUsage row, and the caps are counted from
 * those rows rather than an in-memory counter — so they survive a restart, and
 * the usage panel and the cap can never disagree.
 */
import type { IpcResponse } from '../../../../shared/ipc'
import type { AiProvider } from '../../../../shared/types'
import { getPrisma } from '../../db/client'
import { toast } from '../notify'

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export async function recordUsage(entry: {
  deviceId: string
  chatId: string
  provider: AiProvider
  model: string
  promptTokens: number
  completionTokens: number
}): Promise<void> {
  await getPrisma().aiUsage.create({ data: entry })
}

/**
 * The cap that blocks a call right now, or null. 0 means unlimited.
 *
 * Two indexed counts — `(deviceId, createdAt)` and `(chatId, createdAt)`.
 */
export async function capReached(
  deviceId: string,
  chatId: string,
  caps: { dailyCapPerDevice: number; dailyCapPerChat: number },
): Promise<'device' | 'chat' | null> {
  const since = { gte: startOfToday() }
  const prisma = getPrisma()
  if (caps.dailyCapPerDevice > 0) {
    const used = await prisma.aiUsage.count({ where: { deviceId, createdAt: since } })
    if (used >= caps.dailyCapPerDevice) return 'device'
  }
  if (caps.dailyCapPerChat > 0) {
    const used = await prisma.aiUsage.count({ where: { chatId, createdAt: since } })
    if (used >= caps.dailyCapPerChat) return 'chat'
  }
  return null
}

const toasted = new Set<string>()

/**
 * Tell the user once per device per day that the bot has gone quiet. Every
 * further message that day would repeat the same toast and bury everything else.
 */
export function toastCapOnce(deviceId: string, which: 'device' | 'chat'): void {
  const key = `${deviceId}:${dayKey(new Date())}`
  if (toasted.has(key)) return
  toasted.add(key)
  toast(
    'warning',
    which === 'device'
      ? 'The AI daily reply limit for a device was reached. Auto-replies resume tomorrow.'
      : 'A chat reached its AI daily reply limit. That chat gets no more auto-replies today.',
  )
}

type Totals = IpcResponse<'ai:usage'>['today']

async function totals(from: Date, to?: Date): Promise<Totals> {
  const agg = await getPrisma().aiUsage.aggregate({
    where: { createdAt: { gte: from, ...(to ? { lt: to } : {}) } },
    _count: { _all: true },
    _sum: { promptTokens: true, completionTokens: true },
  })
  return {
    calls: agg._count._all,
    promptTokens: agg._sum.promptTokens ?? 0,
    completionTokens: agg._sum.completionTokens ?? 0,
  }
}

/** Today, this calendar month, and the last seven days (oldest first). */
export async function usageReport(): Promise<IpcResponse<'ai:usage'>> {
  const today = startOfToday()
  const month = new Date(today.getFullYear(), today.getMonth(), 1)

  const days = await Promise.all(
    Array.from({ length: 7 }, async (_, i) => {
      const from = new Date(today)
      from.setDate(today.getDate() - (6 - i))
      const to = new Date(from)
      to.setDate(from.getDate() + 1)
      return { date: dayKey(from), ...(await totals(from, to)) }
    }),
  )

  return { today: await totals(today), month: await totals(month), days }
}
