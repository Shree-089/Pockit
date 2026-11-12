import { buildSummary } from '../lib/budget.js'
import { getCycle } from '../lib/dates.js'
import { notFound } from '../lib/errors.js'
import { mapCategory } from './mappers.js'

/*
 * AUTHORITATIVE FINANCIAL FIGURES
 * Sums are computed by PostgreSQL in NUMERIC (exact decimal), then converted
 * to integer paise. Only status = 'success' transactions inside the current
 * budget cycle count; failed, cancelled and pending payments never deduct.
 * `db` is the pool or a transaction client (both have .query), so these work inside withTransaction.
 */

export async function getWallet(db, userId) {
  const { rows } = await db.query(
    `SELECT (monthly_allowance * 100)::bigint AS allowance_paise, currency, cycle_reset_day
       FROM wallets WHERE user_id = $1`,
    [userId],
  )
  if (rows.length === 0) throw notFound('Wallet')
  return rows[0]
}

export async function getCurrentCycle(db, userId) {
  const wallet = await getWallet(db, userId)
  return { wallet, cycle: getCycle(wallet.cycle_reset_day) }
}

/** Categories with their successful spend in the cycle, all in paise. */
export async function getCategoriesWithSpend(db, userId, cycle) {
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.kind, c.icon, c.color, c.position, (c.allocated * 100)::bigint AS allocated_paise,
            (COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'success' AND t.occurred_on BETWEEN $2 AND $3), 0) * 100)::bigint AS spent_paise
       FROM categories c
       LEFT JOIN transactions t ON t.category_id = c.id AND t.user_id = c.user_id
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.position, c.created_at`,
    [userId, cycle.start, cycle.end],
  )
  return rows.map((row) => ({ ...mapCategory(row), spent: row.spent_paise }))
}

/** Wallet-level totals computed entirely in SQL NUMERIC. */
export async function getTotals(db, userId, cycle) {
  const { rows } = await db.query(
    `SELECT (w.monthly_allowance * 100)::bigint AS allowance,
            (COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0) * 100)::bigint AS total_spent,
            (COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'savings'), 0) * 100)::bigint AS savings_moved,
            ((w.monthly_allowance - COALESCE(SUM(t.amount), 0)) * 100)::bigint AS wallet_balance,
            (COUNT(t.id) FILTER (WHERE t.type = 'expense'))::int AS expense_count
       FROM wallets w
       LEFT JOIN transactions t
              ON t.user_id = w.user_id AND t.status = 'success' AND t.occurred_on BETWEEN $2 AND $3
      WHERE w.user_id = $1
      GROUP BY w.monthly_allowance`,
    [userId, cycle.start, cycle.end],
  )
  if (rows.length === 0) throw notFound('Wallet')
  const r = rows[0]
  return {
    allowance: r.allowance,
    totalSpent: r.total_spent,
    savingsMoved: r.savings_moved,
    walletBalance: r.wallet_balance,
    expenseCount: r.expense_count,
  }
}

/** Full dashboard summary for the signed-in user. */
export async function getSummary(db, userId) {
  const { cycle } = await getCurrentCycle(db, userId)
  const [totals, categories] = await Promise.all([getTotals(db, userId, cycle), getCategoriesWithSpend(db, userId, cycle)])
  return buildSummary({ cycle, totals, categories, transactionCount: totals.expenseCount })
}
