/**
 * The opt-out list and its keyword configuration.
 */
import { AppError } from '../../../../shared/errors'
import type { SuppressionSource } from '../../../../shared/types'
import { getPrisma } from '../../db/client'
import { readOptOutConfig, writeOptOutConfig } from '../../services/optout'
import {
  addSuppressions,
  exportSuppressions,
  importSuppressionFile,
  removeSuppressions,
} from '../../services/suppression-io'
import { registerHandler } from '../router'

function serializeSuppression(row: {
  phone: string
  reason: string | null
  source: string
  createdAt: Date
}) {
  return {
    phone: row.phone,
    reason: row.reason,
    source: row.source as SuppressionSource,
    createdAt: row.createdAt.toISOString(),
  }
}

export function registerSuppressionHandlers(): void {
  registerHandler('suppression:list', async ({ search, cursor, limit }) => {
    const term = search?.trim() ?? ''
    const where =
      term === ''
        ? {}
        : { OR: [{ phone: { contains: term } }, { reason: { contains: term } }] }

    const [rows, total] = await Promise.all([
      getPrisma().suppression.findMany({
        where,
        // Newest first: the number someone just opted out is the one the user
        // is looking for.
        orderBy: [{ createdAt: 'desc' }, { phone: 'asc' }],
        take: limit + 1,
        ...(cursor ? { cursor: { phone: cursor }, skip: 1 } : {}),
      }),
      getPrisma().suppression.count({ where }),
    ])

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    return {
      items: page.map(serializeSuppression),
      nextCursor: hasMore ? (page[page.length - 1]?.phone ?? null) : null,
      total,
    }
  })

  registerHandler('suppression:add', async ({ phones, reason }) =>
    addSuppressions(phones, 'manual', reason?.trim() || null),
  )

  registerHandler('suppression:remove', async ({ phones }) => ({
    removed: await removeSuppressions(phones),
  }))

  registerHandler('suppression:import', async ({ filePath, dialPrefix }) => {
    try {
      return await importSuppressionFile(filePath, dialPrefix)
    } catch (err) {
      throw new AppError('IMPORT_FAILED', {
        userMessage:
          err instanceof Error ? err.message : 'The file could not be imported.',
        detail: String(err),
      })
    }
  })

  registerHandler('suppression:export', async () => {
    try {
      return await exportSuppressions()
    } catch (err) {
      throw new AppError('EXPORT_FAILED', { detail: String(err) })
    }
  })

  registerHandler('optout:getConfig', async () => readOptOutConfig())

  registerHandler('optout:setConfig', async (config) => {
    await writeOptOutConfig(config)
    return { ok: true as const }
  })
}
