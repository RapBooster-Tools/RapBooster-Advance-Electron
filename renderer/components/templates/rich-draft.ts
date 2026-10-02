/**
 * Editor state for the rich template types and the inbox composer, and its
 * conversion to the wire payloads in shared/rich-message.ts.
 *
 * WHY strings everywhere: inputs stay controlled, so a half-typed latitude is
 * held as text and only parsed on submit. The shared zod schemas are the final
 * word; the checks here exist to give a sentence a person can act on instead
 * of a schema message.
 */
import {
  contactPayload,
  eventPayload,
  locationPayload,
  MAX_POLL_OPTIONS,
  MAX_SHARED_CONTACTS,
  pollPayload,
  type ContactPayload,
  type EventPayload,
  type LocationPayload,
  type PollPayload,
  type ProductPayload,
  type RichPayload,
} from '@shared/rich-message'
import type { TemplateType } from '@shared/types'

export interface LocationDraft {
  latitude: string
  longitude: string
  name: string
  address: string
}

export interface ContactDraft {
  name: string
  phone: string
}

export interface PollDraft {
  options: string[]
  multiple: boolean
}

export interface EventDraft {
  description: string
  /** `datetime-local` values: local wall-clock time, no offset. */
  startAt: string
  endAt: string
  location: string
}

export interface RichDraft {
  location: LocationDraft
  contacts: ContactDraft[]
  poll: PollDraft
  event: EventDraft
  /** Chosen from a device's catalog; null until one is picked. */
  product: ProductPayload | null
}

export const emptyLocation = (): LocationDraft => ({
  latitude: '',
  longitude: '',
  name: '',
  address: '',
})
export const emptyContact = (): ContactDraft => ({ name: '', phone: '' })
export const emptyPoll = (): PollDraft => ({ options: ['', ''], multiple: false })

export const emptyRichDraft = (): RichDraft => ({
  location: emptyLocation(),
  contacts: [emptyContact()],
  poll: emptyPoll(),
  event: { description: '', startAt: '', endAt: '', location: '' },
  product: null,
})

export { MAX_POLL_OPTIONS, MAX_SHARED_CONTACTS }

/** Template types sent as a file the user picks. */
export const FILE_TEMPLATE_TYPES: TemplateType[] = ['voice', 'sticker']
/** Template types whose message has no text of its own. */
export const TEXTLESS_TEMPLATE_TYPES: TemplateType[] = [
  'voice',
  'sticker',
  'location',
  'contact',
]

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

function firstIssue(error: { issues: Array<{ message: string }> }, fallback: string) {
  return error.issues[0]?.message ?? fallback
}

export function toLocation(draft: LocationDraft): Result<LocationPayload> {
  const latitude = Number(draft.latitude)
  const longitude = Number(draft.longitude)
  if (draft.latitude.trim() === '' || draft.longitude.trim() === '') {
    return fail('Enter both latitude and longitude.')
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return fail('Latitude must be a number between -90 and 90.')
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return fail('Longitude must be a number between -180 and 180.')
  }
  const parsed = locationPayload.safeParse({
    latitude,
    longitude,
    ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
    ...(draft.address.trim() ? { address: draft.address.trim() } : {}),
  })
  return parsed.success
    ? { ok: true, value: parsed.data }
    : fail(firstIssue(parsed.error, 'Check the location details.'))
}

export function toContacts(rows: ContactDraft[]): Result<ContactPayload> {
  const filled = rows
    .map((r) => ({ name: r.name.trim(), phone: r.phone.replace(/[\s()-]/g, '') }))
    .filter((r) => r.name !== '' || r.phone !== '')
  if (filled.length === 0) return fail('Add at least one contact.')
  const missingName = filled.find((r) => r.name === '')
  if (missingName) return fail(`Give ${missingName.phone} a name.`)
  const parsed = contactPayload.safeParse({ contacts: filled })
  return parsed.success
    ? { ok: true, value: parsed.data }
    : fail(firstIssue(parsed.error, 'Check the contact details.'))
}

export function toPoll(draft: PollDraft): Result<PollPayload> {
  const options = draft.options.map((o) => o.trim()).filter((o) => o !== '')
  if (options.length < 2) return fail('A poll needs at least two options.')
  if (options.length > MAX_POLL_OPTIONS) {
    return fail(`A poll can have at most ${MAX_POLL_OPTIONS} options.`)
  }
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    return fail('Each poll option must be different.')
  }
  // WhatsApp's own encoding: 1 = pick one, 0 = pick any number.
  const parsed = pollPayload.safeParse({
    options,
    selectableCount: draft.multiple ? 0 : 1,
  })
  return parsed.success
    ? { ok: true, value: parsed.data }
    : fail(firstIssue(parsed.error, 'Check the poll options.'))
}

/**
 * `2026-10-10T18:30` (local) → `2026-10-10T18:30:00+05:30`.
 *
 * WHY keep the offset rather than converting to UTC: the event is shown to
 * recipients in their own timezone either way, but an offset-bearing string
 * still reads correctly to the person who wrote it when the template is opened.
 */
export function localToIso(value: string): string | null {
  if (value.trim() === '') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00` +
    `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
  )
}

export function toEvent(draft: EventDraft): Result<EventPayload> {
  const startAt = localToIso(draft.startAt)
  if (!startAt) return fail('Choose when the event starts.')
  const endAt = localToIso(draft.endAt)
  if (endAt && Date.parse(endAt) <= Date.parse(startAt)) {
    return fail('The event must end after it starts.')
  }
  const parsed = eventPayload.safeParse({
    startAt,
    ...(endAt ? { endAt } : {}),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.location.trim() ? { location: draft.location.trim() } : {}),
  })
  return parsed.success
    ? { ok: true, value: parsed.data }
    : fail(firstIssue(parsed.error, 'Check the event details.'))
}

/** The `extra` payload for a template type; `value: undefined` for types without one. */
export function draftToExtra(
  type: TemplateType,
  draft: RichDraft,
): Result<RichPayload | undefined> {
  switch (type) {
    case 'location':
      return toLocation(draft.location)
    case 'contact':
      return toContacts(draft.contacts)
    case 'poll':
      return toPoll(draft.poll)
    case 'event':
      return toEvent(draft.event)
    case 'product':
      return draft.product
        ? { ok: true, value: draft.product }
        : fail('Choose a product from a device catalog.')
    default:
      return { ok: true, value: undefined }
  }
}
