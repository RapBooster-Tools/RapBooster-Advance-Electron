/**
 * Campaign analytics: delivery and read receipts, and reply attribution
 * (IMPROVEMENT-PLAN.md Phase 3).
 *
 * Everything is written onto CampaignRecipient rows, so the numbers come from
 * SQL aggregates and survive restarts like every other campaign counter.
 */
import { getPrisma } from '../db/client'
import { readSendingDefaults } from './sending-policy'

/**
 * Record a WhatsApp receipt against the campaign recipient that sent it.
 * Returns true when the message belonged to a campaign.
 */
export async function recordReceipt(
  messageId: string,
  status: 'delivered' | 'read',
): Promise<boolean> {
  const prisma = getPrisma()
  const now = new Date()
  const result = await prisma.campaignRecipient.updateMany({
    where: {
      messageId,
      ...(status === 'delivered' ? { deliveredAt: null } : { readAt: null }),
    },
    data: status === 'delivered' ? { deliveredAt: now } : { readAt: now },
  })
  return result.count > 0
}

/**
 * Attribute an inbound message to the most recent campaign send to that number
 * within the attribution window. Only the first reply counts.
 *
 * Returns the campaign id it was attributed to, or null.
 */
export async function attributeReply(phone: string, at: Date): Promise<string | null> {
  if (!phone.startsWith('+')) return null
  const { attributionHours } = await readSendingDefaults()
  const since = new Date(at.getTime() - attributionHours * 3_600_000)

  const prisma = getPrisma()
  const recipient = await prisma.campaignRecipient.findFirst({
    where: { phone, status: 'sent', sentAt: { gte: since, lte: at } },
    orderBy: { sentAt: 'desc' },
  })
  if (!recipient || recipient.repliedAt) return null

  await prisma.campaignRecipient.update({
    where: { id: recipient.id },
    data: { repliedAt: at },
  })
  return recipient.campaignId
}
