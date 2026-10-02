/**
 * What WhatsApp accepts per media kind, checked before a file is copied into
 * the managed media store. Shared by templates, inbox sends and status/channel
 * posts so the limits cannot drift between screens.
 */
import { statSync } from 'node:fs'
import { extname } from 'node:path'
import { AppError } from '../../../shared/errors'
import type { MediaType } from '../../../shared/types'

interface Rule {
  extensions: ReadonlySet<string>
  maxBytes: number
  /** Plural noun for messages ("images"). */
  label: string
}

const MB = 1024 * 1024

export const MEDIA_RULES: Record<MediaType, Rule> = {
  image: {
    extensions: new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']),
    maxBytes: 5 * MB,
    label: 'images',
  },
  video: {
    extensions: new Set(['.mp4', '.3gp', '.mkv']),
    maxBytes: 16 * MB,
    label: 'videos',
  },
  // WHY ogg/opus first: WhatsApp plays voice notes natively only as Opus in Ogg.
  // Other formats still send, but arrive as an audio file rather than a voice note.
  audio: {
    extensions: new Set(['.ogg', '.opus', '.mp3', '.m4a', '.aac', '.wav']),
    maxBytes: 16 * MB,
    label: 'voice notes',
  },
  // Stickers must be WebP; WhatsApp rejects anything else as a sticker.
  sticker: { extensions: new Set(['.webp']), maxBytes: 1 * MB, label: 'stickers' },
}

/** Throws a user-facing VALIDATION_FAILED when the file breaks the rule. */
export function assertMediaAllowed(sourcePath: string, mediaType: MediaType): void {
  const rule = MEDIA_RULES[mediaType]
  let size: number
  try {
    size = statSync(sourcePath).size
  } catch {
    throw new AppError('VALIDATION_FAILED', {
      userMessage: 'That media file could not be read.',
    })
  }

  const ext = extname(sourcePath).toLowerCase()
  if (!rule.extensions.has(ext)) {
    throw new AppError('VALIDATION_FAILED', {
      userMessage: `${ext || 'That file type'} is not supported for ${rule.label}. Use ${[
        ...rule.extensions,
      ].join(', ')}.`,
    })
  }
  if (size > rule.maxBytes) {
    throw new AppError('VALIDATION_FAILED', {
      userMessage: `That file is ${(size / MB).toFixed(1)} MB. WhatsApp accepts up to ${
        rule.maxBytes / MB
      } MB for ${rule.label}.`,
    })
  }
}
