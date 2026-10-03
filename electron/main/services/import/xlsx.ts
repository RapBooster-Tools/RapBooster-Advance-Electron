/**
 * Main-side handle on the .xlsx reader worker.
 */
import type { Worker } from 'node:worker_threads'
import { log } from '../logger'
import createXlsxWorker from './xlsx.worker?nodeWorker'
import type { RowSource, FilePreview } from './row-source'
import type { XlsxWorkerInput, XlsxWorkerMessage } from './xlsx-protocol'

/** Raised when the workbook itself cannot be read; the message is user-safe. */
const UNREADABLE =
  'This Excel file could not be read. Open it in Excel, save it again as .xlsx, and retry.'

/**
 * A pull-based queue over the worker's messages, so the importer awaits rows
 * at its own pace while the worker keeps reading.
 */
class MessageQueue {
  private queue: XlsxWorkerMessage[] = []
  private waiting: ((m: XlsxWorkerMessage) => void) | null = null

  constructor(worker: Worker) {
    worker.on('message', (m: XlsxWorkerMessage) => this.put(m))
    worker.on('error', (err: Error) => {
      this.put({ type: 'error', message: err.message })
    })
    worker.on('exit', (code) => {
      if (code !== 0) this.put({ type: 'error', message: `worker exited ${code}` })
    })
  }

  private put(m: XlsxWorkerMessage): void {
    if (this.waiting) {
      const resolve = this.waiting
      this.waiting = null
      resolve(m)
    } else this.queue.push(m)
  }

  next(): Promise<XlsxWorkerMessage> {
    const head = this.queue.shift()
    if (head) return Promise.resolve(head)
    return new Promise((resolve) => {
      this.waiting = resolve
    })
  }
}

function start(input: XlsxWorkerInput): { worker: Worker; queue: MessageQueue } {
  const worker = createXlsxWorker({ workerData: input })
  return { worker, queue: new MessageQueue(worker) }
}

function failure(message: string): Error {
  log.warn(`[import] xlsx read failed: ${message}`)
  return new Error(UNREADABLE)
}

export async function previewXlsx(
  filePath: string,
  sampleSize: number,
): Promise<FilePreview> {
  const { worker, queue } = start({ mode: 'preview', filePath, sampleSize })
  try {
    const m = await queue.next()
    if (m.type === 'preview') {
      return { headers: m.headers, sampleRows: m.sampleRows, totalRows: m.totalRows }
    }
    throw failure(m.type === 'error' ? m.message : `unexpected ${m.type}`)
  } finally {
    await worker.terminate()
  }
}

export async function xlsxRowSource(filePath: string): Promise<RowSource> {
  const { worker, queue } = start({ mode: 'rows', filePath })
  const first = await queue.next()
  if (first.type !== 'headers') {
    await worker.terminate()
    throw failure(first.type === 'error' ? first.message : `unexpected ${first.type}`)
  }

  async function* rows(): AsyncGenerator<string[]> {
    try {
      for (;;) {
        const m = await queue.next()
        if (m.type === 'rows') yield* m.rows
        else if (m.type === 'done') return
        else throw failure(m.type === 'error' ? m.message : `unexpected ${m.type}`)
      }
    } finally {
      await worker.terminate()
    }
  }

  return {
    headers: first.headers,
    totalRows: first.totalRows,
    rows: rows(),
    // The importer closes the source even when it stops early (a failed batch
    // write), so a worker never lingers holding a whole workbook in memory.
    close: async () => {
      await worker.terminate()
    },
  }
}
