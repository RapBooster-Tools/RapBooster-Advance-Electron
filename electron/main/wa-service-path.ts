import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The wa-service entry, emitted by electron-vite as `out/main/wa-service/index.js`.
 *
 * WHY a candidate list rather than `__dirname`: `__dirname` is the directory of
 * whichever bundle file this code lands in, and Rollup moves modules shared by
 * several entries (main, self-test) into `out/main/chunks/`. Importing one more
 * module into the self-test once did exactly that, `__dirname` became
 * `chunks/`, and every device failed to connect. Probing a list, like
 * `migrationsDir()`, survives the bundle layout changing again.
 */
export function waServicePath(): string {
  const rel = ['wa-service', 'index.js'] as const
  const candidates = [
    join(__dirname, ...rel),
    join(__dirname, '..', ...rel),
    join(app.getAppPath(), 'out', 'main', ...rel),
    join(app.getAppPath(), ...rel),
  ]
  return candidates.find((c) => existsSync(c)) ?? candidates[0]!
}
