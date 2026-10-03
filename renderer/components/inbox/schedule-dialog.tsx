'use client'

/**
 * Write a reply now and have it sent later, from this chat's own WhatsApp
 * number. It obeys the same pacing, daily limit and quiet hours as campaigns.
 */
import { format } from 'date-fns'
import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { fileNameOf, pickOneFile } from './inbox-types'

const INPUT =
  'rounded-control border border-line bg-surface px-2.5 py-2 text-sm text-ink outline-none focus:border-primary'

const FILE_FILTERS = [
  {
    name: 'Photos, videos and documents',
    extensions: [
      'jpg',
      'jpeg',
      'png',
      'webp',
      'gif',
      'mp4',
      '3gp',
      'mkv',
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'txt',
      'csv',
      'zip',
    ],
  },
  { name: 'All files', extensions: ['*'] },
]

/** `datetime-local` wants local time without seconds or zone. */
function localInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm")
}

/** An hour from now, on the next five minutes — a sensible first suggestion. */
function defaultSendAt(): string {
  const at = new Date(Date.now() + 60 * 60_000)
  at.setMinutes(Math.ceil(at.getMinutes() / 5) * 5, 0, 0)
  return localInputValue(at)
}

export function ScheduleDialog({
  chatId,
  initialBody,
  onClose,
  onScheduled,
}: {
  chatId: string
  initialBody: string
  onClose: () => void
  onScheduled: () => void
}) {
  const toast = useToast()
  const [sendAt, setSendAt] = useState(defaultSendAt)
  const [body, setBody] = useState(initialBody)
  const [filePath, setFilePath] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function chooseFile() {
    const picked = await pickOneFile('Choose a file to send', FILE_FILTERS)
    if (picked.error) setError(picked.error)
    else if (picked.path) setFilePath(picked.path)
  }

  async function submit() {
    if (busy) return
    const at = new Date(sendAt)
    if (Number.isNaN(at.getTime())) {
      setError('Pick the date and time to send it.')
      return
    }
    setBusy(true)
    const result = await window.api.invoke('scheduledMessage:create', {
      chatId,
      body,
      sendAt: at.toISOString(),
      ...(filePath ? { mediaSourcePath: filePath } : {}),
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }
    toast('success', `Message scheduled for ${format(at, 'd MMM, h:mm a')}`)
    onScheduled()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Schedule a message"
      testId="schedule-dialog"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void submit()}
            data-testid="schedule-submit"
          >
            Schedule
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-help="inbox-schedule">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink">
          Send on
          <input
            type="datetime-local"
            value={sendAt}
            onChange={(e) => setSendAt(e.target.value)}
            data-testid="schedule-at"
            className={INPUT}
          />
          <span className="font-normal text-ink-subtle">
            Uses your computer’s clock. The app must be running at that time; if it is
            closed, the message goes out as soon as it is opened again.
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink">
          Message
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={4096}
            placeholder="Type the message to send later…"
            data-testid="schedule-body"
            className={INPUT}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-ink">Attachment (optional)</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => void chooseFile()}
              data-testid="schedule-pick-file"
            >
              Choose file…
            </Button>
            {filePath ? (
              <>
                <span
                  className="min-w-0 truncate text-xs text-ink"
                  data-testid="schedule-file-name"
                >
                  📎 {fileNameOf(filePath)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFilePath(undefined)}
                  data-testid="schedule-file-remove"
                >
                  Remove
                </Button>
              </>
            ) : (
              <span className="text-xs text-ink-subtle">No file chosen</span>
            )}
          </div>
          <span className="text-xs text-ink-subtle">
            Photos and videos go out with your message as the caption; other files arrive
            as documents.
          </span>
        </div>
        {error && (
          <p className="text-xs text-danger" role="alert" data-testid="schedule-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
