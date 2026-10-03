/** Messages between main and the .xlsx reader worker. */

export type XlsxWorkerInput =
  | { mode: 'preview'; filePath: string; sampleSize: number }
  | { mode: 'rows'; filePath: string }

export type XlsxWorkerMessage =
  | { type: 'preview'; headers: string[]; sampleRows: string[][]; totalRows: number }
  | { type: 'headers'; headers: string[]; totalRows: number }
  | { type: 'rows'; rows: string[][] }
  | { type: 'done' }
  | { type: 'error'; message: string }
