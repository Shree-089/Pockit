import { AppError } from '../lib/errors.js'
import { env } from '../config/env.js'

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } })
}

/**
 * Every error ends here and leaves as: { error: { code, message, fieldErrors? } }
 * PostgreSQL constraint errors are translated into friendly 4xx responses.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, fieldErrors: err.fieldErrors ?? undefined } })
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' } })
  }

  // PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
  if (err?.code === '23505') return res.status(409).json({ error: { code: 'DUPLICATE', message: 'That already exists' } })
  if (err?.code === '23503') return res.status(409).json({ error: { code: 'IN_USE', message: 'This record is linked to other data' } })
  if (err?.code === '23514') return res.status(400).json({ error: { code: 'VALIDATION', message: 'A value is outside the allowed range' } })
  if (err?.code === '22P02') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } })

  console.error(`[${req.method} ${req.originalUrl}]`, err)
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong on our side', ...(env.isProduction ? {} : { detail: err?.message }) },
  })
}
