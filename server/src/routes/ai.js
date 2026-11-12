import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { allocationBody, chatBody } from '../validation/schemas.js'
import * as ai from '../services/aiService.js'
import { askAssistant } from '../services/chatService.js'

export const aiRouter = Router()

// GET /api/ai/status: whether Nebius is configured (never returns the key)
aiRouter.get('/status', (_req, res) => {
  res.json(ai.getAiStatus())
})

// POST /api/ai/budget-allocation  { monthlyAmount?, savingsAmount?, description, variant? }
aiRouter.post('/budget-allocation', validate({ body: allocationBody }), async (req, res) => {
  res.json(await ai.generateBudgetAllocation(req.valid.body))
})

// GET /api/ai/insights: deterministic spending intelligence + grounded AI narrative
aiRouter.get('/insights', async (req, res) => {
  res.json(await ai.getAiInsights(req.user.id))
})

// POST /api/ai/chat  { message, history? }
aiRouter.post('/chat', validate({ body: chatBody }), async (req, res) => {
  res.json(await askAssistant(req.user.id, req.valid.body.message, req.valid.body.history))
})
