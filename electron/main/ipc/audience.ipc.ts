/**
 * Tags, opt-out list, number verification and Google Sheets import (D89).
 *
 * Split by domain under ./audience so each module keeps one responsibility.
 */
import { registerNumberHandlers } from './audience/numbers'
import { registerSuppressionHandlers } from './audience/suppression'
import { registerTagHandlers } from './audience/tags'

export function registerAudienceHandlers(): void {
  registerTagHandlers()
  registerSuppressionHandlers()
  registerNumberHandlers()
}
