import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { query } from '../db/pool.js'
import { unauthorized } from '../lib/errors.js'

export function signToken(userId) {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn, algorithm: 'HS256' })
}

/**
 * Requires "Authorization: Bearer <token>".
 * The user id comes ONLY from the verified token, never from the request body or URL,
 * and every query downstream filters by req.user.id.
 */
export async function requireAuth(req, _res, next) {
  const header = req.get('authorization') ?? ''
  const [scheme, token] = header.split(' ')
  if (scheme !== 'Bearer' || !token) return next(unauthorized('Missing access token'))

  let payload
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] })
  } catch {
    return next(unauthorized('Your session has expired. Please sign in again.'))
  }

  const { rows } = await query('SELECT id FROM users WHERE id = $1', [payload.sub])
  if (rows.length === 0) return next(unauthorized('Account no longer exists'))
  req.user = { id: rows[0].id }
  next()
}
