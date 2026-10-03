/**
 * Keyword auto-replies, webhooks and call handling (D89).
 *
 * Split by domain under ./automation so no module outgrows one responsibility.
 */
import { registerCallHandlers } from './automation/calls'
import { registerRuleHandlers } from './automation/rules'
import { registerWebhookHandlers } from './automation/webhooks'

export function registerAutomationHandlers(): void {
  registerRuleHandlers()
  registerWebhookHandlers()
  registerCallHandlers()
}
