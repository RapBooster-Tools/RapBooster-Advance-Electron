/**
 * Turning spreadsheet cells into the strings the importer maps.
 *
 * Kept apart from the worker so the conversion rules are plain functions with
 * no thread plumbing around them.
 */

/**
 * A numeric cell, as the raw text Excel stored.
 *
 * WHY raw text: read-excel-file is given a `parseNumber` that returns the
 * stored string untouched, so a 12-digit phone number never passes through a
 * float and is never rendered as `9.19812345678e+11`. Only text that is
 * already in exponent or long-fraction form is normalised, to 15 significant
 * digits (Excel's own precision).
 */
export function numberText(raw: string): string {
  const text = raw.trim()
  if (!/[eE]/.test(text) && !/\.\d{10,}$/.test(text)) return text
  const value = Number(text)
  if (!Number.isFinite(value)) return text
  const rounded = Number(value.toPrecision(15))
  if (Number.isInteger(rounded) && Math.abs(rounded) < 1e21) {
    return BigInt(rounded).toString()
  }
  return String(rounded)
}

/** A date cell as ISO 8601: just the day when it carries no time of day. */
export function dateText(date: Date): string {
  if (Number.isNaN(date.valueOf())) return ''
  const iso = date.toISOString()
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
}

/**
 * What `parseNumber` returns: a numeric cell's stored text, marked so a text
 * cell that merely looks numeric ("1e5" typed as text) is left alone.
 */
export class RawNumber {
  constructor(readonly text: string) {}
}

export function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return ''
  if (cell instanceof RawNumber) return numberText(cell.text)
  if (cell instanceof Date) return dateText(cell)
  if (typeof cell === 'boolean') return cell ? 'TRUE' : 'FALSE'
  if (typeof cell === 'number') return numberText(String(cell))
  return String(cell).trim()
}

/**
 * Rows to strings, with blank rows dropped and the first non-blank row taken
 * as the header — the same rules the CSV reader applies to blank lines.
 */
export function sheetToTable(data: unknown[][]): {
  headers: string[]
  rows: string[][]
} {
  const rows: string[][] = []
  let headers: string[] | null = null
  for (const raw of data) {
    const cells = raw.map(cellText)
    if (cells.every((c) => c === '')) continue
    if (headers === null) {
      // An unnamed column still needs a label the mapping step can show.
      headers = cells.map((c, i) => c || `Column ${i + 1}`)
      continue
    }
    rows.push(cells)
  }
  return { headers: headers ?? [], rows }
}
