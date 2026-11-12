import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../middleware/validate.js'
import { captureBody, paymentOrderBody, purchaseBody } from '../validation/schemas.js'
import * as payments from '../services/paymentService.js'

export const paymentsRouter = Router()
// PKT-… = PayPal orders; MOCK-… = orders created by the earlier simulated checkout (cancel only).
const refParam = z.object({ ref: z.string().regex(/^(PKT-[0-9A-F]{16}|MOCK-[0-9A-F]{12})$/, 'Invalid order reference') })

// POST /api/purchases/assess  { categoryId, amount, description?, explain? }
paymentsRouter.post('/purchases/assess', validate({ body: purchaseBody }), async (req, res) => {
  res.json(await payments.evaluatePurchase(req.user.id, req.valid.body))
})

// GET /api/payments/config: public checkout settings (PayPal client ID, currency). Never the secret.
paymentsRouter.get('/payments/config', (_req, res) => {
  res.json(payments.getPaymentConfig())
})

// POST /api/payments/orders  { categoryId, amount, description, merchant? } -> local order + PayPal order
paymentsRouter.post('/payments/orders', validate({ body: paymentOrderBody }), async (req, res) => {
  res.status(201).json(await payments.createPaymentOrder(req.user.id, req.valid.body))
})

// POST /api/payments/orders/:ref/capture  { paypalOrderId } -> server-side capture + verification
paymentsRouter.post('/payments/orders/:ref/capture', validate({ params: refParam, body: captureBody }), async (req, res) => {
  res.json(await payments.capturePaymentOrder(req.user.id, req.valid.params.ref, req.valid.body))
})

// POST /api/payments/orders/:ref/cancel: buyer cancelled; nothing is recorded
paymentsRouter.post('/payments/orders/:ref/cancel', validate({ params: refParam }), async (req, res) => {
  res.json(await payments.cancelPaymentOrder(req.user.id, req.valid.params.ref))
})
