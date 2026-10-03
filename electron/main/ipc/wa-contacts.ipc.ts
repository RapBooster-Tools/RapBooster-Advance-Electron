/**
 * The WhatsApp contacts grabber (Wave 3): browse the numbers each linked phone
 * knows — saved contacts and chats — and copy them into a contact list.
 */
import { AppError } from '../../../shared/errors'
import { getPrisma } from '../db/client'
import { log } from '../services/logger'
import { toast } from '../services/notify'
import {
  decodeWaCursor,
  encodeWaCursor,
  exportWaContacts,
  waContactWhere,
} from '../services/wa-contacts-export'
import { registerHandler } from './router'

export function registerWaContactHandlers(): void {
  registerHandler(
    'waContacts:list',
    async ({ deviceId, source, search, onlyNamed, cursor, limit }) => {
      const where = waContactWhere({
        ...(deviceId ? { deviceIds: [deviceId] } : {}),
        source,
        ...(search ? { search } : {}),
        onlyNamed,
      })
      const at = cursor ? decodeWaCursor(cursor) : null
      if (cursor && !at) {
        throw new AppError('VALIDATION_FAILED', { detail: 'malformed waContacts cursor' })
      }

      const [rows, total] = await Promise.all([
        getPrisma().waContact.findMany({
          where,
          // Recent chats first when browsing chats; otherwise by name, with the
          // unnamed numbers after the named ones.
          orderBy: [
            ...(source === 'chats'
              ? [{ lastChatAt: { sort: 'desc' as const, nulls: 'last' as const } }]
              : [{ name: { sort: 'asc' as const, nulls: 'last' as const } }]),
            { deviceId: 'asc' as const },
            { jid: 'asc' as const },
          ],
          take: limit + 1,
          ...(at ? { cursor: { deviceId_jid: at }, skip: 1 } : {}),
        }),
        getPrisma().waContact.count({ where }),
      ])

      // One extra row is fetched purely to know whether another page exists.
      const hasMore = rows.length > limit
      const page = hasMore ? rows.slice(0, limit) : rows
      const last = page[page.length - 1]

      return {
        items: page.map((r) => ({
          deviceId: r.deviceId,
          jid: r.jid,
          phone: r.phone,
          name: r.name,
          inAddressBook: r.inAddressBook,
          hasChat: r.hasChat,
          lastChatAt: r.lastChatAt?.toISOString() ?? null,
        })),
        nextCursor: hasMore && last ? encodeWaCursor(last.deviceId, last.jid) : null,
        total,
      }
    },
  )

  registerHandler(
    'waContacts:export',
    async ({ deviceIds, source, chattedSince, listName, onlyNamed }) => {
      const name = listName.trim()
      const existing = await getPrisma().contactList.findUnique({ where: { name } })
      if (existing) {
        throw new AppError('CONFLICT', {
          userMessage: 'A list with that name already exists. Choose another name.',
        })
      }

      try {
        const result = await exportWaContacts(
          {
            deviceIds,
            source,
            onlyNamed,
            ...(source === 'chats' && chattedSince
              ? { chattedSince: new Date(chattedSince) }
              : {}),
          },
          name,
        )
        log.info(
          `[wa-contacts] exported ${result.imported} (skipped ${result.skipped}, ` +
            `opted out ${result.suppressed}) from ${deviceIds.length} device(s)`,
        )
        if (result.suppressed > 0) {
          toast(
            'info',
            `${result.suppressed} of these numbers are on your opt-out list. ` +
              'They stay in the list but will never be messaged.',
          )
        }
        return {
          listId: result.listId,
          imported: result.imported,
          skipped: result.skipped,
        }
      } catch (err) {
        if (err instanceof AppError) throw err
        throw new AppError('IMPORT_FAILED', {
          userMessage: 'The contacts could not be copied into a list. Please try again.',
          detail: String(err),
        })
      }
    },
  )
}
