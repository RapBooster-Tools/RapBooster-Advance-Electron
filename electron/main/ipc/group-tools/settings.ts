/**
 * Invite links, joining by link, and group settings (D89).
 */
import { AppError } from '../../../../shared/errors'
import { getPrisma } from '../../db/client'
import { groupRunner } from '../../services/group-runner'
import { registerHandler } from '../router'
import {
  inviteUrl,
  parseInviteCode,
  requireConnectedDevice,
  requireGroup,
  waCall,
} from './shared'

export function registerGroupSettingHandlers(): void {
  registerHandler('group:inviteLink', async ({ groupId }) => {
    const { device } = await requireGroup(groupId, {
      admin: true,
      action: 'see the invite link',
    })
    const { code } = await waCall(
      'group:inviteCode',
      { deviceId: device.id, groupId },
      'get the invite link',
    )
    return { code, url: inviteUrl(code) }
  })

  registerHandler('group:revokeInvite', async ({ groupId }) => {
    const { device } = await requireGroup(groupId, {
      admin: true,
      action: 'reset the invite link',
    })
    const { code } = await waCall(
      'group:revokeInvite',
      { deviceId: device.id, groupId },
      'reset the invite link',
    )
    return { code, url: inviteUrl(code) }
  })

  registerHandler('group:join', async ({ deviceId, invite }) => {
    const code = parseInviteCode(invite)
    if (!code) {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'Paste a chat.whatsapp.com invite link or its code.',
      })
    }
    await requireConnectedDevice(deviceId)
    const { groupId } = await waCall(
      'group:acceptInvite',
      { deviceId, code },
      'join that group',
    )
    // The new group should appear without the user pressing Sync. A group
    // that needs admin approval will not be in the list yet, which is correct.
    await groupRunner.sync(deviceId)
    return { groupId }
  })

  registerHandler('group:updateSettings', async (input) => {
    const { group, device } = await requireGroup(input.groupId, {
      admin: true,
      action: 'change group settings',
    })
    const deviceId = device.id
    const groupId = group.id
    const prisma = getPrisma()

    // Each setting is a separate WhatsApp call. Persist each as it succeeds so
    // a refusal half way through leaves the row matching WhatsApp.
    if (input.announce !== undefined) {
      await waCall(
        'group:setting',
        {
          deviceId,
          groupId,
          setting: input.announce ? 'announcement' : 'not_announcement',
        },
        'change who can send messages',
      )
      await prisma.group.update({
        where: { id: groupId },
        data: { announce: input.announce },
      })
    }
    if (input.restrict !== undefined) {
      await waCall(
        'group:setting',
        { deviceId, groupId, setting: input.restrict ? 'locked' : 'unlocked' },
        'change who can edit group info',
      )
      await prisma.group.update({
        where: { id: groupId },
        data: { restrict: input.restrict },
      })
    }
    if (input.joinApproval !== undefined) {
      await waCall(
        'group:joinApproval',
        { deviceId, groupId, enabled: input.joinApproval },
        'change join approval',
      )
      await prisma.group.update({
        where: { id: groupId },
        data: { joinApproval: input.joinApproval },
      })
    }
    if (input.description !== undefined) {
      await waCall(
        'group:description',
        { deviceId, groupId, description: input.description },
        'change the description',
      )
    }
    return { ok: true as const }
  })
}
