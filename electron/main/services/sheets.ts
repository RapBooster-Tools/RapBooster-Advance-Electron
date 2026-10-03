/**
 * Google Sheets as an import source (D89).
 *
 * A sheet shared as "Anyone with the link can view" exposes a CSV export URL,
 * so there is no OAuth flow, no Google API key and no new dependency: the sheet
 * is downloaded once to a temp file and handed to the same importer as a CSV.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '../../../shared/errors'
import { userDataDir } from '../db/paths'

const FETCH_TIMEOUT_MS = 20_000
/** A contact sheet is a few MB at most; anything bigger is not what was meant. */
const MAX_SHEET_BYTES = 20 * 1024 * 1024
const GOOGLE_ORIGIN = 'https://docs.google.com'

const NOT_SHARED = "Share the sheet as 'Anyone with the link can view' and try again."

/**
 * The CSV export URL for a sheet's share link.
 *
 * The tab is taken from `#gid=` or `?gid=` so the user imports the tab they
 * were looking at when they copied the link, not always the first one.
 */
export function sheetExportUrl(shareUrl: string): string {
  const match = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(shareUrl)
  if (!match?.[1]) {
    throw new AppError('VALIDATION_FAILED', {
      userMessage: 'That does not look like a Google Sheets link.',
    })
  }
  const gid = /[#?&]gid=(\d+)/.exec(shareUrl)?.[1] ?? '0'
  return `${sheetsOrigin()}/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`
}

/**
 * NOTE: test seam. Under E2E the spec serves a stub sheet over local HTTP; the
 * override is ignored outside NODE_ENV=test so a stray environment variable on
 * a customer machine can never redirect an import elsewhere.
 */
function sheetsOrigin(): string {
  const override = process.env.RB_SHEETS_BASE_URL
  if (process.env.NODE_ENV === 'test' && override) return override.replace(/\/$/, '')
  return GOOGLE_ORIGIN
}

async function readCapped(response: Response): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length') ?? '0')
  if (declared > MAX_SHEET_BYTES) throw tooLarge()
  if (!response.body) return Buffer.alloc(0)

  const chunks: Buffer[] = []
  let size = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_SHEET_BYTES) {
      await reader.cancel()
      throw tooLarge()
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

function tooLarge(): AppError {
  return new AppError('IMPORT_FAILED', {
    userMessage: 'That sheet is larger than 20 MB. Split it or export it as a CSV file.',
  })
}

/**
 * Download a sheet as CSV into a temp file and return its path. The caller
 * owns the file and must remove it with `discardSheetFile`.
 */
export async function downloadSheet(shareUrl: string): Promise<string> {
  const url = sheetExportUrl(shareUrl)
  let response: Response
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    })
  } catch (err) {
    throw new AppError('NETWORK_ERROR', {
      userMessage: 'Could not reach Google Sheets. Check your internet connection.',
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  if (response.status === 401 || response.status === 403) {
    throw new AppError('IMPORT_FAILED', {
      userMessage: NOT_SHARED,
      detail: `HTTP ${response.status}`,
    })
  }
  if (!response.ok) {
    throw new AppError('IMPORT_FAILED', {
      userMessage:
        response.status === 404
          ? 'That sheet was not found. Check the link and try again.'
          : 'Google Sheets did not return the sheet. Try again in a moment.',
      detail: `HTTP ${response.status}`,
    })
  }

  const body = await readCapped(response)
  // A sheet that is not public answers 200 with Google's sign-in page, so the
  // content has to be checked, not just the status.
  const head = body.subarray(0, 512).toString('utf8').trimStart().toLowerCase()
  const contentType = response.headers.get('content-type') ?? ''
  if (
    contentType.includes('text/html') ||
    head.startsWith('<!doctype') ||
    head.startsWith('<html')
  ) {
    throw new AppError('IMPORT_FAILED', {
      userMessage: NOT_SHARED,
      detail: 'HTML response',
    })
  }

  const dir = join(userDataDir(), 'tmp')
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, `sheet-${randomUUID()}.csv`)
  writeFileSync(filePath, body)
  return filePath
}

export function discardSheetFile(filePath: string): void {
  try {
    rmSync(filePath, { force: true })
  } catch (err) {
    // A leftover temp file is harmless: it holds what the user just imported
    // and only costs disk space. Failing the import over it would be worse.
    console.debug('could not remove a downloaded sheet', err)
  }
}
