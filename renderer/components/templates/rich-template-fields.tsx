'use client'

/** The type-specific part of the template dialog for the rich types (D89). */
import { FilePickerField } from '@renderer/components/common/file-picker-field'
import { MEDIA_FILTERS } from '@renderer/components/common/media-filters'
import type { TemplateType } from '@shared/types'
import { ProductPicker } from './product-picker'
import type { RichDraft } from './rich-draft'
import { ContactFields, EventFields, LocationFields, PollFields } from './rich-fields'

export function RichTemplateFields({
  type,
  draft,
  onChange,
  filePath,
  onFilePathChange,
}: {
  type: TemplateType
  draft: RichDraft
  onChange: (next: RichDraft) => void
  filePath: string
  onFilePathChange: (next: string) => void
}) {
  switch (type) {
    case 'voice':
      return (
        <FilePickerField
          testId="tpl-file-path"
          label="Audio file"
          hint="Arrives as a voice note. OGG/Opus plays natively; MP3, M4A, AAC and WAV send as audio. Up to 16 MB. The file is copied into the app."
          value={filePath}
          onChange={onFilePathChange}
          filters={MEDIA_FILTERS.audio}
        />
      )
    case 'sticker':
      return (
        <FilePickerField
          testId="tpl-file-path"
          label="Sticker file (.webp)"
          hint="WhatsApp stickers must be WebP, up to 1 MB (512×512 works best). The file is copied into the app."
          value={filePath}
          onChange={onFilePathChange}
          filters={MEDIA_FILTERS.sticker}
        />
      )
    case 'location':
      return (
        <LocationFields
          value={draft.location}
          onChange={(location) => onChange({ ...draft, location })}
        />
      )
    case 'contact':
      return (
        <ContactFields
          value={draft.contacts}
          onChange={(contacts) => onChange({ ...draft, contacts })}
        />
      )
    case 'poll':
      return (
        <PollFields
          value={draft.poll}
          onChange={(poll) => onChange({ ...draft, poll })}
        />
      )
    case 'event':
      return (
        <EventFields
          value={draft.event}
          onChange={(event) => onChange({ ...draft, event })}
        />
      )
    case 'product':
      return (
        <ProductPicker
          value={draft.product}
          onChange={(product) => onChange({ ...draft, product })}
        />
      )
    default:
      return null
  }
}
