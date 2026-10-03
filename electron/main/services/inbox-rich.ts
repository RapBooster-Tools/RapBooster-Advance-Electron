/**
 * One-off rich messages from the inbox composer: location pins, contact cards,
 * polls, voice notes and stickers (D89).
 *
 * Kept out of chat.ipc.ts so the handler only wires the send and the persist;
 * the wire payload and the one-line summary the inbox shows are decided here.
 */
import { copyFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { InboxRichMessage } from '../../../shared/rich-message'
import type { MessageType } from '../../../shared/types'
import type { WaOutgoing } from '../../../shared/wa-protocol'
import { mediaDir } from '../db/paths'
import { assertMediaAllowed } from './media-policy'

export interface PreparedRich {
  message: WaOutgoing
  type: MessageType
  /** Shown in the thread and the chat list; never the file's contents. */
  summary: string
  mediaPath: string | null
  fileName: string | null
}

/** A chat id is a JID (`91…@s.whatsapp.net`); keep it to filesystem-safe characters. */
function safeSegment(chatId: string): string {
  return chatId.replace(/[^A-Za-z0-9_-]/g, '_')
}

/**
 * Validate a chosen file and copy it into the managed store.
 *
 * WHY copy: the stored Message row points at the file so the thread can show
 * it later; the user's original may be moved or deleted the moment they send.
 * The timestamp prefix keeps two sends of `note.ogg` from overwriting each other.
 */
function storeInboxMedia(
  chatId: string,
  sourcePath: string,
  mediaType: 'audio' | 'sticker',
): string {
  assertMediaAllowed(sourcePath, mediaType)
  const target = join(
    mediaDir('inbox', safeSegment(chatId)),
    `${Date.now()}-${basename(sourcePath)}`,
  )
  copyFileSync(sourcePath, target)
  return target
}

function locationLabel(p: {
  latitude: number
  longitude: number
  name?: string
  address?: string
}): string {
  return p.name || p.address || `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`
}

/** Build the wire payload, storing any file first. Throws AppError on a bad file. */
export function prepareInboxRich(chatId: string, input: InboxRichMessage): PreparedRich {
  switch (input.kind) {
    case 'location':
      return {
        message: { kind: 'location', ...input.payload },
        type: 'location',
        summary: `📍 ${locationLabel(input.payload)}`,
        mediaPath: null,
        fileName: null,
      }
    case 'contact':
      return {
        message: { kind: 'contacts', contacts: input.payload.contacts },
        type: 'contact',
        summary: `👤 ${input.payload.contacts.map((c) => c.name).join(', ')}`,
        mediaPath: null,
        fileName: null,
      }
    case 'poll':
      return {
        message: {
          kind: 'poll',
          name: input.question.trim(),
          options: input.payload.options,
          selectableCount: input.payload.selectableCount,
        },
        type: 'poll',
        summary: `📊 Poll: ${input.question.trim()}`,
        mediaPath: null,
        fileName: null,
      }
    case 'voice': {
      const path = storeInboxMedia(chatId, input.mediaSourcePath, 'audio')
      return {
        message: { kind: 'audio', path, ptt: true },
        type: 'voice',
        summary: '🎤 Voice note',
        mediaPath: path,
        fileName: basename(input.mediaSourcePath),
      }
    }
    case 'sticker': {
      const path = storeInboxMedia(chatId, input.mediaSourcePath, 'sticker')
      return {
        message: { kind: 'sticker', path },
        type: 'sticker',
        summary: '🏷️ Sticker',
        mediaPath: path,
        fileName: basename(input.mediaSourcePath),
      }
    }
  }
}
