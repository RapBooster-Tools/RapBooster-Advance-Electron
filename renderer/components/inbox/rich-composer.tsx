'use client'

/**
 * The inbox attach menu: send a location, contact card, poll, voice note or
 * sticker into the open chat (D89). Each goes out through `chat:sendRich`, the
 * same paced path as a typed reply.
 */
import { useCallback, useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import {
  emptyContact,
  emptyLocation,
  emptyPoll,
  toContacts,
  toLocation,
  toPoll,
  type ContactDraft,
  type LocationDraft,
  type PollDraft,
} from '@renderer/components/templates/rich-draft'
import {
  ContactFields,
  INPUT_CLASS,
  LocationFields,
  PollFields,
} from '@renderer/components/templates/rich-fields'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import type { IpcResponse } from '@shared/ipc'
import type { InboxRichMessage } from '@shared/rich-message'
import { fileNameOf, pickOneFile } from './inbox-types'

type Kind = InboxRichMessage['kind']
type SentMessage = IpcResponse<'chat:sendRich'>

const KIND_LABEL: Record<Kind, string> = {
  location: '📍 Location',
  contact: '👤 Contact card',
  poll: '📊 Poll',
  voice: '🎤 Voice note',
  sticker: '🏷️ Sticker',
}

const DIALOG_TITLE: Record<Kind, string> = {
  location: 'Send a location',
  contact: 'Share contact cards',
  poll: 'Send a poll',
  voice: 'Send a voice note',
  sticker: 'Send a sticker',
}

const FILE_KIND: Record<
  'voice' | 'sticker',
  { filter: { name: string; extensions: string[] }; hint: string }
> = {
  voice: {
    filter: { name: 'Audio', extensions: ['ogg', 'opus', 'mp3', 'm4a', 'aac', 'wav'] },
    hint: 'OGG/Opus arrives as a voice note; MP3, M4A, AAC and WAV also work. Up to 16 MB.',
  },
  sticker: {
    filter: { name: 'Stickers', extensions: ['webp'] },
    hint: 'Stickers must be WebP, up to 1 MB.',
  },
}

export function RichComposer({
  chatId,
  onSent,
}: {
  chatId: string
  onSent: (message: SentMessage) => void
}) {
  const toast = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [kind, setKind] = useState<Kind>()
  const [location, setLocation] = useState<LocationDraft>(emptyLocation)
  const [contacts, setContacts] = useState<ContactDraft[]>(() => [emptyContact()])
  const [question, setQuestion] = useState('')
  const [poll, setPoll] = useState<PollDraft>(emptyPoll)
  const [filePath, setFilePath] = useState('')
  const [error, setError] = useState<string>()
  const [sending, setSending] = useState(false)

  function open(next: Kind) {
    setMenuOpen(false)
    setKind(next)
    setError(undefined)
  }

  // Stable on purpose: Dialog re-runs its focus effect whenever onClose changes,
  // and a new function per render would pull focus out of the field being typed in.
  const close = useCallback(() => {
    setKind(undefined)
    setLocation(emptyLocation())
    setContacts([emptyContact()])
    setQuestion('')
    setPoll(emptyPoll())
    setFilePath('')
    setError(undefined)
  }, [])

  function build(current: Kind): InboxRichMessage | string {
    switch (current) {
      case 'location': {
        const r = toLocation(location)
        return r.ok ? { kind: 'location', payload: r.value } : r.error
      }
      case 'contact': {
        const r = toContacts(contacts)
        return r.ok ? { kind: 'contact', payload: r.value } : r.error
      }
      case 'poll': {
        if (question.trim() === '') return 'Write the poll question.'
        const r = toPoll(poll)
        return r.ok
          ? { kind: 'poll', question: question.trim(), payload: r.value }
          : r.error
      }
      case 'voice':
      case 'sticker':
        return filePath === ''
          ? 'Choose the file to send.'
          : { kind: current, mediaSourcePath: filePath }
    }
  }

  async function chooseFile(current: 'voice' | 'sticker') {
    const picked = await pickOneFile(DIALOG_TITLE[current], [FILE_KIND[current].filter])
    if (picked.error) setError(picked.error)
    else if (picked.path) {
      setFilePath(picked.path)
      setError(undefined)
    }
  }

  async function send() {
    if (!kind || sending) return
    const message = build(kind)
    if (typeof message === 'string') {
      setError(message)
      return
    }
    setSending(true)
    const result = await window.api.invoke('chat:sendRich', { chatId, message })
    setSending(false)
    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }
    onSent(result.data)
    toast('success', 'Sent')
    close()
  }

  return (
    <div className="relative">
      <Button
        size="sm"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Attach"
        onClick={() => setMenuOpen((o) => !o)}
        data-testid="rich-attach"
      >
        📎
      </Button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-10 mb-1 flex w-44 flex-col rounded-card border border-line bg-surface py-1 shadow-lg"
          data-testid="rich-menu"
        >
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="menuitem"
              onClick={() => open(k)}
              data-testid={`rich-option-${k}`}
              className="px-3 py-1.5 text-left text-sm text-ink hover:bg-wa-in"
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}

      {kind && (
        <Dialog
          open
          onClose={close}
          title={DIALOG_TITLE[kind]}
          testId="rich-dialog"
          footer={
            <>
              <Button onClick={close}>Cancel</Button>
              <Button
                variant="primary"
                disabled={sending}
                onClick={() => void send()}
                data-testid="rich-send"
              >
                Send
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            {kind === 'location' && (
              <LocationFields value={location} onChange={setLocation} />
            )}
            {kind === 'contact' && (
              <ContactFields value={contacts} onChange={setContacts} />
            )}
            {kind === 'poll' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="rich-poll-question"
                    className="text-xs font-semibold text-ink"
                  >
                    Question
                  </label>
                  <input
                    id="rich-poll-question"
                    data-testid="rich-poll-question"
                    value={question}
                    maxLength={255}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Which day suits you?"
                    className={INPUT_CLASS}
                  />
                </div>
                <PollFields value={poll} onChange={setPoll} />
              </>
            )}
            {(kind === 'voice' || kind === 'sticker') && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-ink">File</span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => void chooseFile(kind)}
                    data-testid="rich-pick-file"
                  >
                    Choose file…
                  </Button>
                  <span
                    className="min-w-0 truncate text-xs text-ink"
                    data-testid="rich-file-name"
                  >
                    {filePath ? fileNameOf(filePath) : 'No file chosen'}
                  </span>
                </div>
                <p className="text-xs text-ink-subtle">{FILE_KIND[kind].hint}</p>
              </div>
            )}
            {error && (
              <p className="text-xs text-danger" role="alert" data-testid="rich-error">
                {error}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </div>
  )
}
