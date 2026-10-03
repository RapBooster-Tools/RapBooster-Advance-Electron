import type {
  ContactPayload,
  EventPayload,
  LocationPayload,
  ProductPayload,
} from '@shared/rich-message'
import type { TemplateButtonType } from '@shared/types'

/**
 * One message as the phone preview draws it. Pure display data — callers map
 * their own state (a template draft, a campaign, an inbox message) onto it.
 * Merge tags and spintax should already be resolved by the caller, so the
 * preview shows what one real recipient would get.
 *
 * `src` on media is only drawn when it is a `data:` or `blob:` URL: the
 * renderer cannot read files from disk, and remote URLs are blocked by the
 * CSP. Without one, a tidy placeholder of the right shape is drawn instead.
 */
export type PreviewMessage =
  | { kind: 'text'; text: string }
  | { kind: 'image'; caption?: string; src?: string }
  | { kind: 'video'; caption?: string; src?: string; durationSec?: number }
  | {
      kind: 'document'
      fileName: string
      /** e.g. "2 pages · 1.4 MB". The file type is taken from the name. */
      detail?: string
      caption?: string
    }
  | {
      kind: 'buttons'
      text: string
      footer?: string
      buttons: ReadonlyArray<{ type: TemplateButtonType; label: string }>
    }
  | {
      kind: 'list'
      text: string
      footer?: string
      /** Label of the control that opens the list. Defaults to "View options". */
      buttonText?: string
      rows: readonly string[]
    }
  | { kind: 'voice'; durationSec?: number }
  | { kind: 'sticker'; src?: string }
  | ({ kind: 'location' } & LocationPayload)
  | ({ kind: 'contact' } & ContactPayload)
  | {
      kind: 'poll'
      question: string
      options: readonly string[]
      /** 1 = single choice (default); 0 = any number. */
      selectableCount?: number
    }
  | ({ kind: 'event'; name: string } & EventPayload)
  | {
      kind: 'product'
      product: Pick<
        ProductPayload,
        'title' | 'description' | 'priceAmount1000' | 'currency' | 'imageUrl'
      >
      /** The message sent with the product. */
      text?: string
    }

export type PreviewKind = PreviewMessage['kind']

/**
 * Whose phone the preview shows. `recipient` (default) is what the customer
 * sees: the business's message arriving on the left. `sender` is the
 * business's own phone, message on the right with delivery ticks.
 */
export type PreviewPerspective = 'recipient' | 'sender'
