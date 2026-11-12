/*
 * Creates (or recreates) all tables from database/schema.sql, then applies migrations.
 * WARNING: drops existing Pockit tables. Usage: npm run db:init
 * To upgrade an existing database without losing data, use `npm run db:migrate` instead.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pool } from '../src/db/pool.js'
import { runMigrations } from '../src/db/migrations.js'

const schemaPath = fileURLToPath(new URL('../../database/schema.sql', import.meta.url))

try {
  const sql = await readFile(schemaPath, 'utf8')
  await pool.query(sql)
  console.log(`Schema applied from ${schemaPath}`)
  // The tables were just recreated, so every migration must run again on top of them.
  await pool.query('DROP TABLE IF EXISTS schema_migrations')
  await runMigrations(pool)
} catch (error) {
  console.error('Failed to apply schema:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
