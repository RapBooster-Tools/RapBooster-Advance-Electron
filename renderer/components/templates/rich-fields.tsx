'use client'

/**
 * Editors for the rich payloads, shared by the template dialog and the inbox
 * composer so a poll or a contact card is built the same way in both places.
 */
import type { ReactNode } from 'react'
import { Button } from '@renderer/components/ui/button'
import {
  emptyContact,
  MAX_POLL_OPTIONS,
  MAX_SHARED_CONTACTS,
  type ContactDraft,
  type EventDraft,
  type LocationDraft,
  type PollDraft,
} from './rich-draft'

export const INPUT_CLASS =
  'rounded-control border border-line px-2.5 py-2 text-sm text-ink outline-none focus:border-primary'

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-ink">
        {label}
      </label>
      {children}
    </div>
  )
}

export function LocationFields({
  value,
  onChange,
}: {
  value: LocationDraft
  onChange: (next: LocationDraft) => void
}) {
  const set = (patch: Partial<LocationDraft>) => onChange({ ...value, ...patch })
  return (
    <div className="flex flex-col gap-3" data-testid="rich-location">
      <div className="flex gap-2">
        <Field label="Latitude" htmlFor="rich-lat">
          <input
            id="rich-lat"
            data-testid="rich-lat"
            inputMode="decimal"
            value={value.latitude}
            onChange={(e) => set({ latitude: e.target.value })}
            placeholder="19.0760"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Longitude" htmlFor="rich-lng">
          <input
            id="rich-lng"
            data-testid="rich-lng"
            inputMode="decimal"
            value={value.longitude}
            onChange={(e) => set({ longitude: e.target.value })}
            placeholder="72.8777"
            className={INPUT_CLASS}
          />
        </Field>
      </div>
      <Field label="Place name (optional)" htmlFor="rich-loc-name">
        <input
          id="rich-loc-name"
          data-testid="rich-loc-name"
          value={value.name}
          maxLength={100}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Head office"
          className={INPUT_CLASS}
        />
      </Field>
      <Field label="Address (optional)" htmlFor="rich-loc-address">
        <input
          id="rich-loc-address"
          data-testid="rich-loc-address"
          value={value.address}
          maxLength={200}
          onChange={(e) => set({ address: e.target.value })}
          placeholder="Nariman Point, Mumbai"
          className={INPUT_CLASS}
        />
      </Field>
    </div>
  )
}

export function ContactFields({
  value,
  onChange,
}: {
  value: ContactDraft[]
  onChange: (next: ContactDraft[]) => void
}) {
  const update = (index: number, patch: Partial<ContactDraft>) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  return (
    <div className="flex flex-col gap-2" data-testid="rich-contacts">
      <span className="text-xs font-semibold text-ink">
        Contacts to share (max {MAX_SHARED_CONTACTS})
      </span>
      {value.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            aria-label={`Contact ${i + 1} name`}
            data-testid={`rich-contact-name-${i}`}
            value={row.name}
            maxLength={100}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Name"
            className={`${INPUT_CLASS} min-w-0 flex-1`}
          />
          <input
            aria-label={`Contact ${i + 1} phone`}
            data-testid={`rich-contact-phone-${i}`}
            value={row.phone}
            onChange={(e) => update(i, { phone: e.target.value })}
            placeholder="+919876543210"
            className={`${INPUT_CLASS} min-w-0 flex-1 font-mono`}
          />
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Remove contact ${i + 1}`}
            data-testid={`rich-contact-remove-${i}`}
            disabled={value.length === 1}
            onClick={() => onChange(value.filter((_, index) => index !== i))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        className="self-start"
        data-testid="rich-contact-add"
        disabled={value.length >= MAX_SHARED_CONTACTS}
        onClick={() => onChange([...value, emptyContact()])}
      >
        + Add contact
      </Button>
    </div>
  )
}

export function PollFields({
  value,
  onChange,
}: {
  value: PollDraft
  onChange: (next: PollDraft) => void
}) {
  const setOption = (index: number, text: string) =>
    onChange({
      ...value,
      options: value.options.map((o, i) => (i === index ? text : o)),
    })
  return (
    <div className="flex flex-col gap-2" data-testid="rich-poll">
      <span className="text-xs font-semibold text-ink">
        Options (2–{MAX_POLL_OPTIONS})
      </span>
      {value.options.map((option, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            aria-label={`Option ${i + 1}`}
            data-testid={`poll-option-${i}`}
            value={option}
            maxLength={100}
            onChange={(e) => setOption(i, e.target.value)}
            placeholder={`Option ${i + 1}`}
            className={`${INPUT_CLASS} min-w-0 flex-1`}
          />
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Remove option ${i + 1}`}
            data-testid={`poll-remove-option-${i}`}
            disabled={value.options.length <= 2}
            onClick={() =>
              onChange({ ...value, options: value.options.filter((_, idx) => idx !== i) })
            }
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        className="self-start"
        data-testid="poll-add-option"
        disabled={value.options.length >= MAX_POLL_OPTIONS}
        onClick={() => onChange({ ...value, options: [...value.options, ''] })}
      >
        + Add option
      </Button>
      <label className="flex items-center gap-2 text-xs text-ink">
        <input
          type="checkbox"
          data-testid="poll-multiple"
          checked={value.multiple}
          onChange={(e) => onChange({ ...value, multiple: e.target.checked })}
        />
        Allow more than one answer
      </label>
    </div>
  )
}

export function EventFields({
  value,
  onChange,
}: {
  value: EventDraft
  onChange: (next: EventDraft) => void
}) {
  const set = (patch: Partial<EventDraft>) => onChange({ ...value, ...patch })
  return (
    <div className="flex flex-col gap-3" data-testid="rich-event">
      <div className="flex gap-2">
        <Field label="Starts" htmlFor="event-start">
          <input
            id="event-start"
            type="datetime-local"
            data-testid="event-start"
            value={value.startAt}
            onChange={(e) => set({ startAt: e.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Ends (optional)" htmlFor="event-end">
          <input
            id="event-end"
            type="datetime-local"
            data-testid="event-end"
            value={value.endAt}
            onChange={(e) => set({ endAt: e.target.value })}
            className={INPUT_CLASS}
          />
        </Field>
      </div>
      <Field label="Where (optional)" htmlFor="event-location">
        <input
          id="event-location"
          data-testid="event-location"
          value={value.location}
          maxLength={200}
          onChange={(e) => set({ location: e.target.value })}
          placeholder="Store, address or meeting link"
          className={INPUT_CLASS}
        />
      </Field>
      <Field label="Description (optional)" htmlFor="event-description">
        <textarea
          id="event-description"
          data-testid="event-description"
          value={value.description}
          maxLength={1000}
          onChange={(e) => set({ description: e.target.value })}
          className={`${INPUT_CLASS} min-h-16 resize-y`}
        />
      </Field>
    </div>
  )
}

/** A file path, following the media template's input (there is no native picker channel). */
export function FilePathField({
  id,
  label,
  hint,
  placeholder,
  value,
  onChange,
}: {
  id: string
  label: string
  hint: string
  placeholder: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        data-testid={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT_CLASS} font-mono text-xs`}
      />
      <p className="text-xs text-ink-subtle">{hint}</p>
    </div>
  )
}
