import { pool, query, withTransaction } from '../db/pool.js'
import { badRequest } from '../lib/errors.js'
import { paiseToDecimal } from '../lib/money.js'
import { getCurrentCycle, getSummary, getWallet } from './financeService.js'
import {
  GOAL_COLUMNS,
  PAYMENT_METHOD_LIST,
  TRANSACTION_COLUMNS,
  USER_COLUMNS,
  mapCategory,
  mapGoal,
  mapNotification,
  mapSettings,
  mapTransaction,
  mapUser,
} from './mappers.js'

/** Everything the app needs on launch, in the same shape as the frontend mock bootstrap. */
export async function getBootstrap(userId) {
  const { wallet, cycle } = await getCurrentCycle(pool, userId)
  const [userRes, catRes, txRes, goalRes, noteRes, summary] = await Promise.all([
    query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [userId]),
    query(`SELECT id, name, kind, icon, color, (allocated * 100)::bigint AS allocated_paise FROM categories WHERE user_id = $1 ORDER BY position, created_at`, [userId]),
    query(
      `SELECT ${TRANSACTION_COLUMNS} FROM transactions t
        WHERE t.user_id = $1 AND t.occurred_on BETWEEN $2 AND $3
        ORDER BY t.occurred_on DESC, t.occurred_time DESC, t.created_at DESC`,
      [userId, cycle.start, cycle.end],
    ),
    query(`SELECT ${GOAL_COLUMNS} FROM savings_goals WHERE user_id = $1 ORDER BY target_date`, [userId]),
    query(`SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`, [userId]),
    getSummary(pool, userId),
  ])
  const userRow = userRes.rows[0]
  return {
    user: mapUser(userRow),
    settings: mapSettings(wallet, userRow.preferences),
    cycle,
    categories: catRes.rows.map(mapCategory),
    transactions: txRes.rows.map(mapTransaction),
    goals: goalRes.rows.map(mapGoal),
    notifications: noteRes.rows.map(mapNotification),
    paymentMethods: PAYMENT_METHOD_LIST,
    summary, // authoritative server-side figures
  }
}

/** GET /api/wallet: the stored allowance plus the computed balance. */
export async function getWalletView(userId) {
  const summary = await getSummary(pool, userId)
  const wallet = await getWallet(pool, userId)
  return {
    monthlyAllowance: wallet.allowance_paise,
    currency: wallet.currency,
    cycleResetDay: wallet.cycle_reset_day,
    cycle: summary.cycle,
    balance: summary.walletBalance,
    totalSpent: summary.totalSpent,
    savingsMoved: summary.savingsMoved,
    totalAllocated: summary.totalAllocated,
    unallocated: summary.unallocated,
  }
}

export async function updateWallet(userId, { monthlyAllowance, cycleResetDay }) {
  await query(
    `UPDATE wallets SET monthly_allowance = COALESCE($2, monthly_allowance),
                        cycle_reset_day = COALESCE($3, cycle_reset_day), updated_at = now()
      WHERE user_id = $1`,
    [userId, monthlyAllowance === undefined ? null : paiseToDecimal(monthlyAllowance), cycleResetDay ?? null],
  )
  return getWalletView(userId)
}

/** Settings combine wallet fields (financial) and preferences (toggles). */
export async function getSettings(userId) {
  const [wallet, user] = await Promise.all([getWallet(pool, userId), query('SELECT preferences FROM users WHERE id = $1', [userId])])
  return mapSettings(wallet, user.rows[0].preferences)
}

export async function updateSettings(userId, patch) {
  const { monthlyAllowance, cycleResetDay, currency: _currency, ...prefs } = patch
  await withTransaction(async (client) => {
    if (monthlyAllowance !== undefined || cycleResetDay !== undefined) {
      await client.query(
        `UPDATE wallets SET monthly_allowance = COALESCE($2, monthly_allowance), cycle_reset_day = COALESCE($3, cycle_reset_day), updated_at = now() WHERE user_id = $1`,
        [userId, monthlyAllowance === undefined ? null : paiseToDecimal(monthlyAllowance), cycleResetDay ?? null],
      )
    }
    if (Object.keys(prefs).length > 0) {
      await client.query(`UPDATE users SET preferences = preferences || $2::jsonb, updated_at = now() WHERE id = $1`, [userId, JSON.stringify(prefs)])
    }
  })
  return getSettings(userId)
}

export async function updateProfile(userId, patch) {
  const { name, college, program, residence } = patch
  if (name !== undefined && !name) throw badRequest('Name cannot be empty', { name: 'Name cannot be empty' })
  const { rows } = await query(
    `UPDATE users SET name = COALESCE($2, name), college = COALESCE($3, college), program = COALESCE($4, program),
                      residence = COALESCE($5, residence), updated_at = now()
      WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [userId, name ?? null, college ?? null, program ?? null, residence ?? null],
  )
  return mapUser(rows[0])
}

export async function listNotifications(userId) {
  const { rows } = await query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30', [userId])
  return rows.map(mapNotification)
}

export async function markNotificationsRead(userId) {
  await query('UPDATE notifications SET read = true WHERE user_id = $1 AND read = false', [userId])
  return listNotifications(userId)
}
