import type { MediaType } from '@shared/types'
import type { FileFilter } from './file-picker-field'

/**
 * File-dialog filters per media kind.
 *
 * NOTE: mirrors MEDIA_RULES in electron/main/services/media-policy.ts, which
 * stays the authority — main re-checks every file. These only stop the dialog
 * offering files that would be refused anyway.
 */
export const MEDIA_FILTERS: Record<MediaType, FileFilter[]> = {
  image: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
  video: [{ name: 'Videos', extensions: ['mp4', '3gp', 'mkv'] }],
  audio: [{ name: 'Audio', extensions: ['ogg', 'opus', 'mp3', 'm4a', 'aac', 'wav'] }],
  sticker: [{ name: 'Stickers (WebP)', extensions: ['webp'] }],
}
