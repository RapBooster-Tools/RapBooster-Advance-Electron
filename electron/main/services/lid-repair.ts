/**
 * Replace hidden numbers with real ones once WhatsApp reveals them (D129).
 *
 * A person WhatsApp addresses only by LID is stored with the stand-in
 * `<lid>@lid` in place of a phone, and their chat is filed under the LID.
 * When wa-service learns the number (the `lidMapping` event), this moves
 * everything onto the real number:
 *
 *   - the chat is renamed to the phone-number JID — or, if that chat already
 *     exists (the person wrote again after the number became known), the two
 *     are merged, so one person is one conversation;
 *   - an opt-out recorded against the stand-in moves to the number, so a STOP
 *     sent before the number was known still protects it;
 *   - call records get the number.
 *
 * Every foreign key to Chat cascades on update, so renaming the id carries
 * messages, notes, drafts, scheduled messages and flow sessions with it; the
 * two tables that keep chatId as plain text are updated by hand.
 */
import { isHiddenPhone } from '../../../shared/phone-display'
import { getPrisma } from '../db/client'
import { notify } from './notify'

export interface LidPhone {
  /** `<lid>@lid`, device suffix already dropped. */
  lid: string
  /** E.164. */
  phone: string
}

const pnJid = (phone: string) => `${phone.replace(/\D/g, '')}@s.whatsapp.net`

/** A chat name that is only the stand-in or the LID's digits says nothing. */
function placeholderName(name: string, lid: string): boolean {
  return name === lid || name === lid.split('@')[0] || isHiddenPhone(name)
}

async function repairChat(mapping: LidPhone): Promise<string | null> {
  const prisma = getPrisma()
  const lidChat = await prisma.chat.findUnique({ where: { id: mapping.lid } })
  if (!lidChat || lidChat.isGroup) return null
  // The person may already have a chat under their number — found by phone,
  // not by guessing the id format, so the merge never misses it.
  const existing =
    (await prisma.chat.findFirst({
      where: { phone: mapping.phone, isGroup: false, id: { not: mapping.lid } },
    })) ?? (await prisma.chat.findUnique({ where: { id: pnJid(mapping.phone) } }))
  const target = existing?.id ?? pnJid(mapping.phone)
  const name = placeholderName(lidChat.name, mapping.lid) ? mapping.phone : lidChat.name

  await prisma.$transaction(async (tx) => {
    if (!existing) {
      await tx.chat.update({
        where: { id: mapping.lid },
        data: { id: target, phone: mapping.phone, name },
      })
    } else {
      // Both exist: fold the LID chat into the number's chat.
      await tx.message.updateMany({
        where: { chatId: mapping.lid },
        data: { chatId: target },
      })
      await tx.chatNote.updateMany({
        where: { chatId: mapping.lid },
        data: { chatId: target },
      })
      await tx.scheduledMessage.updateMany({
        where: { chatId: mapping.lid },
        data: { chatId: target },
      })
      await tx.aiDraft.updateMany({
        where: { chatId: mapping.lid },
        data: { chatId: target },
      })
      // One flow session per chat: the number's own session wins.
      if (await tx.flowSession.findUnique({ where: { chatId: target } })) {
        await tx.flowSession.deleteMany({ where: { chatId: mapping.lid } })
      } else {
        await tx.flowSession.updateMany({
          where: { chatId: mapping.lid },
          data: { chatId: target },
        })
      }
      const newer =
        (lidChat.lastMessageAt?.getTime() ?? 0) > (existing.lastMessageAt?.getTime() ?? 0)
      await tx.chat.update({
        where: { id: target },
        data: {
          unreadCount: existing.unreadCount + lidChat.unreadCount,
          // A STOP, an escalation or a welcome on either side holds for both.
          autoReplyOptOut: existing.autoReplyOptOut || lidChat.autoReplyOptOut,
          isEscalated: existing.isEscalated || lidChat.isEscalated,
          welcomedAt: existing.welcomedAt ?? lidChat.welcomedAt,
          ...(placeholderName(existing.name, mapping.lid) ? { name } : {}),
          ...(newer
            ? { lastMessage: lidChat.lastMessage, lastMessageAt: lidChat.lastMessageAt }
            : {}),
        },
      })
      await tx.chat.delete({ where: { id: mapping.lid } })
    }
    // Plain-text chatId columns: no cascade reaches them.
    await tx.aiUsage.updateMany({
      where: { chatId: mapping.lid },
      data: { chatId: target },
    })
    const hits = await tx.keywordRuleHit.findMany({
      where: { chatId: mapping.lid },
      take: 1000,
    })
    for (const hit of hits) {
      const clash = await tx.keywordRuleHit.findUnique({
        where: { ruleId_chatId: { ruleId: hit.ruleId, chatId: target } },
      })
      if (clash) {
        await tx.keywordRuleHit.delete({
          where: { ruleId_chatId: { ruleId: hit.ruleId, chatId: mapping.lid } },
        })
      } else {
        await tx.keywordRuleHit.update({
          where: { ruleId_chatId: { ruleId: hit.ruleId, chatId: mapping.lid } },
          data: { chatId: target },
        })
      }
    }
  })
  return target
}

async function repairOptOut(mapping: LidPhone): Promise<void> {
  const prisma = getPrisma()
  const hidden = await prisma.suppression.findUnique({ where: { phone: mapping.lid } })
  if (!hidden) return
  const real = await prisma.suppression.findUnique({ where: { phone: mapping.phone } })
  // An entry already on the number keeps its own source and reason.
  if (real) await prisma.suppression.delete({ where: { phone: mapping.lid } })
  else
    await prisma.suppression.update({
      where: { phone: mapping.lid },
      data: { phone: mapping.phone },
    })
}

export async function applyLidMappings(
  deviceId: string,
  mappings: LidPhone[],
): Promise<void> {
  const prisma = getPrisma()
  for (const mapping of mappings) {
    if (!/^\+\d{7,15}$/.test(mapping.phone) || !mapping.lid.endsWith('@lid')) continue
    const chatId = await repairChat(mapping)
    await repairOptOut(mapping)
    await prisma.callEvent.updateMany({
      where: { deviceId, from: mapping.lid },
      data: { from: mapping.phone },
    })
    if (chatId) notify('chat:updated', { chatId })
  }
}
