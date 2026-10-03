/**
 * One way to read every importable file: a header row plus a stream of rows.
 *
 * The importer (`importRows` in ../csv.ts) does mapping, phone normalisation,
 * duplicate handling and the error report once; each format only has to turn
 * its file into rows. Dispatch is by extension because that is what the file
 * picker filters on and what the user sees.
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { createInterface } from 'node:readline'
import { AppError } from '../../../../shared/errors'
import { MAX_IMPORT_BYTES, parseCsvLine, previewCsv } from '../csv'
import { VCARD_HEADERS, VCardReader, vcardToRow } from './vcard'
import { previewXlsx, xlsxRowSource } from './xlsx'

export interface FilePreview {
  headers: string[]
  sampleRows: string[][]
  totalRows: number
}

export interface RowSource {
  headers: string[]
  /** Known up front for formats read whole (.xlsx); 0 when streamed. */
  totalRows: number
  rows: AsyncIterable<string[]>
  close: () => Promise<void>
}

export const IMPORT_EXTENSIONS = ['csv', 'xlsx', 'vcf'] as const
type ImportFormat = (typeof IMPORT_EXTENSIONS)[number]

/** An .xlsx is inflated whole in the worker; past this it is not a contact list. */
const MAX_XLSX_BYTES = 50 * 1024 * 1024

function formatOf(filePath: string): ImportFormat {
  const ext = extname(filePath).slice(1).toLowerCase()
  if (ext === 'vcard') return 'vcf'
  if ((IMPORT_EXTENSIONS as readonly string[]).includes(ext)) return ext as ImportFormat
  throw new AppError('IMPORT_FAILED', {
    userMessage:
      ext === 'xls'
        ? 'Old Excel files (.xls) cannot be read. Open the file in Excel and save it as .xlsx, then try again.'
        : 'This kind of file cannot be imported. Choose a CSV (.csv), Excel (.xlsx) or contact card (.vcf) file.',
    detail: `unsupported import extension: ${ext || '(none)'}`,
  })
}

function checkFile(filePath: string, format: ImportFormat): void {
  if (!existsSync(filePath)) {
    throw new AppError('IMPORT_FAILED', {
      userMessage: 'That file could not be found. It may have been moved or deleted.',
    })
  }
  const limit = format === 'xlsx' ? MAX_XLSX_BYTES : MAX_IMPORT_BYTES
  if (statSync(filePath).size > limit) {
    throw new AppError('IMPORT_FAILED', {
      userMessage: 'This file is too large to import. Split it into smaller files.',
    })
  }
}

function lines(filePath: string) {
  return createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
}

async function csvRowSource(filePath: string): Promise<RowSource> {
  const reader = lines(filePath)
  const iterator = reader[Symbol.asyncIterator]()

  // The first non-blank line is the header, exactly as in the preview.
  let headers: string[] = []
  for (;;) {
    const next = await iterator.next()
    if (next.done) break
    if (next.value.trim() === '') continue
    headers = parseCsvLine(next.value)
    break
  }

  async function* rows(): AsyncGenerator<string[]> {
    for (;;) {
      const next = await iterator.next()
      if (next.done) return
      if (next.value.trim() !== '') yield parseCsvLine(next.value)
    }
  }

  return {
    headers,
    totalRows: 0,
    rows: rows(),
    close: async () => reader.close(),
  }
}

async function* vcardRows(filePath: string): AsyncGenerator<string[]> {
  const reader = lines(filePath)
  const cards = new VCardReader()
  try {
    for await (const line of reader) {
      for (const card of cards.push(line)) yield vcardToRow(card)
    }
    for (const card of cards.end()) yield vcardToRow(card)
  } finally {
    reader.close()
  }
}

function vcardRowSource(filePath: string): RowSource {
  const rows = vcardRows(filePath)
  return {
    headers: [...VCARD_HEADERS],
    totalRows: 0,
    rows,
    close: async () => {
      await rows.return(undefined)
    },
  }
}

/** Open `filePath` as rows. Throws AppError for unsupported or unreadable files. */
export async function openRowSource(filePath: string): Promise<RowSource> {
  const format = formatOf(filePath)
  checkFile(filePath, format)
  if (format === 'xlsx') return xlsxRowSource(filePath)
  if (format === 'vcf') return vcardRowSource(filePath)
  return csvRowSource(filePath)
}

/** Headers, a few sample rows and the row count, for the mapping step. */
export async function previewImportFile(
  filePath: string,
  sampleSize = 5,
): Promise<FilePreview> {
  const format = formatOf(filePath)
  checkFile(filePath, format)
  if (format === 'csv') return previewCsv(filePath, sampleSize)
  if (format === 'xlsx') {
    const preview = await previewXlsx(filePath, sampleSize)
    if (preview.headers.length === 0) {
      throw new AppError('IMPORT_FAILED', {
        userMessage: 'The first sheet of this Excel file is empty.',
      })
    }
    return preview
  }

  const sampleRows: string[][] = []
  let totalRows = 0
  for await (const row of vcardRows(filePath)) {
    totalRows += 1
    if (sampleRows.length < sampleSize) sampleRows.push(row)
  }
  if (totalRows === 0) {
    throw new AppError('IMPORT_FAILED', {
      userMessage: 'No contact cards were found in this file.',
    })
  }
  return { headers: [...VCARD_HEADERS], sampleRows, totalRows }
}
