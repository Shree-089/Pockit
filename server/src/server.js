import { env } from './config/env.js'
import { pool } from './db/pool.js'
import { createApp } from './app.js'

const app = createApp()

try {
  await pool.query('SELECT 1')
} catch (error) {
  console.error('Cannot connect to PostgreSQL. Check DATABASE_URL in server/.env and that the database exists.')
  console.error(error.message)
  process.exit(1)
}

const server = app.listen(env.port, () => {
  console.log(`Pockit API listening on http://localhost:${env.port} (${env.nodeEnv})`)
  if (env.appToday) console.log(`Budget date frozen at ${env.appToday} (APP_TODAY)`)
})

function shutdown(signal) {
  console.log(`${signal} received, shutting down`)
  server.close(() => pool.end().then(() => process.exit(0)))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
