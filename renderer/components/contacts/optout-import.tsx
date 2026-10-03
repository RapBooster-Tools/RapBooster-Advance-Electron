'use client'

import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'

const INPUT =
  'rounded-control border border-line px-2.5 py-1.5 text-sm outline-none focus:border-primary'

/**
 * Import a do-not-contact file and export the list.
 *
 * Like contact import, there is no default country code: the user says whether
 * the file's numbers carry one (REQUIREMENTS §7.5).
 */
export function OptOutImport({
  onImported,
  onExport,
}: {
  onImported: () => void
  onExport: () => void
}) {
  const toast = useToast()
  const [filePath, setFilePath] = useState('')
  const [country, setCountry] = useState<'included' | 'apply'>('included')
  const [prefix, setPrefix] = useState('')
  const [busy, setBusy] = useState(false)

  async function runImport() {
    if (filePath.trim() === '') {
      toast('error', 'Enter the path of a CSV or TXT file.')
      return
    }
    const digits = prefix.trim().replace(/^\+/, '').replace(/^00/, '').replace(/\D/g, '')
    const dialPrefix = digits === '' ? '' : `+${digits}`
    if (country === 'apply' && !/^\+[1-9]\d{0,3}$/.test(dialPrefix)) {
      toast('error', 'Enter the country code to apply, for example +91.')
      return
    }

    setBusy(true)
    const result = await window.api.invoke('suppression:import', {
      filePath: filePath.trim(),
      dialPrefix: country === 'apply' ? dialPrefix : null,
    })
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    const { added, invalid } = result.data
    toast(
      invalid > 0 ? 'warning' : 'success',
      `Imported ${added} opt-outs.` + (invalid > 0 ? ` ${invalid} invalid numbers.` : ''),
    )
    setFilePath('')
    onImported()
  }

  return (
    <section className="flex flex-wrap items-end gap-2 rounded-card border border-line bg-surface p-4">
      <div className="flex min-w-60 flex-1 flex-col gap-1.5">
        <label htmlFor="optout-import-path" className="text-xs font-semibold text-ink">
          Import a CSV or TXT file
        </label>
        <input
          id="optout-import-path"
          data-testid="optout-import-path"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          placeholder="C:\Users\you\do-not-contact.csv"
          className={`${INPUT} font-mono text-xs`}
        />
      </div>
      <select
        value={country}
        onChange={(e) => setCountry(e.target.value as typeof country)}
        aria-label="Do the numbers include their country code?"
        data-testid="optout-import-country"
        className={INPUT}
      >
        <option value="included">Numbers include the country code</option>
        <option value="apply">Add a country code</option>
      </select>
      {country === 'apply' && (
        <input
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="+91"
          aria-label="Country code to apply"
          data-testid="optout-import-prefix"
          className={`${INPUT} w-20 font-mono`}
        />
      )}
      <Button
        onClick={() => void runImport()}
        disabled={busy}
        data-testid="optout-import"
      >
        {busy ? 'Importing…' : 'Import'}
      </Button>
      <Button onClick={onExport} data-testid="optout-export">
        Export CSV
      </Button>
    </section>
  )
}
