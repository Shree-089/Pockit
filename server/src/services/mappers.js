/*
 * DB row -> API object. Field names and units match the frontend mock data,
 * so the React app works unchanged: money in integer paise, dates 'YYYY-MM-DD'.
 * Every money column is selected as (column * 100)::bigint AS <name>_paise.
 */

export const DEFAULT_PREFERENCES = {
  guardEnabled: true,
  guardThreshold: 80,
  smartRebalancing: true,
  dailyRecap: true,
  weekendNudge: true,
  paceAlerts: true,
}

export const PAYMENT_METHOD_LIST = [
  { id: 'upi-gpay', label: 'UPI (GPay)', short: 'GPay UPI' },
  { id: 'upi-paytm', label: 'UPI (Paytm)', short: 'Paytm UPI' },
  { id: 'campus-card', label: 'Campus Card', short: 'Campus Card' },
  { id: 'debit-card', label: 'Debit Card', short: 'Debit Card' },
  { id: 'cash', label: 'Cash', short: 'Cash' },
  { id: 'paypal', label: 'PayPal', short: 'PayPal' },
]

export const USER_COLUMNS = 'id, email, name, college, program, residence, preferences, created_at'
export const CATEGORY_COLUMNS = 'id, name, kind, icon, color, position, (allocated * 100)::bigint AS allocated_paise'
export const TRANSACTION_COLUMNS = `t.id, t.type, t.description, t.merchant, t.category_id, t.goal_id, (t.amount * 100)::bigint AS amount_paise,
  t.occurred_on, to_char(t.occurred_time, 'HH24:MI') AS occurred_time, t.payment_method, t.status, t.source,
  t.note, t.payment_reference, t.created_at`
export const GOAL_COLUMNS = `id, name, label, icon, (target * 100)::bigint AS target_paise, (saved * 100)::bigint AS saved_paise,
  target_date, created_at::date::text AS created_on`

export const mapUser = (row) => ({
  id: row.id,
  name: row.name,
  firstName: row.name.trim().split(/\s+/)[0],
  email: row.email,
  college: row.college,
  program: row.program,
  residence: row.residence,
  avatarUrl: null,
})

export const mapCategory = (row) => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  icon: row.icon,
  color: row.color,
  allocated: row.allocated_paise,
})

export const mapTransaction = (row) => ({
  id: row.id,
  type: row.type,
  description: row.description,
  merchant: row.merchant,
  categoryId: row.category_id,
  goalId: row.goal_id ?? undefined,
  amount: row.amount_paise,
  date: row.occurred_on,
  time: row.occurred_time,
  paymentMethod: row.payment_method,
  status: row.status,
  source: row.source,
  note: row.note,
  paymentReference: row.payment_reference ?? undefined,
  createdAt: row.created_at,
})

export const mapGoal = (row) => ({
  id: row.id,
  name: row.name,
  category: row.label,
  icon: row.icon,
  target: row.target_paise,
  saved: row.saved_paise,
  targetDate: row.target_date,
  createdAt: row.created_on,
})

export const mapNotification = (row) => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  body: row.body,
  date: row.created_on,
  read: row.read,
})

export const mapSettings = (wallet, preferences) => ({
  monthlyAllowance: wallet.allowance_paise,
  currency: wallet.currency,
  cycleResetDay: wallet.cycle_reset_day,
  ...DEFAULT_PREFERENCES,
  ...(preferences ?? {}),
})
