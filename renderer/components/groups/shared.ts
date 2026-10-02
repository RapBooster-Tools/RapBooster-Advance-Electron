import type { IpcResponse } from '@shared/ipc'

export type GroupRow = IpcResponse<'group:list'>[number]
export type CommunityRow = IpcResponse<'community:list'>[number]

export const inputClass =
  'rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary disabled:bg-app-bg'

const E164 = /^\+[1-9]\d{6,14}$/

/**
 * Split pasted numbers (one per line, or separated by commas/spaces) into the
 * ones the contract accepts and the ones it would refuse, so a single typo
 * does not reject the whole batch.
 */
export function splitPhones(text: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = []
  const invalid: string[] = []
  for (const raw of text.split(/[\s,;]+/)) {
    const value = raw.trim()
    if (value === '') continue
    const compact = value.replace(/[()-]/g, '')
    if (E164.test(compact)) {
      if (!valid.includes(compact)) valid.push(compact)
    } else {
      invalid.push(value)
    }
  }
  return { valid, invalid }
}

export const NOT_ADMIN_REASON =
  'This account is not an admin of this group. WhatsApp only lets admins change settings, manage members, answer join requests or see the invite link.'
