/**
 * Rule-based auto-replies, evaluated before the AI bot.
 */
import type { InboundContext } from './inbound'

/** Answer the message if a rule matches. Returns true when a rule replied. */
export async function tryKeywordReply(ctx: InboundContext): Promise<boolean> {
  void ctx
  return false
}
