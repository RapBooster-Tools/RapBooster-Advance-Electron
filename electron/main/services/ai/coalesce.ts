/**
 * Reply coalescing (D89): a customer who types three short messages in a row
 * should get one answer that reads all three, not three answers.
 *
 * Each inbound message takes a ticket for its chat and waits. Only the newest
 * ticket survives the wait; older ones stand down, and the survivor's history
 * query naturally includes every message of the burst.
 *
 * NOTE: this is deliberately in memory. It only decides which of several
 * concurrent responder calls proceeds; nothing about it needs to survive a
 * restart, and a restart mid-wait at worst leaves one burst unanswered by the
 * bot — never answered twice.
 */

export interface Ticket {
  chatId: string
  seq: number
}

const latest = new Map<string, number>()
let counter = 0

export function takeTicket(chatId: string): Ticket {
  counter += 1
  latest.set(chatId, counter)
  return { chatId, seq: counter }
}

/** False once a newer message in the same chat has taken over. */
export function isCurrent(ticket: Ticket): boolean {
  return latest.get(ticket.chatId) === ticket.seq
}

/** Forget a finished ticket so the map does not grow with every chat ever seen. */
export function release(ticket: Ticket): void {
  if (isCurrent(ticket)) latest.delete(ticket.chatId)
}

/** Wait out the window; true when this ticket is still the newest afterwards. */
export async function waitForQuiet(ticket: Ticket, seconds: number): Promise<boolean> {
  if (seconds > 0) await new Promise((r) => setTimeout(r, seconds * 1_000))
  return isCurrent(ticket)
}
