/**
 * Welcome and away messages (Wave 3).
 */
import type { InboundContext } from './inbound'

/** Welcome on a chat's first message; away outside business hours. Never blocks later steps. */
export async function sendWelcomeOrAway(ctx: InboundContext): Promise<void> {
  void ctx
}
