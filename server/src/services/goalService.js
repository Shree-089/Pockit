import { query, withTransaction } from '../db/pool.js'
import { badRequest, notFound } from '../lib/errors.js'
import { nowTime, today } from '../lib/dates.js'
import { formatINR, paiseToDecimal } from '../lib/money.js'
import { getCurrentCycle } from './financeService.js'
import { GOAL_COLUMNS, TRANSACTION_COLUMNS, mapGoal, mapTransaction } from './mappers.js'

export async function listGoals(userId) {
  const { rows } = await query(`SELECT ${GOAL_COLUMNS} FROM savings_goals WHERE user_id = $1 ORDER BY target_date`, [userId])
  return rows.map(mapGoal)
}

export async function createGoal(userId, { name, target, targetDate, category, icon }) {
  if (targetDate <= today()) throw badRequest('Choose a future date', { targetDate: 'Choose a future date' })
  const { rows } = await query(
    `INSERT INTO savings_goals (user_id, name, label, icon, target, target_date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${GOAL_COLUMNS}`,
    [userId, name, category || 'Personal', icon ?? 'target', paiseToDecimal(target), targetDate],
  )
  return mapGoal(rows[0])
}

export async function updateGoal(userId, id, patch) {
  const { rows } = await query(
    `UPDATE savings_goals SET name = COALESCE($3, name), label = COALESCE($4, label), icon = COALESCE($5, icon),
            target = COALESCE($6, target), target_date = COALESCE($7, target_date), updated_at = now()
      WHERE id = $1 AND user_id = $2 RETURNING ${GOAL_COLUMNS}`,
    [id, userId, patch.name ?? null, patch.category ?? null, patch.icon ?? null, patch.target === undefined ? null : paiseToDecimal(patch.target), patch.targetDate ?? null],
  )
  if (rows.length === 0) throw notFound('Goal')
  return mapGoal(rows[0])
}

export async function deleteGoal(userId, id) {
  const { rowCount } = await query('DELETE FROM savings_goals WHERE id = $1 AND user_id = $2', [id, userId])
  if (rowCount === 0) throw notFound('Goal')
  return { goals: await listGoals(userId) }
}

/**
 * Moves money from this cycle's Savings bucket into a goal. One database transaction:
 * lock goal + savings category, check the bucket has enough and the goal still needs it,
 * insert a 'savings' transaction, increase goal.saved. Either all of it happens or none.
 */
export async function contributeToGoal(userId, goalId, amount) {
  return withTransaction(async (client) => {
    const { rows: goalRows } = await client.query(
      `SELECT id, name, (target * 100)::bigint AS target_paise, (saved * 100)::bigint AS saved_paise FROM savings_goals WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [goalId, userId],
    )
    const goal = goalRows[0]
    if (!goal) throw notFound('Goal')

    const { rows: savRows } = await client.query(
      `SELECT id, (allocated * 100)::bigint AS allocated_paise FROM categories WHERE user_id = $1 AND kind = 'savings' FOR UPDATE`,
      [userId],
    )
    const savings = savRows[0]
    if (!savings) throw badRequest('Add a Savings category to your budget first')

    const { cycle } = await getCurrentCycle(client, userId)
    const { rows: movedRows } = await client.query(
      `SELECT (COALESCE(SUM(amount), 0) * 100)::bigint AS moved FROM transactions
        WHERE user_id = $1 AND category_id = $2 AND status = 'success' AND occurred_on BETWEEN $3 AND $4`,
      [userId, savings.id, cycle.start, cycle.end],
    )
    const available = savings.allocated_paise - movedRows[0].moved
    const needed = goal.target_paise - goal.saved_paise

    if (needed <= 0) throw badRequest('This goal is already fully funded', { amount: 'Goal already reached' })
    if (amount > available) {
      throw badRequest(`Only ${formatINR(Math.max(0, available))} is left in this month's Savings bucket`, { amount: `Maximum ${formatINR(Math.max(0, available))}` })
    }
    if (amount > needed) throw badRequest(`This goal only needs ${formatINR(needed)} more`, { amount: `Maximum ${formatINR(needed)}` })

    const { rows: txRows } = await client.query(
      `INSERT INTO transactions (user_id, category_id, goal_id, type, amount, description, merchant, occurred_on, occurred_time, payment_method, status, source)
       VALUES ($1, $2, $3, 'savings', $4, $5, 'Pockit Vault', $6, $7, 'pockit-vault', 'success', 'manual') RETURNING id`,
      [userId, savings.id, goal.id, paiseToDecimal(amount), `Saved towards ${goal.name}`.slice(0, 60), cycle.today, nowTime()],
    )
    const { rows: updated } = await client.query(
      `UPDATE savings_goals SET saved = saved + $3, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING ${GOAL_COLUMNS}`,
      [goal.id, userId, paiseToDecimal(amount)],
    )
    const { rows: tx } = await client.query(`SELECT ${TRANSACTION_COLUMNS} FROM transactions t WHERE t.id = $1`, [txRows[0].id])
    return { goal: mapGoal(updated[0]), transaction: mapTransaction(tx[0]) }
  })
}
