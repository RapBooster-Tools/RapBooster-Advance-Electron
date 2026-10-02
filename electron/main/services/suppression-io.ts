/**
 * Bulk writes to the opt-out list: add, import from a file, export to CSV.
 *
 * Every number is stored normalized to E.164, because the list is matched
 * against contacts and chats that are stored that way. A number kept in any
 * other shape would sit on the list and suppress nobody.
 */
import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { SuppressionSource } from '../../../shared/types'
import { getPrisma } from '../db/client'
import { exportsDir } from './contact-import'
import { IMPORT_BATCH_SIZE, parseCsvLine, toCsvValue } from './csv'
import { normalizePhone } from './phone'

/** A do-not-contact file this large is almost certainly the wrong file. */
const MAX_SUPPRESSION_FILE_BYTES = 50 * 1024 * 1024

export interface SuppressionWriteResult {
  added: number
  invalid: number
}

/**
 * Normalize and insert, skipping numbers already on the list.
 *
 * Numbers without a country code are invalid unless the caller supplies the
 * dial prefix to apply — the same rule as contact import (REQUIREMENTS §7.5).
 */
export async function addSuppressions(
  raw: string[],
  source: SuppressionSource,
  reason: string | null,
  dialPrefix?: string,
): Promise<SuppressionWriteResult> {
  let invalid = 0
  const phones = new Set<string>()
  for (const value of raw) {
    const normalized = normalizePhone(value, dialPrefix)
    if (normalized.valid && normalized.e164) phones.add(normalized.e164)
    else invalid += 1
  }

  const all = Array.from(phones)
  const prisma = getPrisma()
  let added = 0
  for (let i = 0; i < all.length; i += IMPORT_BATCH_SIZE) {
    const batch = all.slice(i, i + IMPORT_BATCH_SIZE)
    // SQLite has no skipDuplicates, so present rows are filtered first and the
    // read and the insert share one transaction.
    added += await prisma.$transaction(async (tx) => {
      const existing = await tx.suppression.findMany({
        where: { phone: { in: batch } },
        select: { phone: true },
        // NOTE: no `take` — the IN list bounds the result, and Prisma can only split
        // an IN list past SQLite's parameter limit when the query has no `take`.
      })
      const present = new Set(existing.map((e) => e.phone))
      const fresh = batch.filter((p) => !present.has(p))
      if (fresh.length === 0) return 0
      const result = await tx.suppression.createMany({
        data: fresh.map((phone) => ({ phone, source, reason })),
      })
      return result.count
    })
  }
  return { added, invalid }
}

/** Remove numbers, accepting them stored-form or as the user typed them. */
export async function removeSuppressions(raw: string[]): Promise<number> {
  const phones = new Set<string>()
  for (const value of raw) {
    phones.add(value.trim())
    const normalized = normalizePhone(value)
    if (normalized.e164) phones.add(normalized.e164)
  }
  const all = Array.from(phones)
  const prisma = getPrisma()
  let removed = 0
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < all.length; i += IMPORT_BATCH_SIZE) {
      const result = await tx.suppression.deleteMany({
        where: { phone: { in: all.slice(i, i + IMPORT_BATCH_SIZE) } },
      })
      removed += result.count
    }
  })
  return removed
}

const PHONE_HEADER = /^(mobile|phone|number|phone number|mobile number|whatsapp)$/i

/**
 * Import a CSV or plain-text file of numbers.
 *
 * The phone is the column headed Mobile/Phone when there is a header row,
 * otherwise the first column; a TXT file is simply one number per line. A first
 * line with no digits in its first cell is a header even when it is not one of
 * the recognised names, so a file headed "Contact" does not count as invalid.
 */
export async function importSuppressionFile(
  filePath: string,
  dialPrefix: string | null,
): Promise<SuppressionWriteResult> {
  if (!existsSync(filePath)) throw new Error('File not found')
  if (statSync(filePath).size > MAX_SUPPRESSION_FILE_BYTES) {
    throw new Error('File is too large to import')
  }

  const reader = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  let column = -1
  let batch: string[] = []
  const total: SuppressionWriteResult = { added: 0, invalid: 0 }
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return
    const result = await addSuppressions(
      batch,
      'import',
      'Imported',
      dialPrefix ?? undefined,
    )
    total.added += result.added
    total.invalid += result.invalid
    batch = []
  }

  for await (const line of reader) {
    // A UTF-8 BOM from Excel would otherwise hide the header name.
    const clean = line.replace(/^\uFEFF/, '')
    if (clean.trim() === '') continue
    const cells = parseCsvLine(clean)

    if (column === -1) {
      const headed = cells.findIndex((c) => PHONE_HEADER.test(c))
      if (headed >= 0) {
        column = headed
        continue
      }
      column = 0
      if (!/\d/.test(cells[0] ?? '')) continue
    }

    batch.push(cells[column] ?? '')
    if (batch.length >= IMPORT_BATCH_SIZE) await flush()
  }
  await flush()
  reader.close()
  return total
}

/** Write the whole list to `<userData>/exports`, paged so it never sits in memory. */
export async function exportSuppressions(): Promise<{ filePath: string; rows: number }> {
  const filePath = join(exportsDir(), `opt-outs-${Date.now()}.csv`)
  const stream = createWriteStream(filePath, { encoding: 'utf8' })
  let rows = 0

  try {
    stream.write('Mobile,Source,Reason,Added\n')
    let cursor: string | undefined
    for (;;) {
      const page = await getPrisma().suppression.findMany({
        orderBy: { phone: 'asc' },
        take: IMPORT_BATCH_SIZE,
        ...(cursor ? { cursor: { phone: cursor }, skip: 1 } : {}),
      })
      for (const row of page) {
        stream.write(
          [row.phone, row.source, row.reason ?? '', row.createdAt.toISOString()]
            .map(toCsvValue)
            .join(',') + '\n',
        )
        rows += 1
      }
      if (page.length < IMPORT_BATCH_SIZE) break
      cursor = page[page.length - 1]?.phone
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      stream.on('error', reject)
      stream.on('finish', () => resolve())
      stream.end()
    })
  }
  return { filePath, rows }
}
