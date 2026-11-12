import { Router } from 'express'
import { env } from '../config/env.js'
import { pool, withTransaction } from '../db/pool.js'
import { forbidden } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { profileBody, settingsBody, walletBody } from '../validation/schemas.js'
import * as account from '../services/accountService.js'
import { getSummary } from '../services/financeService.js'
import { seedDemoData } from '../services/demoSeed.js'

export const accountRouter = Router()

// GET /api/bootstrap: everything the app needs on launch
accountRouter.get('/bootstrap', async (req, res) => {
  res.json(await account.getBootstrap(req.user.id))
})

// GET /api/dashboard: authoritative summary (balance, totals, per-category remaining)
accountRouter.get('/dashboard', async (req, res) => {
  res.json(await getSummary(pool, req.user.id))
})

// GET/PUT /api/wallet
accountRouter.get('/wallet', async (req, res) => {
  res.json(await account.getWalletView(req.user.id))
})
accountRouter.put('/wallet', validate({ body: walletBody }), async (req, res) => {
  res.json(await account.updateWallet(req.user.id, req.valid.body))
})

// GET/PATCH /api/settings
accountRouter.get('/settings', async (req, res) => {
  res.json(await account.getSettings(req.user.id))
})
accountRouter.patch('/settings', validate({ body: settingsBody }), async (req, res) => {
  res.json(await account.updateSettings(req.user.id, req.valid.body))
})

// PATCH /api/profile
accountRouter.patch('/profile', validate({ body: profileBody }), async (req, res) => {
  res.json(await account.updateProfile(req.user.id, req.valid.body))
})

// GET /api/notifications, POST /api/notifications/read-all
accountRouter.get('/notifications', async (req, res) => {
  res.json(await account.listNotifications(req.user.id))
})
accountRouter.post('/notifications/read-all', async (req, res) => {
  res.json(await account.markNotificationsRead(req.user.id))
})

// POST /api/demo/reset: restore demo data for the signed-in user (only if enabled)
accountRouter.post('/demo/reset', async (req, res) => {
  if (!env.allowDemoReset) throw forbidden('Demo reset is disabled on this server')
  await withTransaction((client) => seedDemoData(client, req.user.id))
  res.json(await account.getBootstrap(req.user.id))
})
