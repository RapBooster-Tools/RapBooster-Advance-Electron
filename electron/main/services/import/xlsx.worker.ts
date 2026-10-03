/**
 * Reads the first sheet of an .xlsx file off the main thread.
 *
 * WHY a worker: an .xlsx is a zip of XML that read-excel-file inflates and
 * parses as a whole. For a 50,000-row workbook that is seconds of CPU, which
 * on the main process would freeze every window and stall IPC for the whole
 * import (CLAUDE.md §5.7). Rows go back in chunks of `IMPORT_BATCH_SIZE`, so
 * no single message is large enough to block main while it is deserialised.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { readSheet } from 'read-excel-file/node'
import { RawNumber, sheetToTable } from './xlsx-cells'
import type { XlsxWorkerInput, XlsxWorkerMessage } from './xlsx-protocol'

const CHUNK = 1_000

function post(message: XlsxWorkerMessage): void {
  parentPort?.postMessage(message)
}

async function run(input: XlsxWorkerInput): Promise<void> {
  const data = await readSheet<RawNumber>(input.filePath, 1, {
    parseNumber: (text) => new RawNumber(text),
  })
  const { headers, rows } = sheetToTable(data as unknown[][])

  if (input.mode === 'preview') {
    post({
      type: 'preview',
      headers,
      sampleRows: rows.slice(0, input.sampleSize),
      totalRows: rows.length,
    })
    return
  }

  post({ type: 'headers', headers, totalRows: rows.length })
  for (let i = 0; i < rows.length; i += CHUNK) {
    post({ type: 'rows', rows: rows.slice(i, i + CHUNK) })
  }
  post({ type: 'done' })
}

run(workerData as XlsxWorkerInput).catch((err: unknown) => {
  post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
})
