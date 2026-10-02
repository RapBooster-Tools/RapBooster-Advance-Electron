/**
 * The opt-out (suppression) list (IMPROVEMENT-PLAN.md Phase 2).
 */
import { getPrisma } from '../db/client'
import type { InboundContext } from './inbound'

/** Which of these E.164 numbers are suppressed. One query, any batch size ≤ 1,000. */
export async function suppressedPhones(phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set()
  const rows = await getPrisma().suppression.findMany({
    where: { phone: { in: phones } },
    select: { phone: true },
  })
  return new Set(rows.map((r) => r.phone))
}

export async function isSuppressed(phone: string): Promise<boolean> {
  return (await suppressedPhones([phone])).size > 0
}

/**
 * Handle an inbound opt-out keyword. Returns true when the message was an
 * opt-out and nothing else should answer it.
 */
export async function handleOptOut(ctx: InboundContext): Promise<boolean> {
  void ctx
  return false
}
