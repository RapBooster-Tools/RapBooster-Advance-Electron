/**
 * Settings channels.
 *
 * Encrypted values are write-only from the renderer's point of view: they can
 * be set, and the app can tell you whether one is set, but `settings:get` never
 * hands a secret back. A key that can be read out of the UI is a key that ends
 * up in a screenshot, a support bundle, or a bug report.
 */
import { AppError } from '../../../shared/errors'
import { getPrisma } from '../db/client'
import { encryptValue } from '../services/secure-store'
import {
  applyAllDevicePolicies,
  dailyCapPerDevice,
  readSendingDefaults,
  writeSendingDefaults,
} from '../services/sending-policy'
import { registerHandler } from './router'

/** Keys whose values must never be returned to the renderer. */
const SECRET_KEY = /key|token|secret|password/i

/** Re-exported for existing callers; the policy itself lives in sending-policy.ts. */
export { dailyCapPerDevice }

export function registerSettingsHandlers(): void {
  registerHandler('settings:get', async ({ key }) => {
    const row = await getPrisma().setting.findUnique({ where: { key } })
    if (!row) return { value: null }

    // Never return a secret, even encrypted — the renderer has no legitimate
    // use for it, and the only thing it could do is leak it.
    if (row.isEncrypted || SECRET_KEY.test(key)) {
      return { value: row.value.length > 0 ? '••••••••' : null }
    }
    return { value: row.value }
  })

  registerHandler('settings:set', async ({ key, value, encrypt }) => {
    const shouldEncrypt = encrypt || SECRET_KEY.test(key)

    // Record what actually happened, not what was intended. When the OS keychain
    // is unavailable `encryptValue` falls back to storing the value in the clear,
    // and writing `isEncrypted: shouldEncrypt` claimed it was encrypted anyway —
    // so the database asserted a protection the value did not have, and nothing
    // could tell the difference afterwards.
    const result = shouldEncrypt
      ? encryptValue(value)
      : { data: value, encrypted: false as const }

    await getPrisma().setting.upsert({
      where: { key },
      create: { key, value: result.data, isEncrypted: result.encrypted },
      update: { value: result.data, isEncrypted: result.encrypted },
    })

    // The renderer needs this to warn the user. CLAUDE.md §5.6 requires an
    // explicit degrade rather than silent plaintext, and a secret stored in the
    // clear is something the user must be able to act on.
    return {
      ok: true as const,
      encrypted: result.encrypted,
      wantedEncryption: shouldEncrypt,
    }
  })

  registerHandler('settings:getSendingDefaults', () => readSendingDefaults())

  registerHandler('settings:setSendingDefaults', async (patch) => {
    const input = { ...(await readSendingDefaults()), ...patch }
    if (input.delayFrom > input.delayTo) {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'The delay range starts after it ends — swap the two values.',
      })
    }
    if (input.quietHoursEnabled && input.quietHoursStart === input.quietHoursEnd) {
      throw new AppError('VALIDATION_FAILED', {
        userMessage:
          'Quiet hours start and end at the same time — pick two different times.',
      })
    }
    await writeSendingDefaults(input)
    // Every device's throttle picks up the change now, not at the next campaign.
    await applyAllDevicePolicies()
    return input
  })
}
