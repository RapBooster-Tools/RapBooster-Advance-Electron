/**
 * Keeps the cached Group rows in step with what WhatsApp reports (D89).
 *
 * `group:fetch` only carries name, member count and admin flag, so the richer
 * fields — settings, community membership — are filled from the two calls that
 * do carry them: `group:metadata` (one group) and `community:fetch` (one
 * device). Whoever reads either persists it here, so the Groups screen reflects
 * the last thing WhatsApp said rather than whatever the row was created with.
 */
import type { WaGroupMetadata } from '../../../shared/wa-protocol'
import { getPrisma } from '../db/client'
import { waBridge } from '../wa-bridge'

/** Settings applied to every group a bulk-create job makes. */
export interface CreateSettings {
  description?: string
  announce: boolean
  joinApproval: boolean
}

/** Digits only, so `+91…`, `91…` and `91…@s.whatsapp.net` compare equal. */
export function phoneDigits(value: string): string {
  return (value.split('@')[0] ?? '').split(':')[0]?.replace(/\D/g, '') ?? ''
}

export function phoneJid(phone: string): string {
  return `${phoneDigits(phone)}@s.whatsapp.net`
}

/** Persist one group's metadata onto its cached row, when the row exists. */
export async function applyMetadata(
  deviceId: string,
  metadata: WaGroupMetadata,
  ownPhone: string | null,
): Promise<void> {
  const own = ownPhone ? phoneDigits(ownPhone) : null
  const self = own
    ? metadata.participants.find((p) => phoneDigits(p.phone) === own)
    : null

  await getPrisma().group.updateMany({
    where: { id: metadata.id, deviceId },
    data: {
      name: metadata.name,
      memberCount: metadata.participants.length,
      announce: metadata.announce,
      restrict: metadata.restrict,
      joinApproval: metadata.joinApproval,
      isCommunity: metadata.isCommunity,
      parentId: metadata.parentId,
      // Only overwrite the admin flag when we could find ourselves; a group
      // that hides phone numbers behind LIDs would otherwise demote us.
      ...(self ? { isAdmin: self.isAdmin } : {}),
      syncedAt: new Date(),
    },
  })
}

/**
 * Store a device's communities as Group rows (isCommunity = true) and point
 * each linked group at its parent. Returns the communities WhatsApp reported.
 */
export async function syncCommunities(
  deviceId: string,
): Promise<Array<{ id: string; name: string; linkedGroupIds: string[] }>> {
  const prisma = getPrisma()
  const { communities } = await waBridge.request('community:fetch', { deviceId })

  await prisma.$transaction(async (tx) => {
    for (const community of communities) {
      await tx.group.upsert({
        where: { id: community.id },
        create: {
          id: community.id,
          deviceId,
          name: community.name,
          isCommunity: true,
        },
        update: { name: community.name, isCommunity: true, syncedAt: new Date() },
      })
      // A group unlinked elsewhere (the phone, another admin) must drop its
      // parent here too, or the Communities tab would keep showing it.
      await tx.group.updateMany({
        where: {
          deviceId,
          parentId: community.id,
          id: { notIn: community.linkedGroupIds },
        },
        data: { parentId: null },
      })
      if (community.linkedGroupIds.length > 0) {
        await tx.group.updateMany({
          where: { deviceId, id: { in: community.linkedGroupIds } },
          data: { parentId: community.id },
        })
      }
    }
  })

  return communities
}

/**
 * Apply the job's settings to a freshly created group. Each setting is its
 * own WhatsApp call, so one refusal is reported and the others still apply —
 * the group exists either way and must not be counted as failed.
 */
export async function applyCreateSettings(
  deviceId: string,
  groupId: string,
  settings: CreateSettings,
): Promise<string[]> {
  const prisma = getPrisma()
  const problems: string[] = []
  const attempt = async (label: string, run: () => Promise<unknown>) => {
    try {
      await run()
      return true
    } catch (err) {
      problems.push(
        `${label} not applied: ${err instanceof Error ? err.message : String(err)}`,
      )
      return false
    }
  }

  if (settings.description !== undefined) {
    const description = settings.description
    await attempt('description', () =>
      waBridge.request('group:description', { deviceId, groupId, description }),
    )
  }
  if (settings.announce) {
    const applied = await attempt('admins-only messages', () =>
      waBridge.request('group:setting', { deviceId, groupId, setting: 'announcement' }),
    )
    if (applied)
      await prisma.group.update({ where: { id: groupId }, data: { announce: true } })
  }
  if (settings.joinApproval) {
    const applied = await attempt('join approval', () =>
      waBridge.request('group:joinApproval', { deviceId, groupId, enabled: true }),
    )
    if (applied)
      await prisma.group.update({
        where: { id: groupId },
        data: { joinApproval: true },
      })
  }
  return problems
}
