/**
 * Group membership: list, add/remove/promote/demote, and join requests (D89).
 */
import type { GroupMemberAction } from '../../../../shared/types'
import { AppError } from '../../../../shared/errors'
import { getPrisma } from '../../db/client'
import { applyMetadata, phoneDigits, phoneJid } from '../../services/group-meta'
import { suppressedPhones } from '../../services/optout'
import { normalizePhone } from '../../services/phone'
import { waBridge } from '../../wa-bridge'
import { registerHandler } from '../router'
import { reasonOf, requireGroup, waCall } from './shared'

/** WhatsApp accepts larger participant updates, but refuses them more often. */
const PARTICIPANT_BATCH = 20
/** suppressedPhones() takes one IN (…) per call; keep it under SQLite's limits. */
const SUPPRESSION_BATCH = 1_000

interface MemberResult {
  phone: string
  ok: boolean
  error: string | null
}

const ACTION_VERB: Record<GroupMemberAction, string> = {
  add: 'add members',
  remove: 'remove members',
  promote: 'promote members',
  demote: 'demote members',
}

/**
 * Re-read a group's metadata after a membership change so the cached member
 * count is WhatsApp's, not our arithmetic. Best effort: the change itself has
 * already happened, and the next sync corrects the count anyway.
 */
async function refreshGroup(deviceId: string, groupId: string, ownPhone: string | null) {
  try {
    const metadata = await waBridge.request('group:metadata', { deviceId, groupId })
    await applyMetadata(deviceId, metadata, ownPhone)
  } catch (err) {
    console.warn('group metadata refresh failed after a membership change', err)
  }
}

/**
 * The phones to act on: the explicit ones, then the list's contacts, each
 * normalized, de-duplicated and capped at `max` in total.
 */
async function collectTargets(
  phones: string[],
  listId: string | undefined,
  max: number,
): Promise<{ targets: string[]; rejected: MemberResult[] }> {
  const raw = [...phones]
  if (listId) {
    const list = await getPrisma().contactList.findUnique({ where: { id: listId } })
    if (!list)
      throw new AppError('NOT_FOUND', {
        userMessage: 'That contact list no longer exists.',
      })
    const contacts = await getPrisma().contact.findMany({
      where: { listId, isValid: true },
      orderBy: { id: 'asc' },
      take: max,
      select: { phone: true },
    })
    raw.push(...contacts.map((c) => c.phone))
  }

  const targets: string[] = []
  const rejected: MemberResult[] = []
  const seen = new Set<string>()
  for (const input of raw) {
    if (targets.length >= max) break
    const normalized = normalizePhone(input)
    if (!normalized.e164 || !normalized.valid) {
      rejected.push({
        phone: input,
        ok: false,
        error: normalized.reason ?? 'invalid number',
      })
      continue
    }
    const key = phoneDigits(normalized.e164)
    if (seen.has(key)) continue
    seen.add(key)
    targets.push(normalized.e164)
  }
  return { targets, rejected }
}

async function suppressedAmong(phones: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < phones.length; i += SUPPRESSION_BATCH) {
    for (const phone of await suppressedPhones(phones.slice(i, i + SUPPRESSION_BATCH)))
      out.add(phone)
  }
  return out
}

export function registerGroupMemberHandlers(): void {
  registerHandler('group:members', async ({ groupId }) => {
    const { device } = await requireGroup(groupId)
    const metadata = await waCall(
      'group:metadata',
      { deviceId: device.id, groupId },
      'load the members',
    )
    await applyMetadata(device.id, metadata, device.phone)
    return metadata.participants.map((p) => ({
      jid: p.jid,
      phone: p.phone,
      isAdmin: p.isAdmin,
    }))
  })

  registerHandler(
    'group:updateMembers',
    async ({ groupId, action, phones, listId, max }) => {
      const { device } = await requireGroup(groupId, {
        admin: true,
        action: ACTION_VERB[action],
      })
      if (phones.length === 0 && !listId) {
        throw new AppError('VALIDATION_FAILED', {
          userMessage: 'Enter at least one phone number or choose a contact list.',
        })
      }

      const { targets, rejected } = await collectTargets(phones, listId, max)
      const results: MemberResult[] = [...rejected]

      // Opted-out people asked not to be contacted; adding them to a group is
      // contact. Removing or demoting them is not, so only `add` filters.
      const optedOut =
        action === 'add' ? await suppressedAmong(targets) : new Set<string>()
      const eligible = targets.filter((phone) => {
        if (!optedOut.has(phone)) return true
        results.push({ phone, ok: false, error: 'opted out' })
        return false
      })

      for (let i = 0; i < eligible.length; i += PARTICIPANT_BATCH) {
        const batch = eligible.slice(i, i + PARTICIPANT_BATCH)
        try {
          const { results: answered } = await waBridge.request('group:participants', {
            deviceId: device.id,
            groupId,
            jids: batch.map(phoneJid),
            action,
          })
          const byDigits = new Map(answered.map((r) => [phoneDigits(r.jid), r]))
          for (const phone of batch) {
            const answer = byDigits.get(phoneDigits(phone))
            results.push(
              answer
                ? { phone, ok: answer.ok, error: answer.ok ? null : answer.error }
                : { phone, ok: false, error: 'WhatsApp did not answer for this number' },
            )
          }
        } catch (err) {
          // One refused batch must not hide the outcome of the others.
          const reason = reasonOf(err)
          for (const phone of batch) results.push({ phone, ok: false, error: reason })
        }
      }

      if (eligible.length > 0) await refreshGroup(device.id, groupId, device.phone)
      return { results }
    },
  )

  registerHandler('group:joinRequests', async ({ groupId }) => {
    const { device } = await requireGroup(groupId, {
      admin: true,
      action: 'see join requests',
    })
    const { requests } = await waCall(
      'group:requests',
      { deviceId: device.id, groupId },
      'load join requests',
    )
    return requests
  })

  registerHandler('group:handleJoinRequests', async ({ groupId, jids, action }) => {
    const { device } = await requireGroup(groupId, {
      admin: true,
      action: 'answer join requests',
    })
    const { results } = await waCall(
      'group:requestsUpdate',
      { deviceId: device.id, groupId, jids, action },
      `${action} join requests`,
    )
    const approved = results.filter((r) => r.ok).length
    if (approved > 0 && action === 'approve') {
      await refreshGroup(device.id, groupId, device.phone)
    }
    return { approved, failed: results.length - approved }
  })
}
