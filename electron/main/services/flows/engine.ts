/**
 * The chatbot flow engine (Wave 3): runs visual menu flows before keyword rules
 * and the AI bot.
 */
import type { InboundContext } from '../inbound'

/** Advance the chat's active flow, or start one whose trigger matches. True = answered. */
export async function tryFlow(ctx: InboundContext): Promise<boolean> {
  void ctx
  return false
}

/** Drop sessions whose customer stopped answering. Called by the scheduler. */
export async function flowTick(): Promise<void> {}
