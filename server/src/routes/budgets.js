import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { budgetPlanBody, categoryBody, categoryPatch, deleteCategoryQuery, idParam } from '../validation/schemas.js'
import * as budgets from '../services/categoryService.js'

export const budgetsRouter = Router()

// GET /api/budgets: categories with allocated / spent / remaining (paise)
budgetsRouter.get('/', async (req, res) => {
  res.json(await budgets.listBudgets(req.user.id))
})

// POST /api/budgets  { name, allocated, icon?, color? }
budgetsRouter.post('/', validate({ body: categoryBody }), async (req, res) => {
  res.status(201).json(await budgets.createCategory(req.user.id, req.valid.body))
})

// PUT /api/budgets: replace the whole plan { allowance, categories: [...] }
budgetsRouter.put('/', validate({ body: budgetPlanBody }), async (req, res) => {
  res.json(await budgets.saveBudgetPlan(req.user.id, req.valid.body))
})

// PUT /api/budgets/:id  { name?, allocated?, icon?, color? }
budgetsRouter.put('/:id', validate({ params: idParam, body: categoryPatch }), async (req, res) => {
  res.json(await budgets.updateCategory(req.user.id, req.valid.params.id, req.valid.body))
})

// DELETE /api/budgets/:id?reassignTo=<categoryId>
budgetsRouter.delete('/:id', validate({ params: idParam, query: deleteCategoryQuery }), async (req, res) => {
  res.json(await budgets.deleteCategory(req.user.id, req.valid.params.id, req.valid.query))
})
