'use client'

import { FileUp, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { useToast } from '@renderer/components/providers/toast-provider'

export interface FileFilter {
  name: string
  extensions: string[]
}

/** The file name alone, for display: the full path means nothing to most users. */
export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/**
 * Choose a file with the system's own "Open" dialog.
 *
 * The customer rule (D96): nobody is ever asked to type a file path. Every
 * file input in the app is this component, so the behaviour — a button, the
 * chosen file's name, a way to clear it — is the same on every screen.
 *
 * `testId` names the button (`<testId>`), the chosen name (`<testId>-name`)
 * and the clear button (`<testId>-clear`).
 */
export function FilePickerField({
  label,
  hint,
  value,
  onChange,
  filters,
  dialogTitle,
  testId,
  disabled = false,
}: {
  label: string
  hint?: string
  value: string
  onChange: (path: string) => void
  filters: FileFilter[]
  dialogTitle?: string
  testId?: string
  disabled?: boolean
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function choose() {
    setBusy(true)
    const result = await window.api.invoke('system:pickFile', {
      title: dialogTitle ?? label,
      filters,
    })
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    // An empty list means the user cancelled: keep whatever was chosen before.
    const [path] = result.data.paths
    if (path) onChange(path)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <Button
          onClick={() => void choose()}
          disabled={disabled || busy}
          data-testid={testId}
          size="sm"
        >
          <FileUp size={14} aria-hidden />
          {value ? 'Choose another…' : 'Choose file…'}
        </Button>
        {value ? (
          <>
            <span
              className="min-w-0 truncate text-sm text-ink"
              title={value}
              data-testid={testId ? `${testId}-name` : undefined}
            >
              {fileName(value)}
            </span>
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={disabled}
              aria-label="Remove the chosen file"
              data-testid={testId ? `${testId}-clear` : undefined}
              className="rounded-control p-1 text-ink-muted hover:bg-wa-in hover:text-ink"
            >
              <X size={14} aria-hidden />
            </button>
          </>
        ) : (
          <span className="text-xs text-ink-muted">No file chosen</span>
        )}
      </div>
      {hint && <p className="text-xs text-ink-subtle">{hint}</p>}
    </div>
  )
}
