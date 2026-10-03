/**
 * Save-time rules for templates that the zod contract cannot express alone:
 * per-type required fields, rich payload checks and button cleanup.
 *
 * Split from template.ipc.ts so the handler module stays about wiring; these
 * rules are what decide whether a template can ever be sent.
 */
import { AppError } from '../../../shared/errors'
import { richPayloadByType, type RichPayload } from '../../../shared/rich-message'
import { validateButtons } from '../../../shared/template-buttons'
import type { MediaType, TemplateButton, TemplateType } from '../../../shared/types'

/** Types whose payload lives in `extra`, and the schema it must satisfy. */
const PAYLOAD_TYPES = new Set(Object.keys(richPayloadByType))
/** Types sent as a file with no text of their own. */
export const FILE_TYPES: Partial<Record<TemplateType, MediaType>> = {
  voice: 'audio',
  sticker: 'sticker',
}

/**
 * Types whose message carries no text of its own: a location pin or a contact
 * card has nowhere to show `content`, so it is not required for them. Any text
 * given is still kept — it is what the send falls back to if the payload is
 * ever unreadable (services/template-message.ts).
 */
const TEXTLESS_TYPES = new Set<TemplateType>(['voice', 'sticker', 'location', 'contact'])

/**
 * Per-type rules the zod contract cannot express on its own. Returns the
 * validated payload to store, or null for types that carry none.
 */
export function checkRich(
  type: TemplateType,
  content: string,
  extra: RichPayload | undefined,
  hasMedia: boolean,
): RichPayload | null {
  if (!TEXTLESS_TYPES.has(type) && content.trim() === '') {
    throw new AppError('VALIDATION_FAILED', {
      userMessage:
        type === 'poll'
          ? 'Write the poll question.'
          : type === 'event'
            ? 'Give the event a name.'
            : 'Template content is required.',
    })
  }
  if (FILE_TYPES[type] && !hasMedia) {
    throw new AppError('VALIDATION_FAILED', {
      userMessage:
        type === 'voice'
          ? 'Choose an audio file for the voice note.'
          : 'Choose a .webp sticker.',
    })
  }
  if (!PAYLOAD_TYPES.has(type)) return null
  const schema = richPayloadByType[type as keyof typeof richPayloadByType]
  const parsed = schema.safeParse(extra)
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', {
      userMessage: parsed.error.issues[0]?.message ?? `Complete the ${type} details.`,
    })
  }
  const payload = parsed.data
  if (type === 'poll' && 'options' in payload) {
    // WhatsApp's limits for a poll; the question is the template's content.
    if (content.trim().length > 255) {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'Keep the poll question under 255 characters.',
      })
    }
    if (
      new Set(payload.options.map((o) => o.trim().toLowerCase())).size !==
      payload.options.length
    ) {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'Each poll option must be different.',
      })
    }
    if (payload.selectableCount > payload.options.length) {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'A poll cannot allow more choices than it has options.',
      })
    }
  }
  if (type === 'event' && 'startAt' in payload && payload.endAt) {
    if (Date.parse(payload.endAt) <= Date.parse(payload.startAt)) {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'The event must end after it starts.',
      })
    }
  }
  return payload
}

export function checkButtons(
  buttons: TemplateButton[] | undefined,
): TemplateButton[] | undefined {
  if (!buttons) return undefined
  const cleaned = buttons
    .map((b) => ({
      ...b,
      label: b.label.trim(),
      ...(b.value ? { value: b.value.trim() } : {}),
    }))
    .filter((b) => b.label !== '')

  const problem = validateButtons(cleaned)
  if (problem) throw new AppError('VALIDATION_FAILED', { userMessage: problem })
  return cleaned
}
