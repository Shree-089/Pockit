import bcrypt from 'bcryptjs'
import { query, withTransaction } from '../db/pool.js'
import { conflict, unauthorized } from '../lib/errors.js'
import { allocateByWeights, paiseToDecimal } from '../lib/money.js'
import { today } from '../lib/dates.js'
import { signToken } from '../middleware/auth.js'
import { USER_COLUMNS, mapUser } from './mappers.js'

const BCRYPT_ROUNDS = 12
// Real hash of a random string, used so unknown emails take as long to check as real ones.
const DUMMY_HASH = bcrypt.hashSync(`dummy-${Date.now()}-${Math.random()}`, BCRYPT_ROUNDS)

// Starter split for new accounts (fully editable; the AI allocator can replace it).
const STARTER_CATEGORIES = [
  { name: 'Food & Dining', icon: 'utensils', color: '#4169E1', kind: 'spending', weight: 30 },
  { name: 'Projects & Learning', icon: 'laptop', color: '#B8941F', kind: 'spending', weight: 20 },
  { name: 'Travel & Commute', icon: 'bus', color: '#16A085', kind: 'spending', weight: 15 },
  { name: 'Stationery & Essentials', icon: 'pencil', color: '#A78BFA', kind: 'spending', weight: 10 },
  { name: 'Shopping & Personal', icon: 'shopping-bag', color: '#E57EA6', kind: 'spending', weight: 15 },
  { name: 'Savings', icon: 'piggy-bank', color: '#7C8BA1', kind: 'savings', weight: 10 },
]

/** Creates user + wallet + starter categories atomically. Returns { token, user }. */
export async function register({ name, email, password, monthlyAllowance = 0, college = '' }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  const user = await withTransaction(async (client) => {
    const existing = await client.query('SELECT 1 FROM users WHERE lower(email) = $1', [email])
    if (existing.rowCount > 0) throw conflict('An account with this email already exists', 'EMAIL_TAKEN')

    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, name, college) VALUES ($1, $2, $3, $4) RETURNING ${USER_COLUMNS}`,
      [email, passwordHash, name, college],
    )
    const created = rows[0]
    await client.query('INSERT INTO wallets (user_id, monthly_allowance) VALUES ($1, $2)', [created.id, paiseToDecimal(monthlyAllowance)])

    const amounts = allocateByWeights(monthlyAllowance, STARTER_CATEGORIES.map((c) => c.weight))
    for (const [i, c] of STARTER_CATEGORIES.entries()) {
      await client.query(
        `INSERT INTO categories (user_id, name, kind, allocated, icon, color, position) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [created.id, c.name, c.kind, paiseToDecimal(amounts[i] ?? 0), c.icon, c.color, i],
      )
    }
    await client.query(
      `INSERT INTO notifications (user_id, kind, title, body, created_on) VALUES ($1, 'success', 'Welcome to Pockit', 'We created a starter budget. Adjust it anytime in Budgets.', $2)`,
      [created.id, today()],
    )
    return created
  })

  return { token: signToken(user.id), user: mapUser(user) }
}

/** Verifies credentials. Same message for unknown email and wrong password. */
export async function login({ email, password }) {
  const { rows } = await query(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE lower(email) = $1`, [email])
  const row = rows[0]
  // Compare against a dummy hash when the user doesn't exist, so timing doesn't reveal which emails are registered.
  const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH)
  if (!row || !ok) throw unauthorized('Incorrect email or password')
  return { token: signToken(row.id), user: mapUser(row) }
}

export async function getMe(userId) {
  const { rows } = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [userId])
  return mapUser(rows[0])
}
