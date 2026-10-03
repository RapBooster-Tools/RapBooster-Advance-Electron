'use client'

import { FieldHelp } from '@renderer/components/help/field-help'

export interface Preview {
  headers: string[]
  sampleRows: string[][]
  totalRows: number
}

export type CountryAnswer = '' | 'included' | 'apply'
export type DuplicatePolicy = 'skip' | 'overwrite' | 'allow'

const SELECT =
  'rounded-control border border-line px-2 py-1.5 text-sm outline-none focus:border-primary'

/**
 * The mapping step shared by every import source: column mapping, the country
 * code question, the duplicate policy and a sample of the rows.
 */
export function ImportOptions({
  preview,
  fields,
  mapping,
  onMapping,
  countryAnswer,
  onCountryAnswer,
  prefix,
  onPrefix,
  policy,
  onPolicy,
}: {
  preview: Preview
  fields: string[]
  mapping: Record<string, string>
  onMapping: (next: Record<string, string>) => void
  countryAnswer: CountryAnswer
  onCountryAnswer: (value: CountryAnswer) => void
  prefix: string
  onPrefix: (value: string) => void
  policy: DuplicatePolicy
  onPolicy: (value: DuplicatePolicy) => void
}) {
  return (
    <>
      <p className="mt-4 text-xs text-ink-muted">
        {preview.totalRows} rows found. Map each column to a field — unmapped columns are
        ignored.
      </p>

      <div className="mt-2 flex flex-col gap-2" data-testid="column-mapping">
        {preview.headers.map((header) => (
          <div key={header} className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate font-mono text-xs text-ink">
              {header}
            </span>
            <span className="text-ink-subtle">→</span>
            <select
              value={mapping[header] ?? ''}
              data-testid={`map-${header}`}
              onChange={(e) => {
                const next = { ...mapping }
                if (e.target.value === '') delete next[header]
                else next[header] = e.target.value
                onMapping(next)
              }}
              className={`${SELECT} flex-1`}
            >
              <option value="">— Ignore —</option>
              {fields.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <span className="flex items-center gap-1">
          <label htmlFor="country-answer" className="text-xs font-semibold text-ink">
            Do these numbers already include their country code?
          </label>
          <FieldHelp id="dial-prefix" />
        </span>
        <select
          id="country-answer"
          data-testid="country-answer"
          value={countryAnswer}
          onChange={(e) => onCountryAnswer(e.target.value as CountryAnswer)}
          className={SELECT}
        >
          <option value="">— Choose one —</option>
          <option value="included">
            Yes — every number starts with its country code
          </option>
          <option value="apply">No — add this country code to all of them</option>
        </select>
        {countryAnswer === 'apply' && (
          <input
            data-testid="dial-prefix"
            value={prefix}
            onChange={(e) => onPrefix(e.target.value)}
            placeholder="+91"
            aria-label="Country code to apply"
            className="mt-1 w-32 rounded-control border border-line px-2.5 py-2 font-mono text-xs outline-none focus:border-primary"
          />
        )}
        <p className="text-[11px] text-ink-muted">
          There is no default. A number that already starts with <code>+</code> keeps its
          own country code either way; anything left without one is reported in the error
          file instead of being guessed at.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <span className="flex items-center gap-1">
          <label htmlFor="dupe-policy" className="text-xs font-semibold text-ink">
            When a number already exists in this list
          </label>
          <FieldHelp id="duplicate-policy" />
        </span>
        <select
          id="dupe-policy"
          data-testid="dupe-policy"
          value={policy}
          onChange={(e) => onPolicy(e.target.value as DuplicatePolicy)}
          className={SELECT}
        >
          <option value="skip">Skip it (keep what is already there)</option>
          <option value="overwrite">Overwrite it with the imported row</option>
          <option value="allow">Import anyway where possible</option>
        </select>
      </div>

      {preview.sampleRows.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-card border border-line">
          <table className="w-full text-xs" data-testid="import-sample">
            <thead className="bg-app-bg">
              <tr>
                {preview.headers.map((h) => (
                  <th
                    key={h}
                    className="px-2 py-1.5 text-left font-medium text-ink-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.sampleRows.map((row, i) => (
                <tr key={i} className="border-t border-line">
                  {preview.headers.map((h, j) => (
                    <td key={h} className="truncate px-2 py-1.5 text-ink">
                      {row[j] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
