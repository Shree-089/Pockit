import { query, withTransaction } from '../db/pool.js'
import { badRequest, notFound } from '../lib/errors.js'
import { formatDateLabel } from '../lib/dates.js'
import { formatINR, paiseToDecimal, percentOf } from '../lib/money.js'
import { getCurrentCycle } from './financeService.js'
import { DEFAULT_PREFERENCES, TRANSACTION_COLUMNS, mapTransaction } from './mappers.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Filterable transaction history (always scoped to the signed-in user). */
export async function listTransactions(userId, { categoryId, from, to, status, type, q, limit }) {
  const where = ['t.user_id = $1']
  const params = [userId]
  const param = (value) => {
    params.push(value)
    return `$${params.length}`
  }
  if (categoryId) where.push(`t.category_id = ${param(categoryId)}`)
  if (from) where.push(`t.occurred_on >= ${param(from)}`)
  if (to) where.push(`t.occurred_on <= ${param(to)}`)
  if (status) where.push(`t.status = ${param(status)}`)
  if (type) where.push(`t.type = ${param(type)}`)
  if (q) {
    const p = param(`%${q.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`)
    where.push(`(t.merchant ILIKE ${p} OR t.description ILIKE ${p} OR t.note ILIKE ${p} OR c.name ILIKE ${p})`)
  }
  const limitParam = param(limit)

  const { rows } = await query(
    `SELECT ${TRANSACTION_COLUMNS} FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.occurred_on DESC, t.occurred_time DESC, t.created_at DESC
      LIMIT ${limitParam}`,
    params,
  )
  return rows.map(mapTransaction)
}

export async function getTransaction(userId, id) {
  const { rows } = await query(`SELECT ${TRANSACTION_COLUMNS} FROM transactions t WHERE t.id = $1 AND t.user_id = $2`, [id, userId])
  if (rows.length === 0) throw notFound('Transaction')
  return mapTransaction(rows[0])
}

/**
 * Records a manual expense inside one database transaction:
 *  1. lock the user's category row (it must exist, belong to the user, and be a spending category)
 *  2. check the date is inside the current budget cycle
 *  3. insert the transaction
 *  4. add a notification if this pushed the category past the user's warning threshold
 */
export async function createExpense(userId, input) {
  if (!UUID_RE.test(input.categoryId)) throw badRequest('Choose a budget category', { categoryId: 'Choose a budget category' })

  return withTransaction(async (client) => {
    const { rows: catRows } = await client.query(
      `SELECT id, name, kind, (allocated * 100)::bigint AS allocated_paise FROM categories WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [input.categoryId, userId],
    )
    const category = catRows[0]
    if (!category) throw badRequest('Choose a budget category', { categoryId: 'Choose a budget category' })
    if (category.kind === 'savings') throw badRequest('Use Savings Goals to move money into savings', { categoryId: 'Use Savings Goals to move money into savings' })

    const { cycle } = await getCurrentCycle(client, userId)
    if (input.date < cycle.start || input.date > cycle.today) {
      throw badRequest('Date is outside this budget cycle', { date: `Date must be between ${formatDateLabel(cycle.start)} and ${formatDateLabel(cycle.today)}` })
    }

    const spentBefore = await categorySpent(client, userId, category.id, cycle)
    const { rows } = await client.query(
      `INSERT INTO transactions (user_id, category_id, type, amount, description, merchant, note, occurred_on, occurred_time, payment_method, status, source)
       VALUES ($1, $2, 'expense', $3, $4, $5, $6, $7, $8, $9, 'success', 'manual')
       RETURNING id`,
      [userId, category.id, paiseToDecimal(input.amount), input.description, input.merchant || input.description, input.note ?? '', input.date, input.time ?? '12:00', input.paymentMethod],
    )

    await notifyIfThresholdCrossed(client, userId, category, spentBefore, spentBefore + input.amount, cycle)

    const { rows: txRows } = await client.query(`SELECT ${TRANSACTION_COLUMNS} FROM transactions t WHERE t.id = $1`, [rows[0].id])
    return mapTransaction(txRows[0])
  })
}

/** Successful spend in a category during the cycle, in paise (SQL NUMERIC sum). */
export async function categorySpent(db, userId, categoryId, cycle) {
  const { rows } = await db.query(
    `SELECT (COALESCE(SUM(amount), 0) * 100)::bigint AS spent FROM transactions
      WHERE user_id = $1 AND category_id = $2 AND status = 'success' AND occurred_on BETWEEN $3 AND $4`,
    [userId, categoryId, cycle.start, cycle.end],
  )
  return rows[0].spent
}

export async function notifyIfThresholdCrossed(db, userId, category, spentBefore, spentAfter, cycle) {
  const allocated = category.allocated_paise
  if (allocated <= 0) return
  const { rows } = await db.query('SELECT preferences FROM users WHERE id = $1', [userId])
  const prefs = { ...DEFAULT_PREFERENCES, ...rows[0].preferences }
  if (!prefs.paceAlerts) return

  const before = percentOf(spentBefore, allocated)
  const after = percentOf(spentAfter, allocated)
  const crossedOver = spentBefore <= allocated && spentAfter > allocated
  const crossedThreshold = before < prefs.guardThreshold && after >= prefs.guardThreshold
  if (!crossedOver && !crossedThreshold) return

  const title = crossedOver ? `${category.name} is over budget` : `${category.name} at ${Math.floor(after)}%`
  const body = crossedOver
    ? `You've spent ${formatINR(spentAfter - allocated)} more than planned this cycle.`
    : `You have ${formatINR(allocated - spentAfter)} left until ${formatDateLabel(cycle.end)}.`
  await db.query(`INSERT INTO notifications (user_id, kind, title, body, created_on) VALUES ($1, 'warning', $2, $3, $4)`, [userId, title, body, cycle.today])
}

