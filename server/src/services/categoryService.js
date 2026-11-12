import { pool, withTransaction } from '../db/pool.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { formatINR, paiseToDecimal } from '../lib/money.js'
import { getCurrentCycle, getCategoriesWithSpend } from './financeService.js'
import { mapCategory } from './mappers.js'

const COLS = 'id, name, kind, icon, color, (allocated * 100)::bigint AS allocated_paise'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Categories with spent / remaining for the current cycle (computed by the database). */
export async function listBudgets(userId) {
  const { cycle } = await getCurrentCycle(pool, userId)
  const categories = await getCategoriesWithSpend(pool, userId, cycle)
  return { cycle, categories: categories.map((c) => ({ ...c, remaining: c.allocated - c.spent })) }
}

async function assertUniqueName(db, userId, name, excludeId = null) {
  const { rowCount } = await db.query(
    'SELECT 1 FROM categories WHERE user_id = $1 AND lower(name) = lower($2) AND ($3::uuid IS NULL OR id <> $3)',
    [userId, name, excludeId],
  )
  if (rowCount > 0) throw badRequest('A category with this name already exists', { name: 'A category with this name already exists' })
}

export async function createCategory(userId, { name, allocated, icon = 'wallet', color = '#4169E1' }) {
  await assertUniqueName(pool, userId, name)
  const { rows } = await pool.query(
    `INSERT INTO categories (user_id, name, kind, allocated, icon, color, position)
     VALUES ($1, $2, 'spending', $3, $4, $5, (SELECT COALESCE(MAX(position), -1) + 1 FROM categories WHERE user_id = $1))
     RETURNING ${COLS}`,
    [userId, name, paiseToDecimal(allocated), icon, color],
  )
  return mapCategory(rows[0])
}

export async function updateCategory(userId, id, patch) {
  if (patch.name) await assertUniqueName(pool, userId, patch.name, id)
  const { rows } = await pool.query(
    `UPDATE categories
        SET name = COALESCE($3, name), allocated = COALESCE($4, allocated),
            icon = COALESCE($5, icon), color = COALESCE($6, color), updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING ${COLS}`,
    [id, userId, patch.name ?? null, patch.allocated === undefined ? null : paiseToDecimal(patch.allocated), patch.icon ?? null, patch.color ?? null],
  )
  if (rows.length === 0) throw notFound('Category')
  return mapCategory(rows[0])
}

/**
 * Deletes a category. If it has transactions, they must be moved to `reassignTo`
 * in the same database transaction so no spending disappears from the totals.
 */
export async function deleteCategory(userId, id, { reassignTo } = {}) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id, name, kind FROM categories WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, userId])
    const category = rows[0]
    if (!category) throw notFound('Category')
    if (category.kind === 'savings') throw forbidden('The Savings category cannot be deleted. Set its amount to ₹0 instead.')

    const { rows: countRows } = await client.query('SELECT COUNT(*)::int AS n FROM transactions WHERE category_id = $1 AND user_id = $2', [id, userId])
    const n = countRows[0].n
    if (n > 0) {
      if (!reassignTo) throw conflict(`${category.name} has ${n} transactions. Choose a category to move them to.`, 'NEEDS_REASSIGNMENT')
      const target = await client.query('SELECT id, kind FROM categories WHERE id = $1 AND user_id = $2 FOR UPDATE', [reassignTo, userId])
      if (target.rowCount === 0 || target.rows[0].kind === 'savings' || reassignTo === id) {
        throw badRequest('Choose a different spending category to move transactions to.')
      }
      await client.query('UPDATE transactions SET category_id = $1 WHERE category_id = $2 AND user_id = $3', [reassignTo, id, userId])
      await client.query('UPDATE payment_orders SET category_id = $1 WHERE category_id = $2 AND user_id = $3', [reassignTo, id, userId])
    }
    await client.query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [id, userId])

    const cats = await client.query(`SELECT ${COLS} FROM categories WHERE user_id = $1 ORDER BY position, created_at`, [userId])
    return { categories: cats.rows.map(mapCategory), movedTransactions: n }
  })
}

/**
 * Replaces the whole budget (onboarding "confirm budget").
 * - Existing categories are matched by id, then by name, so history stays linked.
 * - Transactions in removed categories move to "Other" (created with ₹0 if needed).
 * - The allowance and all categories change in one database transaction.
 */
export async function saveBudgetPlan(userId, { allowance, categories }) {
  const names = new Set()
  for (const c of categories) {
    const lower = c.name.toLowerCase()
    if (names.has(lower)) throw badRequest(`"${c.name}" appears twice`)
    names.add(lower)
  }
  if (categories.filter((c) => c.kind === 'savings').length > 1) throw badRequest('Only one Savings category is allowed')
  const total = categories.reduce((sum, c) => sum + c.allocated, 0)
  if (total > allowance) throw badRequest(`Allocations (${formatINR(total)}) exceed your monthly funds (${formatINR(allowance)})`)

  return withTransaction(async (client) => {
    const { rows: existing } = await client.query('SELECT id, name, kind FROM categories WHERE user_id = $1 FOR UPDATE', [userId])
    const byId = new Map(existing.map((c) => [c.id, c]))
    const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c]))

    const plan = categories.map((c, position) => {
      const match = (c.id && UUID_RE.test(c.id) && byId.get(c.id)) || byName.get(c.name.toLowerCase()) || null
      return { ...c, position, matchId: match?.id ?? null, kind: c.kind === 'savings' || match?.kind === 'savings' ? 'savings' : 'spending' }
    })
    const keep = new Set(plan.map((p) => p.matchId).filter(Boolean))
    const removed = existing.filter((c) => !keep.has(c.id))

    // Re-home history from removed categories.
    if (removed.length > 0) {
      const removedIds = removed.map((c) => c.id)
      const { rows: orphanRows } = await client.query('SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = $1 AND category_id = ANY($2::uuid[])', [userId, removedIds])
      if (orphanRows[0].n > 0) {
        let other = plan.find((p) => p.name.toLowerCase() === 'other')
        if (!other) {
          other = { name: 'Other', allocated: 0, icon: 'wallet', color: '#73788C', kind: 'spending', position: plan.length, matchId: null }
          plan.push(other)
        }
        if (!other.matchId) {
          const removedOther = removed.find((c) => c.name.toLowerCase() === 'other')
          if (removedOther) {
            other.matchId = removedOther.id
            removedIds.splice(removedIds.indexOf(removedOther.id), 1)
          } else {
            const { rows } = await client.query(
              `INSERT INTO categories (user_id, name, kind, allocated, icon, color, position) VALUES ($1, 'Other', 'spending', $2, $3, $4, $5) RETURNING id`,
              [userId, paiseToDecimal(other.allocated), other.icon ?? 'wallet', other.color ?? '#73788C', other.position],
            )
            other.matchId = rows[0].id
          }
        }
        await client.query('UPDATE transactions SET category_id = $1 WHERE user_id = $2 AND category_id = ANY($3::uuid[])', [other.matchId, userId, removedIds])
        await client.query('UPDATE payment_orders SET category_id = $1 WHERE user_id = $2 AND category_id = ANY($3::uuid[])', [other.matchId, userId, removedIds])
      }
      await client.query('DELETE FROM categories WHERE user_id = $1 AND id = ANY($2::uuid[]) AND id <> ALL($3::uuid[])', [
        userId,
        removedIds,
        plan.map((p) => p.matchId).filter(Boolean),
      ])
    }

    // Temporarily rename kept categories so renames/swaps can't hit the unique-name index.
    await client.query(`UPDATE categories SET name = left('~' || id::text, 30) WHERE user_id = $1`, [userId])
    for (const p of plan) {
      if (p.matchId) {
        await client.query(
          `UPDATE categories SET name = $3, allocated = $4, icon = COALESCE($5, icon), color = COALESCE($6, color), kind = $7, position = $8, updated_at = now()
            WHERE id = $1 AND user_id = $2`,
          [p.matchId, userId, p.name, paiseToDecimal(p.allocated), p.icon ?? null, p.color ?? null, p.kind, p.position],
        )
      } else {
        await client.query(
          `INSERT INTO categories (user_id, name, kind, allocated, icon, color, position) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [userId, p.name, p.kind, paiseToDecimal(p.allocated), p.icon ?? 'wallet', p.color ?? '#4169E1', p.position],
        )
      }
    }
    await client.query('UPDATE wallets SET monthly_allowance = $2, updated_at = now() WHERE user_id = $1', [userId, paiseToDecimal(allowance)])

    const cats = await client.query(`SELECT ${COLS} FROM categories WHERE user_id = $1 ORDER BY position, created_at`, [userId])
    return { allowance, categories: cats.rows.map(mapCategory) }
  })
}
