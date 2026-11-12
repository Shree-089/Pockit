import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { loginBody, registerBody } from '../validation/schemas.js'
import * as auth from '../services/authService.js'

export const authRouter = Router()

// POST /api/auth/register  { name, email, password, monthlyAllowance?, college? }
authRouter.post('/register', validate({ body: registerBody }), async (req, res) => {
  res.status(201).json(await auth.register(req.valid.body))
})

// POST /api/auth/login  { email, password }
authRouter.post('/login', validate({ body: loginBody }), async (req, res) => {
  res.json(await auth.login(req.valid.body))
})

// GET /api/auth/me
authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await auth.getMe(req.user.id) })
})
