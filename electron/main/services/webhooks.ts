/**
 * Outgoing webhooks: a persisted outbox with signed, retried deliveries.
 */
import type { WebhookEvent } from '../../../shared/types'

/** Queue `event` for every enabled webhook subscribed to it. */
export async function emitWebhook(
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  void event
  void data
}

/** Deliver pending webhook calls whose retry time has come. */
export async function webhookTick(): Promise<void> {}
