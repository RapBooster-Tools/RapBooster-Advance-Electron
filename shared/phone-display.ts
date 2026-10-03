/**
 * Showing phone numbers that WhatsApp may have hidden (D129).
 *
 * A person WhatsApp addresses only by LID, with no number shared yet, is
 * stored with the LID JID (`<id>@lid`) in place of a phone. It is never a
 * number, so it is never shown as one: the UI says the number is hidden, and
 * main replaces it with the real number as soon as WhatsApp reveals it.
 */

export const HIDDEN_NUMBER_LABEL = 'Number hidden by WhatsApp'

export function isHiddenPhone(phone: string | null | undefined): boolean {
  return typeof phone === 'string' && phone.endsWith('@lid')
}

/** The phone as it should appear on screen. */
export function displayPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  return isHiddenPhone(phone) ? HIDDEN_NUMBER_LABEL : phone
}
