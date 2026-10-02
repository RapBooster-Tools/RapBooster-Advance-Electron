/**
 * Communities: list, create, link/unlink groups, create a group inside one
 * (D89). Communities are stored as Group rows with isCommunity = true; a
 * linked group points at its community through parentId.
 */
import { AppError } from '../../../../shared/errors'
import { getPrisma } from '../../db/client'
import { phoneJid, syncCommunities } from '../../services/group-meta'
import { suppressedPhones } from '../../services/optout'
import { registerHandler } from '../router'
import { requireConnectedDevice, requireGroup, waCall } from './shared'

/** Far beyond any real account; the bound keeps the query finite. */
const MAX_COMMUNITIES = 500
const MAX_LINKED = 5_000

async function requireCommunity(communityId: string) {
  const { group, device } = await requireGroup(communityId)
  if (!group.isCommunity) {
    throw new AppError('VALIDATION_FAILED', { userMessage: 'That is not a community.' })
  }
  return { community: group, device }
}

/** Communities as currently cached, with the groups linked into each. */
async function cachedCommunities(deviceId?: string) {
  const prisma = getPrisma()
  const communities = await prisma.group.findMany({
    where: { isCommunity: true, ...(deviceId ? { deviceId } : {}) },
    orderBy: { name: 'asc' },
    take: MAX_COMMUNITIES,
  })
  const linked = await prisma.group.findMany({
    where: { parentId: { in: communities.map((c) => c.id) }, isCommunity: false },
    select: { id: true, parentId: true },
    take: MAX_LINKED,
  })
  return communities.map((c) => ({
    id: c.id,
    deviceId: c.deviceId,
    name: c.name,
    linkedGroupIds: linked.filter((g) => g.parentId === c.id).map((g) => g.id),
  }))
}

export function registerCommunityHandlers(): void {
  registerHandler('community:list', async ({ deviceId }) => {
    const devices = await getPrisma().device.findMany({
      where: { status: 'connected', ...(deviceId ? { id: deviceId } : {}) },
      select: { id: true },
      take: 100,
    })
    for (const device of devices) {
      try {
        await syncCommunities(device.id)
      } catch (err) {
        // Serve the cached rows for this device rather than failing the list.
        console.warn(`community sync failed for device ${device.id}`, err)
      }
    }
    return cachedCommunities(deviceId)
  })

  registerHandler('community:create', async ({ deviceId, name, description }) => {
    await requireConnectedDevice(deviceId)
    const created = await waCall(
      'community:create',
      { deviceId, subject: name, description },
      'create the community',
    )
    await getPrisma().group.upsert({
      where: { id: created.id },
      create: {
        id: created.id,
        deviceId,
        name: created.name,
        isCommunity: true,
        isAdmin: true,
      },
      update: { name: created.name, isCommunity: true, isAdmin: true },
    })
    return { id: created.id, deviceId, name: created.name, linkedGroupIds: [] }
  })

  registerHandler('community:linkGroup', async ({ communityId, groupId }) => {
    const { community, device } = await requireCommunity(communityId)
    const { group } = await requireGroup(groupId, {
      admin: true,
      action: 'link a group into a community',
    })
    if (group.deviceId !== community.deviceId) {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'The group and the community must belong to the same device.',
      })
    }
    await waCall(
      'community:link',
      { deviceId: device.id, communityId, groupId },
      `link "${group.name}" into "${community.name}"`,
    )
    await getPrisma().group.update({
      where: { id: groupId },
      data: { parentId: communityId },
    })
    return { ok: true as const }
  })

  registerHandler('community:unlinkGroup', async ({ communityId, groupId }) => {
    const { community, device } = await requireCommunity(communityId)
    const { group } = await requireGroup(groupId)
    await waCall(
      'community:unlink',
      { deviceId: device.id, communityId, groupId },
      `unlink "${group.name}" from "${community.name}"`,
    )
    await getPrisma().group.update({ where: { id: groupId }, data: { parentId: null } })
    return { ok: true as const }
  })

  registerHandler('community:createGroup', async ({ communityId, name, phones }) => {
    const { device } = await requireCommunity(communityId)
    // Starting members are contact like any other; opted-out numbers stay out.
    const optedOut = await suppressedPhones(phones)
    const participants = [...new Set(phones)]
      .filter((p) => !optedOut.has(p))
      .map(phoneJid)

    const created = await waCall(
      'community:createGroup',
      { deviceId: device.id, communityId, subject: name, participants },
      'create the group',
    )
    await getPrisma().group.upsert({
      where: { id: created.id },
      create: {
        id: created.id,
        deviceId: device.id,
        name: created.name,
        memberCount: created.memberCount,
        isAdmin: true,
        parentId: communityId,
      },
      update: {
        name: created.name,
        memberCount: created.memberCount,
        parentId: communityId,
      },
    })
    return { groupId: created.id }
  })
}
