/**
 * Migration safety gate (tracker D90).
 *
 * `prisma migrate diff` adds a column to an existing table by rebuilding it:
 * create a copy, copy the rows, DROP the original, rename. Our migrator runs each
 * script in a transaction with foreign_keys=ON, where `PRAGMA foreign_keys=OFF`
 * is silently ignored — so the DROP fires every ON DELETE CASCADE. Applied to a
 * populated database, the 2026-10-02 diff deleted every chat and message.
 *
 * This refuses any migration whose SQL (comments excluded) drops a table or
 * toggles foreign keys. Rebuilds must be hand-written as ADD COLUMN; a genuine
 * drop of a table nothing references needs `-- allow-drop: <reason>` on the line
 * above it.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'prisma/migrations'
const problems = []

for (const entry of readdirSync(DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const file = join(DIR, entry.name, 'migration.sql')
  if (!existsSync(file)) continue

  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    const code = line.replace(/--.*$/, '')
    const allowed = (lines[i - 1] ?? '').trim().startsWith('-- allow-drop:')
    if (/\bDROP\s+TABLE\b/i.test(code) && !allowed) {
      problems.push(`${file}:${i + 1} drops a table — cascades will delete child rows`)
    }
    if (/PRAGMA\s+(defer_)?foreign_keys/i.test(code)) {
      problems.push(
        `${file}:${i + 1} toggles foreign keys — a no-op inside our transaction`,
      )
    }
  })
}

if (problems.length > 0) {
  console.error('migrations UNSAFE:')
  for (const p of problems) console.error(`  ${p}`)
  console.error(
    'Rewrite table rebuilds as ALTER TABLE ... ADD COLUMN (see the 20261002 migration).',
  )
  process.exit(1)
}
console.log('migrations OK — no table drops or foreign-key toggles')
