'use client'

import { useState } from 'react'
import { FilePickerField } from '@renderer/components/common/file-picker-field'
import {
  ImportOptions,
  type CountryAnswer,
  type DuplicatePolicy,
  type Preview,
} from '@renderer/components/contacts/import-options'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/cn'

type Source = 'file' | 'sheet'

/** Mirrors the contract's check, so a wrong link gets a useful message here. */
const SHEET_URL = /^https:\/\/docs\.google\.com\/spreadsheets\//

const IMPORT_FILTERS = [
  { name: 'Contact files', extensions: ['csv', 'xlsx', 'vcf'] },
  { name: 'CSV', extensions: ['csv'] },
  { name: 'Excel workbook', extensions: ['xlsx'] },
  { name: 'Contact cards (vCard)', extensions: ['vcf'] },
]

/** Column names people use for a phone number, beyond the field's own name. */
const PHONE_HEADERS = [
  'phone',
  'mobile',
  'mobile number',
  'phone number',
  'number',
  'whatsapp',
  'whatsapp number',
  'contact',
  'contact number',
  'cell',
]

/**
 * Pre-map a header to a field whose name matches it, case-insensitively, and
 * any of the usual phone column names to Mobile. The user still sees and
 * confirms every mapping.
 */
function guessMapping(headers: string[], fields: string[]): Record<string, string> {
  const guessed: Record<string, string> = {}
  for (const header of headers) {
    const h = header.trim().toLowerCase()
    const match =
      fields.find((f) => f.toLowerCase() === h) ??
      (PHONE_HEADERS.includes(h) && fields.includes('Mobile') ? 'Mobile' : undefined)
    if (match && !Object.values(guessed).includes(match)) guessed[header] = match
  }
  return guessed
}

/**
 * Import from a file (CSV, Excel or vCard) or a Google Sheet, with an explicit column-mapping
 * step.
 *
 * The prototype mapped columns by position. Making the user confirm the mapping
 * costs one screen and prevents an exported file with reordered columns from
 * silently writing phone numbers into the name field. Both sources share that
 * step and the same importer in main.
 */
export function ImportDialog({
  listId,
  fields,
  onClose,
  onImported,
}: {
  listId: string
  fields: string[]
  onClose: () => void
  onImported: (summary: string) => void
}) {
  const [source, setSource] = useState<Source>('file')
  const [filePath, setFilePath] = useState('')
  const [sheetUrl, setSheetUrl] = useState('')
  const [preview, setPreview] = useState<Preview>()
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [policy, setPolicy] = useState<DuplicatePolicy>('skip')
  // Deliberately starts unanswered: there is no default country code, because a
  // list normalized against the wrong one is only discoverable after the
  // messages have gone to the wrong people (REQUIREMENTS §7.5).
  const [countryAnswer, setCountryAnswer] = useState<CountryAnswer>('')
  const [prefix, setPrefix] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  function switchSource(next: Source) {
    setSource(next)
    setPreview(undefined)
    setMapping({})
    setError(undefined)
  }

  async function loadPreview() {
    if (source === 'file' && filePath === '') {
      setError('Choose a file first.')
      return
    }
    if (source === 'sheet' && !SHEET_URL.test(sheetUrl.trim())) {
      setError('Paste a Google Sheets link (docs.google.com/spreadsheets/…).')
      return
    }
    setBusy(true)
    setError(undefined)

    const result =
      source === 'file'
        ? await window.api.invoke('contacts:importPreview', { filePath })
        : await window.api.invoke('contacts:sheetPreview', { url: sheetUrl.trim() })
    setBusy(false)

    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }

    setPreview(result.data)
    setMapping(guessMapping(result.data.headers, fields))
  }

  async function runImport() {
    if (!Object.values(mapping).includes('Mobile')) {
      setError('One column must be mapped to Mobile — it is the number we send to.')
      return
    }
    if (countryAnswer === '') {
      setError('Answer whether these numbers already include their country code.')
      return
    }

    // Accept +91, 0091 or 91 — they all mean the same thing to a user.
    const digits = prefix.trim().replace(/^\+/, '').replace(/^00/, '').replace(/\D/g, '')
    const normalizedPrefix = digits === '' ? '' : `+${digits}`
    if (countryAnswer === 'apply' && !/^\+[1-9]\d{0,3}$/.test(normalizedPrefix)) {
      setError('Enter the country code to apply, for example +91.')
      return
    }

    setBusy(true)
    setError(undefined)

    const common = {
      listId,
      mapping,
      duplicatePolicy: policy,
      dialPrefix: countryAnswer === 'apply' ? normalizedPrefix : null,
    }
    const result =
      source === 'file'
        ? await window.api.invoke('contacts:import', { ...common, filePath })
        : await window.api.invoke('contacts:importSheet', {
            ...common,
            url: sheetUrl.trim(),
          })
    setBusy(false)

    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }

    const { imported, skipped, invalid, errorReportPath } = result.data
    onImported(
      `Imported ${imported}. Skipped ${skipped}. Invalid ${invalid}.` +
        (errorReportPath ? ' An error report was saved to your exports folder.' : ''),
    )
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Import contacts"
      testId="import-dialog"
      width={640}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {preview ? (
            <Button
              variant="primary"
              onClick={() => void runImport()}
              disabled={busy}
              data-testid="run-import"
            >
              {busy ? 'Importing…' : `Import ${preview.totalRows} rows`}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => void loadPreview()}
              disabled={busy}
              data-testid="load-preview"
            >
              {busy ? 'Reading…' : source === 'file' ? 'Read file' : 'Read sheet'}
            </Button>
          )}
        </>
      }
    >
      <div className="mb-3 flex gap-1" role="tablist" aria-label="Import source">
        {(
          [
            ['file', 'From a file'],
            ['sheet', 'Google Sheets'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={source === value}
            data-testid={`import-source-${value}`}
            onClick={() => switchSource(value)}
            className={cn(
              'rounded-control px-3 py-1 text-xs',
              source === value
                ? 'bg-primary font-medium text-white'
                : 'border border-line text-ink-muted hover:bg-wa-in',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {source === 'file' ? (
        <div className="flex flex-col gap-2">
          <FilePickerField
            label="Contacts file"
            value={filePath}
            onChange={(path) => {
              setFilePath(path)
              setPreview(undefined)
              setError(undefined)
            }}
            filters={IMPORT_FILTERS}
            dialogTitle="Choose a contacts file"
            testId="import-file"
          />
          <ul className="list-disc pl-5 text-[11px] text-ink-muted">
            <li>
              <strong>CSV (.csv)</strong> — exported from Excel, Google Sheets or most
              apps. The first row holds the column names.
            </li>
            <li>
              <strong>Excel (.xlsx)</strong> — the first sheet is imported, first row as
              column names. Long phone numbers are kept exactly as typed.
            </li>
            <li>
              <strong>Contact cards (.vcf)</strong> — exported from a phone or from
              Google/Outlook contacts. Each card becomes one contact; its mobile number is
              used, and any other numbers are kept in &ldquo;Other phones&rdquo;.
            </li>
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sheet-url" className="text-xs font-semibold text-ink">
            Google Sheets link
          </label>
          <input
            id="sheet-url"
            data-testid="sheet-url"
            value={sheetUrl}
            onChange={(e) => {
              setSheetUrl(e.target.value)
              setPreview(undefined)
            }}
            placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
            className="rounded-control border border-line px-2.5 py-2 font-mono text-xs outline-none focus:border-primary"
          />
          <p className="text-[11px] text-ink-muted">
            Share the sheet as &ldquo;Anyone with the link can view&rdquo;. The tab in the
            link is the one imported.
          </p>
        </div>
      )}

      {preview && (
        <ImportOptions
          preview={preview}
          fields={fields}
          mapping={mapping}
          onMapping={setMapping}
          countryAnswer={countryAnswer}
          onCountryAnswer={setCountryAnswer}
          prefix={prefix}
          onPrefix={setPrefix}
          policy={policy}
          onPolicy={setPolicy}
        />
      )}

      {error && (
        <p className="mt-3 text-xs text-danger" role="alert" data-testid="import-error">
          {error}
        </p>
      )}
    </Dialog>
  )
}
