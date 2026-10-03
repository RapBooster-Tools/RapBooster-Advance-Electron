/**
 * WhatsApp number checks and Google Sheets import — the two audience
 * operations that reach outside the database.
 */
import { AppError } from '../../../../shared/errors'
import { getPrisma } from '../../db/client'
import { runContactImport } from '../../services/contact-import'
import { previewCsv } from '../../services/csv'
import { startVerification } from '../../services/number-verify'
import { discardSheetFile, downloadSheet } from '../../services/sheets'
import { registerHandler } from '../router'

function asImportError(err: unknown, fallback: string): AppError {
  if (err instanceof AppError) return err
  return new AppError('IMPORT_FAILED', {
    userMessage: err instanceof Error ? err.message : fallback,
    detail: String(err),
  })
}

/** Download, hand the temp file to `use`, and always clean up after. */
async function withSheet<T>(
  url: string,
  use: (filePath: string) => Promise<T>,
): Promise<T> {
  const filePath = await downloadSheet(url)
  try {
    return await use(filePath)
  } finally {
    discardSheetFile(filePath)
  }
}

export function registerNumberHandlers(): void {
  registerHandler('contacts:verifyNumbers', async (req) => startVerification(req))

  registerHandler('contacts:sheetPreview', async ({ url }) => {
    try {
      return await withSheet(url, (filePath) => previewCsv(filePath))
    } catch (err) {
      throw asImportError(err, 'The sheet could not be read.')
    }
  })

  registerHandler(
    'contacts:importSheet',
    async ({ listId, url, mapping, duplicatePolicy, dialPrefix }) => {
      const list = await getPrisma().contactList.findUnique({ where: { id: listId } })
      if (!list) {
        throw new AppError('NOT_FOUND', {
          userMessage: 'That contact list no longer exists.',
        })
      }
      try {
        // The same pipeline as a CSV file: one importer, one set of rules.
        return await withSheet(url, (filePath) =>
          runContactImport({ listId, filePath, mapping, duplicatePolicy, dialPrefix }),
        )
      } catch (err) {
        throw asImportError(err, 'The import failed.')
      }
    },
  )
}
