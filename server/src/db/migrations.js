import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/*
 * Applies database/migrations/*.sql in name order, each exactly once.
 * Applied files are recorded in schema_migrations; each file runs in its own transaction,
 * so a failing migration leaves the database unchanged.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../database/migrations/', import.meta.url))

export async function runMigrations(pool, { log = console.log } = {}) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`)
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()
  const { rows } = await pool.query('SELECT name FROM schema_migrations')
  const applied = new Set(rows.map((r) => r.name))
  const ran = []

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await readFile(`${MIGRATIONS_DIR}${file}`, 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      ran.push(file)
      log(`Applied migration ${file}`)
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw new Error(`Migration ${file} failed (nothing was changed): ${error.message}`)
    } finally {
      client.release()
    }
  }
  if (ran.length === 0) log('Database is up to date (no pending migrations).')
  return ran
}
