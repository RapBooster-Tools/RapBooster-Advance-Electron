/**
 * One template → one wire payload.
 *
 * WHY this is shared: campaigns and group sends both send templates, and they
 * used to build the payload separately. The group path only ever built plain
 * text, so a media or button template lost everything but its body when sent to
 * a group — silently, because a text message is a perfectly valid thing to send.
 * One builder means a template behaves the same wherever it is used.
 */
import type { z } from 'zod'
import { renderTemplate } from '../../../shared/merge-tags'
import { richPayloadByType } from '../../../shared/rich-message'
import { spin } from '../../../shared/spintax'
import { decodeButtons } from '../../../shared/template-buttons'
import type { WaButton, WaOutgoing } from '../../../shared/wa-protocol'

export interface TemplateRow {
  type: string
  content: string
  mediaType: string | null
  mediaPath: string | null
  options: string | null
  buttons: string | null
  footer: string | null
  listButtonText: string | null
  /** Rich types' payload as JSON (shared/rich-message.ts). */
  extra?: string | null
}

/** Default label on the control that opens an interactive template's list. */
const DEFAULT_LIST_BUTTON = 'View options'

function parseOptions(json: string | null): string[] {
  if (!json) return []
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed)
      ? parsed.filter((o): o is string => typeof o === 'string' && o.trim() !== '')
      : []
  } catch {
    // A corrupt option list must not stop a send — it degrades to plain text.
    return []
  }
}

type PayloadType = keyof typeof richPayloadByType

/**
 * The stored payload for a rich type, or null when it is missing or invalid.
 * Re-validated on read because the column is free-form JSON on disk.
 */
function readPayload<T extends PayloadType>(
  type: T,
  json: string | null | undefined,
): z.infer<(typeof richPayloadByType)[T]> | null {
  if (!json) return null
  try {
    const parsed = richPayloadByType[type].safeParse(JSON.parse(json))
    return parsed.success ? (parsed.data as z.infer<(typeof richPayloadByType)[T]>) : null
  } catch (err) {
    // Degrades to the template's text (see buildRich) rather than failing the send.
    console.warn(`template: unreadable ${type} payload`, err)
    return null
  }
}

/** Ids are stable per position so a tapped reply can be traced back. */
function withIds(buttons: ReturnType<typeof decodeButtons>): WaButton[] {
  return buttons.map((button, index) => ({
    type: button.type,
    id: `btn_${index + 1}`,
    label: button.label,
    ...(button.value ? { value: button.value } : {}),
  }))
}

/**
 * Spintax first, merge tags second.
 *
 * WHY this order: merge values are customer data — a company name like
 * "Acme {East|West}" or a note containing braces would otherwise be read as
 * spintax and rewritten differently for every recipient. Spinning the template
 * alone means only text the user wrote can ever vary; `{{Tags}}` survive the
 * spin untouched (shared/spintax.ts) and are filled in afterwards.
 */
function personalise(
  text: string,
  values: Record<string, string>,
  rng: () => number,
): string {
  return renderTemplate(spin(text, rng), values).text
}

/**
 * The rich types (D89). Returns null when the template is missing the file or
 * payload it needs.
 *
 * WHY null rather than a throw: this runs inside the campaign worker's send
 * loop, after the template passed validation at save time. A throw there would
 * abort the worker for every remaining recipient over one corrupt row; sending
 * the template's text keeps the run going and the recipient still gets the
 * message's words.
 */
function buildRich(template: TemplateRow, text: string): WaOutgoing | null {
  switch (template.type) {
    case 'voice':
      return template.mediaPath
        ? { kind: 'audio', path: template.mediaPath, ptt: true }
        : null
    case 'sticker':
      return template.mediaPath ? { kind: 'sticker', path: template.mediaPath } : null
    case 'location': {
      const p = readPayload('location', template.extra)
      return p ? { kind: 'location', ...p } : null
    }
    case 'contact': {
      const p = readPayload('contact', template.extra)
      return p ? { kind: 'contacts', contacts: p.contacts } : null
    }
    case 'poll': {
      const p = readPayload('poll', template.extra)
      return p && text
        ? {
            kind: 'poll',
            name: text,
            options: p.options,
            selectableCount: p.selectableCount,
          }
        : null
    }
    case 'event': {
      const p = readPayload('event', template.extra)
      return p && text
        ? {
            kind: 'event',
            name: text,
            startAt: p.startAt,
            ...(p.description ? { description: p.description } : {}),
            ...(p.endAt ? { endAt: p.endAt } : {}),
            ...(p.location ? { location: p.location } : {}),
          }
        : null
    }
    case 'product': {
      const p = readPayload('product', template.extra)
      if (!p) return null
      return {
        kind: 'product',
        productId: p.productId,
        title: p.title,
        ...(p.description ? { description: p.description } : {}),
        ...(p.priceAmount1000 !== undefined
          ? { priceAmount1000: p.priceAmount1000 }
          : {}),
        ...(p.currency ? { currency: p.currency } : {}),
        ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
        ...(text ? { body: text } : {}),
      }
    }
    default:
      return null
  }
}

/**
 * Build one recipient's payload. Called once per recipient, so spintax gives
 * each person their own variant; `rng` is injectable for deterministic tests.
 */
export function buildTemplateMessage(
  template: TemplateRow,
  values: Record<string, string>,
  rng: () => number = Math.random,
): WaOutgoing {
  const text = personalise(template.content, values, rng)
  const footer = template.footer ? personalise(template.footer, values, rng).trim() : ''

  if (template.type === 'media' && template.mediaPath) {
    return {
      kind: 'media',
      path: template.mediaPath,
      mediaType: (template.mediaType as 'image' | 'video') ?? 'image',
      ...(text ? { caption: text } : {}),
    }
  }

  if (template.type === 'button') {
    const buttons = withIds(decodeButtons(template.buttons))
    if (buttons.length > 0) {
      return {
        kind: 'buttons',
        body: text,
        ...(footer ? { footer } : {}),
        buttons,
      }
    }
  }

  if (template.type === 'interactive') {
    const options = parseOptions(template.options)
    if (options.length > 0) {
      return {
        kind: 'list',
        body: text,
        ...(footer ? { footer } : {}),
        buttonText: template.listButtonText?.trim() || DEFAULT_LIST_BUTTON,
        rows: options.map((title, index) => ({ id: `row_${index + 1}`, title })),
      }
    }
  }

  const rich = buildRich(template, text)
  if (rich) return rich

  return { kind: 'text', body: footer ? `${text}\n\n${footer}` : text }
}
