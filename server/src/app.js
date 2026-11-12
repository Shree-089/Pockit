import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { env } from './config/env.js'
import { query } from './db/pool.js'
import { requireAuth } from './middleware/auth.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { authRouter } from './routes/auth.js'
import { accountRouter } from './routes/account.js'
import { budgetsRouter } from './routes/budgets.js'
import { transactionsRouter } from './routes/transactions.js'
import { goalsRouter } from './routes/goals.js'
import { paymentsRouter } from './routes/payments.js'
import { aiRouter } from './routes/ai.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1) // correct client IPs for rate limiting behind Render/Vercel proxies

  app.use(helmet())
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin/non-browser requests (no Origin header) and configured origins.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true)
        callback(null, false)
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  )
  app.use(express.json({ limit: '100kb' }))

  const apiLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false })
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes.' } },
  })
  // AI calls cost money and time: a tighter per-IP limit.
  const aiLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 90,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many AI requests. Please wait a few minutes.' } },
  })
  app.use('/api', apiLimiter)
  app.use('/api/ai', aiLimiter)

  app.get('/api/health', async (_req, res) => {
    await query('SELECT 1')
    res.json({ status: 'ok', database: 'up', time: new Date().toISOString() })
  })

  app.use('/api/auth', authLimiter, authRouter)

  // Everything below requires a valid token; req.user.id comes from the token only.
  app.use('/api', requireAuth)
  app.use('/api', accountRouter)
  app.use('/api/budgets', budgetsRouter)
  app.use('/api/transactions', transactionsRouter)
  app.use('/api/goals', goalsRouter)
  app.use('/api', paymentsRouter)
  app.use('/api/ai', aiRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
