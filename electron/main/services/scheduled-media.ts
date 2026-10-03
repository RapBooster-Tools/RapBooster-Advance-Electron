/**
 * Attachments on scheduled messages (Wave 3): photos and videos go out as
 * media with the text as caption, anything else as a document.
 */
import { copyFileSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { AppError } from '../../../shared/errors'
import { mediaDir } from '../db/paths'
import { assertMediaAllowed, MEDIA_RULES } from './media-policy'

/** WhatsApp's document limit is far higher; this keeps the media folder sane. */
const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024

export interface ScheduledAttachment {
  kind: 'image' | 'video' | 'document'
  /** The name the recipient sees, without the store's timestamp prefix. */
  fileName: string
  /** The chat list's preview when the message has no text. */
  preview: string
}

/** The stored copy is named `<timestamp>-<original name>`. */
function originalName(path: string): string {
  return basename(path).replace(/^\d+-/, '')
}

export function scheduledAttachment(path: string): ScheduledAttachment {
  const ext = extname(path).toLowerCase()
  const fileName = originalName(path)
  if (MEDIA_RULES.image.extensions.has(ext)) {
    return { kind: 'image', fileName, preview: '📷 Photo' }
  }
  if (MEDIA_RULES.video.extensions.has(ext)) {
    return { kind: 'video', fileName, preview: '🎥 Video' }
  }
  return { kind: 'document', fileName, preview: `📄 ${fileName}` }
}

function safeSegment(chatId: string): string {
  return chatId.replace(/[^A-Za-z0-9_-]/g, '_')
}

/**
 * Validate a chosen file and copy it into the managed store.
 *
 * WHY copy now rather than at send time: the message may go out days later,
 * and by then the original could be moved, edited or deleted.
 */
export function storeScheduledAttachment(chatId: string, sourcePath: string): string {
  const { kind } = scheduledAttachment(sourcePath)
  if (kind === 'document') {
    let size: number
    try {
      size = statSync(sourcePath).size
    } catch {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'That file could not be read. Choose it again.',
      })
    }
    if (size > MAX_DOCUMENT_BYTES) {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'That file is larger than 100 MB. Choose a smaller file.',
      })
    }
  } else {
    assertMediaAllowed(sourcePath, kind)
  }

  const target = join(
    mediaDir('scheduled', safeSegment(chatId)),
    `${Date.now()}-${basename(sourcePath)}`,
  )
  try {
    copyFileSync(sourcePath, target)
  } catch (err) {
    throw new AppError('VALIDATION_FAILED', {
      userMessage: 'That file could not be copied. Check it is not open elsewhere.',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
  return target
}
