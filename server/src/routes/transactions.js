import { Router } from 'express'
import { validate } from '../middleware/validate.js'
import { idParam, transactionBody, transactionQuery } from '../validation/schemas.js'
import * as transactions from '../services/transactionService.js'

export const transactionsRouter = Router()

// GET /api/transactions?categoryId=&from=YYYY-MM-DD&to=YYYY-MM-DD&status=&type=&q=&limit=
transactionsRouter.get('/', validate({ query: transactionQuery }), async (req, res) => {
  res.json(await transactions.listTransactions(req.user.id, req.valid.query))
})

// GET /api/transactions/:id
transactionsRouter.get('/:id', validate({ params: idParam }), async (req, res) => {
  res.json(await transactions.getTransaction(req.user.id, req.valid.params.id))
})

// POST /api/transactions  { amount, description, categoryId, date, time?, paymentMethod, merchant?, note? }
transactionsRouter.post('/', validate({ body: transactionBody }), async (req, res) => {
  res.status(201).json(await transactions.createExpense(req.user.id, req.valid.body))
})
