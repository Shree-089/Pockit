import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { contributionBody, goalBody, goalPatch, idParam } from '../validation/schemas.js'
import * as goals from '../services/goalService.js'

export const goalsRouter = Router()

goalsRouter.get('/', async (req, res) => {
  res.json(await goals.listGoals(req.user.id))
})

// POST /api/goals  { name, target, targetDate, category?, icon? }
goalsRouter.post('/', validate({ body: goalBody }), async (req, res) => {
  res.status(201).json(await goals.createGoal(req.user.id, req.valid.body))
})

// PUT /api/goals/:id
goalsRouter.put('/:id', validate({ params: idParam, body: goalPatch }), async (req, res) => {
  res.json(await goals.updateGoal(req.user.id, req.valid.params.id, req.valid.body))
})

// DELETE /api/goals/:id
goalsRouter.delete('/:id', validate({ params: idParam }), async (req, res) => {
  res.json(await goals.deleteGoal(req.user.id, req.valid.params.id))
})

// POST /api/goals/:id/contributions  { amount }
goalsRouter.post('/:id/contributions', validate({ params: idParam, body: contributionBody }), async (req, res) => {
  res.status(201).json(await goals.contributeToGoal(req.user.id, req.valid.params.id, req.valid.body.amount))
})
