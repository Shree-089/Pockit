/*
 * Creates (or refreshes) the demo account with the same data as the frontend demo.
 * Usage: npm run db:seed   (login: DEMO_EMAIL / DEMO_PASSWORD from .env)
 */
import bcrypt from 'bcryptjs'
import { env } from '../src/config/env.js'
import { pool, withTransaction } from '../src/db/pool.js'
import { seedDemoData } from '../src/services/demoSeed.js'

try {
  const hash = await bcrypt.hash(env.demoPassword, 12)
  const userId = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, name, college, program, residence)
       VALUES ($1, $2, 'Aanya Sharma', 'IIIT Delhi', 'B.Tech Computer Science (2023–2027)', 'Hostel')
       ON CONFLICT ((lower(email))) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()
       RETURNING id`,
      [env.demoEmail.toLowerCase(), hash],
    )
    await seedDemoData(client, rows[0].id)
    return rows[0].id
  })
  console.log(`Demo account ready: ${env.demoEmail} / ${env.demoPassword} (user ${userId})`)
} catch (error) {
  console.error('Seeding failed:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
