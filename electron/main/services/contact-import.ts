/**
 * The one contact-import pipeline.
 *
 * CSV files and Google Sheets both land here, so a sheet import gets exactly
 * the same mapping, normalization, duplicate policy and error report as a CSV
 * import. Two pipelines would drift, and the drift would only show up as a
 * list that imported differently depending on where it came from.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getPrisma } from '../db/client'
import { userDataDir } from '../db/paths'
import {
  importCsv,
  type DuplicatePolicy,
  type ImportOutcome,
  type ImportRow,
} from './csv'

export interface ContactImportRequest {
  listId: string
  filePath: string
  /** CSV header -> list field name. */
  mapping: Record<string, string>
  duplicatePolicy: DuplicatePolicy
  /** Null means the file's numbers already carry their country code. */
  dialPrefix: string | null
}

export function exportsDir(): string {
  const dir = join(userDataDir(), 'exports')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Recount from rows rather than incrementing, so the cache cannot drift. */
export async function refreshListCount(listId: string): Promise<number> {
  const contactCount = await getPrisma().contact.count({ where: { listId } })
  await getPrisma().contactList.update({ where: { id: listId }, data: { contactCount } })
  return contactCount
}

/** Persist one batch of parsed rows under the chosen duplicate policy. */
async function writeBatch(
  listId: string,
  policy: DuplicatePolicy,
  rows: ImportRow[],
): Promise<{ written: number; skipped: number }> {
  const prisma = getPrisma()

  // Within-file duplicates would otherwise make createMany fail the whole
  // batch on the unique(listId, phone) constraint.
  const seen = new Set<string>()
  const deduped = rows.filter((r) => {
    if (seen.has(r.phone)) return false
    seen.add(r.phone)
    return true
  })
  let skipped = rows.length - deduped.length

  if (policy === 'overwrite') {
    // upsert cannot be batched, so this path is slower by design — correctness
    // first, and overwriting is not the default.
    let written = 0
    await prisma.$transaction(async (tx) => {
      for (const row of deduped) {
        await tx.contact.upsert({
          where: { listId_phone: { listId, phone: row.phone } },
          create: {
            listId,
            name: row.name,
            phone: row.phone,
            data: JSON.stringify(row.data),
          },
          update: { name: row.name, data: JSON.stringify(row.data) },
        })
        written += 1
      }
    })
    return { written, skipped }
  }

  // Prisma's `skipDuplicates` is not supported on SQLite, so already-present
  // numbers are filtered explicitly. One indexed query per batch of 1,000 is
  // far cheaper than per-row upserts.
  const existing = await prisma.contact.findMany({
    where: { listId, phone: { in: deduped.map((r) => r.phone) } },
    select: { phone: true },
    // NOTE: no `take` — the IN list bounds the result, and Prisma can only split
    // an IN list past SQLite's parameter limit when the query has no `take`.
  })
  const present = new Set(existing.map((e) => e.phone))
  const fresh = deduped.filter((r) => !present.has(r.phone))
  skipped += deduped.length - fresh.length

  if (fresh.length === 0) return { written: 0, skipped }

  const result = await prisma.contact.createMany({
    data: fresh.map((row) => ({
      listId,
      name: row.name,
      phone: row.phone,
      data: JSON.stringify(row.data),
    })),
  })
  return { written: result.count, skipped }
}

/** Stream `filePath` into `listId`. Throws plain errors; callers map them. */
export async function runContactImport(
  req: ContactImportRequest,
): Promise<ImportOutcome> {
  const outcome = await importCsv(req.filePath, req.mapping, {
    ...(req.dialPrefix ? { dialPrefix: req.dialPrefix } : {}),
    exportsDir: exportsDir(),
    writeBatch: (rows) => writeBatch(req.listId, req.duplicatePolicy, rows),
  })
  await refreshListCount(req.listId)
  return outcome
}
