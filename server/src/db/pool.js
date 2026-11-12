import pg from 'pg'
import { env } from '../config/env.js'

/*
 * One shared connection pool for the whole server.
 * Type parsers:
 *  - DATE (oid 1082) stays a 'YYYY-MM-DD' string, avoiding timezone shifts.
 *  - BIGINT (oid 20) becomes a JS number; we only select paise amounts as bigint,
 *    and these are far below Number.MAX_SAFE_INTEGER.
 *  - NUMERIC stays a string (pg default), so no float ever touches money.
 */
pg.types.setTypeParser(1082, (value) => value)
pg.types.setTypeParser(20, (value) => {
  const n = Number(value)
  if (!Number.isSafeInteger(n)) throw new Error(`BIGINT out of safe range: ${value}`)
  return n
})

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
})

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error', err)
})

/** Shorthand for one-off queries. */
export const query = (text, params) => pool.query(text, params)

/**
 * Runs `fn(client)` inside BEGIN/COMMIT. Any thrown error rolls everything back,
 * so multi-row financial updates are all-or-nothing.
 */
export async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
