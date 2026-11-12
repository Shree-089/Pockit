/*
 * Applies pending database migrations WITHOUT touching existing data.
 * Usage: npm run db:migrate
 */
import { pool } from '../src/db/pool.js'
import { runMigrations } from '../src/db/migrations.js'

try {
  await runMigrations(pool)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
