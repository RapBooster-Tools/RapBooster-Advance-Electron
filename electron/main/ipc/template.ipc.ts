/**
 * Template channels.
 *
 * Media is copied into a managed store under userData rather than referenced in
 * place: a campaign scheduled for next week must still be able to send its
 * image after the user has moved or deleted the original file.
 */
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { AppError } from '../../../shared/errors'
import { renderTemplate } from '../../../shared/merge-tags'
import { spin } from '../../../shared/spintax'
import { decodeButtons } from '../../../shared/template-buttons'
import type { MediaType, TemplateType } from '../../../shared/types'
import { richPayload, type RichPayload } from '../../../shared/rich-message'
import { assertMediaAllowed } from '../services/media-policy'
import { checkButtons, checkRich, FILE_TYPES } from '../services/template-rules'
import { getPrisma } from '../db/client'
import { mediaDir } from '../db/paths'
import { registerHandler } from './router'

function parseJsonArray(value: string | null): string[] | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : null
  } catch {
    return null
  }
}

/** Template.extra, validated on the way out; a corrupt payload reads as none. */
function parseExtra(json: string | null): RichPayload | null {
  if (!json) return null
  try {
    const parsed = richPayload.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : null
  } catch (err) {
    console.warn('template: unreadable extra payload', err)
    return null
  }
}

function serialize(row: {
  id: string
  name: string
  type: string
  content: string
  mediaType: string | null
  mediaPath: string | null
  options: string | null
  buttons: string | null
  footer: string | null
  listButtonText: string | null
  extra: string | null
  createdAt: Date
}) {
  return {
    id: row.id,
    name: row.name,
    type: row.type as TemplateType,
    content: row.content,
    mediaType: (row.mediaType as MediaType | null) ?? null,
    mediaPath: row.mediaPath,
    options: parseJsonArray(row.options),
    // Rows written before buttons were structured hold plain labels; decode
    // accepts both so an old template still opens (D70).
    buttons: row.buttons ? decodeButtons(row.buttons) : null,
    footer: row.footer,
    listButtonText: row.listButtonText,
    extra: parseExtra(row.extra),
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Copy a chosen file into the app's media store and return the stored path.
 * Validation happens before the copy so an oversized file never lands on disk.
 */
function storeMedia(
  templateId: string,
  sourcePath: string,
  mediaType: MediaType,
): string {
  assertMediaAllowed(sourcePath, mediaType)
  const dir = mediaDir('templates', templateId)
  mkdirSync(dir, { recursive: true })
  const target = join(dir, basename(sourcePath))
  copyFileSync(sourcePath, target)
  return target
}

async function requireTemplate(id: string) {
  const template = await getPrisma().template.findUnique({ where: { id } })
  if (!template) {
    throw new AppError('NOT_FOUND', { userMessage: 'That template no longer exists.' })
  }
  return template
}

export function registerTemplateHandlers(): void {
  registerHandler('template:list', async () => {
    const rows = await getPrisma().template.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map(serialize)
  })

  registerHandler('template:create', async (input) => {
    const name = input.name.trim()
    if (name === '') {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'A template name is required.',
      })
    }

    const buttons = checkButtons(input.buttons)
    const options = input.options?.map((o) => o.trim()).filter((o) => o !== '')

    if (input.type === 'media' && !input.mediaSourcePath) {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'Choose an image or video for a media template.',
      })
    }
    const extra = checkRich(
      input.type,
      input.content,
      input.extra,
      Boolean(input.mediaSourcePath),
    )
    // Voice and sticker templates are files of a fixed kind; the renderer need
    // not send a mediaType for them.
    const mediaType = FILE_TYPES[input.type] ?? input.mediaType

    const created = await getPrisma().template.create({
      data: {
        name,
        type: input.type,
        content: input.content,
        extra: extra ? JSON.stringify(extra) : null,
        mediaType: mediaType ?? null,
        options: options ? JSON.stringify(options) : null,
        buttons: buttons ? JSON.stringify(buttons) : null,
        footer: input.footer?.trim() || null,
        listButtonText: input.listButtonText?.trim() || null,
      },
    })

    if (input.mediaSourcePath && mediaType) {
      try {
        const mediaPath = storeMedia(created.id, input.mediaSourcePath, mediaType)
        const withMedia = await getPrisma().template.update({
          where: { id: created.id },
          data: { mediaPath },
        })
        return serialize(withMedia)
      } catch (err) {
        // Do not leave a media template behind with no media — it would fail
        // at send time, long after the user could connect cause and effect.
        await getPrisma().template.delete({ where: { id: created.id } })
        throw err
      }
    }

    return serialize(created)
  })

  registerHandler('template:update', async (input) => {
    const existing = await requireTemplate(input.id)
    const buttons = checkButtons(input.buttons)
    const options = input.options?.map((o) => o.trim()).filter((o) => o !== '')

    const type = existing.type as TemplateType
    // Re-validate against the merged state: an update may change the content
    // or the payload, never leave a poll without options.
    const extra =
      input.content !== undefined || input.extra !== undefined
        ? checkRich(
            type,
            input.content ?? existing.content,
            input.extra ?? parseExtra(existing.extra) ?? undefined,
            Boolean(input.mediaSourcePath ?? existing.mediaPath),
          )
        : undefined

    const mediaType = FILE_TYPES[type] ?? input.mediaType ?? existing.mediaType
    let mediaPath = existing.mediaPath
    if (input.mediaSourcePath && mediaType) {
      mediaPath = storeMedia(existing.id, input.mediaSourcePath, mediaType as MediaType)
    }

    const updated = await getPrisma().template.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(extra !== undefined ? { extra: extra ? JSON.stringify(extra) : null } : {}),
        ...(input.mediaType !== undefined ? { mediaType: input.mediaType } : {}),
        ...(mediaPath !== existing.mediaPath ? { mediaPath } : {}),
        ...(options ? { options: JSON.stringify(options) } : {}),
        ...(buttons ? { buttons: JSON.stringify(buttons) } : {}),
        ...(input.footer !== undefined ? { footer: input.footer.trim() || null } : {}),
        ...(input.listButtonText !== undefined
          ? { listButtonText: input.listButtonText.trim() || null }
          : {}),
      },
    })
    return serialize(updated)
  })

  registerHandler('template:usage', async ({ id }) => {
    await requireTemplate(id)
    const [campaigns, groupJobs] = await Promise.all([
      getPrisma().campaign.findMany({
        where: { templateId: id },
        select: { id: true, name: true },
      }),
      getPrisma().groupSendJob.count({ where: { templateId: id } }),
    ])
    return { campaigns, groupJobs }
  })

  registerHandler('template:delete', async ({ id }) => {
    await requireTemplate(id)

    // A template referenced by a campaign cannot be removed: the campaign's
    // queue rows would still point at it and the send would fail mid-run.
    const usedBy = await getPrisma().campaign.count({ where: { templateId: id } })
    if (usedBy > 0) {
      throw new AppError('CONFLICT', {
        userMessage: `This template is used by ${usedBy} campaign${
          usedBy === 1 ? '' : 's'
        } and cannot be deleted.`,
      })
    }

    await getPrisma().template.delete({ where: { id } })
    rmSync(mediaDir('templates', id), { recursive: true, force: true })
    return { ok: true as const }
  })

  registerHandler('template:preview', async ({ id, contactId }) => {
    const template = await requireTemplate(id)

    // Preview against a real contact when one is given, so what the user sees
    // is exactly what that person would receive.
    let values: Record<string, string> = {}
    if (contactId) {
      const contact = await getPrisma().contact.findUnique({ where: { id: contactId } })
      if (contact) {
        try {
          const parsed: unknown = JSON.parse(contact.data)
          if (parsed && typeof parsed === 'object') {
            values = Object.fromEntries(
              Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [
                k,
                String(v ?? ''),
              ]),
            )
          }
        } catch {
          values = { Name: contact.name, Mobile: contact.phone }
        }
      }
    }

    // One random variant, rendered the way a send renders it — spintax before
    // merge tags (see personalise in template-message.ts). Unresolved tags come
    // from the whole template so a tag in an option not picked this time is
    // still reported.
    const { text } = renderTemplate(spin(template.content), values)
    const { unresolved } = renderTemplate(template.content, values)
    return { rendered: text, unresolvedTags: unresolved }
  })
}
