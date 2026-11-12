import { addDays, getCycle, today } from '../lib/dates.js'
import { paiseToDecimal } from '../lib/money.js'

/*
 * Demo data identical to client/src/data/mockData.js (amounts in rupees, as integers).
 * Expenses are placed on the same day-of-cycle as the frontend demo; with
 * APP_TODAY=2026-11-16 the dates match exactly. Totals: ₹10,000 allowance,
 * ₹4,800 spent across 21 successful expenses, one failed ₹799 payment.
 */

const CATEGORIES = [
  { key: 'food', name: 'Food & Dining', icon: 'utensils', color: '#4169E1', kind: 'spending', allocated: 3000 },
  { key: 'projects', name: 'Projects & Learning', icon: 'laptop', color: '#B8941F', kind: 'spending', allocated: 2000 },
  { key: 'travel', name: 'Travel & Commute', icon: 'bus', color: '#16A085', kind: 'spending', allocated: 1500 },
  { key: 'stationery', name: 'Stationery & Essentials', icon: 'pencil', color: '#A78BFA', kind: 'spending', allocated: 1000 },
  { key: 'shopping', name: 'Shopping & Personal', icon: 'shopping-bag', color: '#E57EA6', kind: 'spending', allocated: 1500 },
  { key: 'savings', name: 'Savings', icon: 'piggy-bank', color: '#7C8BA1', kind: 'savings', allocated: 1000 },
]

// [dayOfCycle, time, description, merchant, categoryKey, rupees, method, extra]
const TRANSACTIONS = [
  [1, '20:30', 'Biryani dinner', 'Swiggy', 'food', 280, 'upi-gpay'],
  [2, '13:10', 'Lunch thali', 'Campus Canteen', 'food', 120, 'campus-card'],
  [3, '17:45', 'Chai & samosa', 'Tea Stall, Gate 2', 'food', 60, 'cash'],
  [4, '21:15', 'Pizza night', "Domino's", 'food', 450, 'upi-gpay'],
  [6, '13:20', 'Lunch combo', 'Campus Canteen', 'food', 140, 'campus-card'],
  [7, '22:05', 'Friday dinner', 'Zomato', 'food', 380, 'upi-paytm'],
  [8, '16:30', 'Cold coffee with friends', 'Café Coffee Day', 'food', 220, 'upi-gpay'],
  [10, '13:05', 'Lunch thali', 'Campus Canteen', 'food', 130, 'campus-card'],
  [12, '23:20', 'Late-night snacks', 'Zepto', 'food', 180, 'upi-paytm', { note: 'Ordered after 11 PM' }],
  [14, '20:50', 'Pizza with roommates', 'Swiggy', 'food', 320, 'upi-gpay'],
  [16, '13:40', 'Lunch thali', 'Campus Canteen', 'food', 120, 'campus-card'],
  [3, '19:00', 'React course', 'Udemy', 'projects', 449, 'debit-card'],
  [9, '11:30', 'Ultrasonic sensor kit', 'Robu.in', 'projects', 351, 'upi-gpay'],
  [2, '09:15', 'Metro card recharge', 'Delhi Metro', 'travel', 200, 'upi-gpay'],
  [8, '07:40', 'Cab to railway station', 'Uber', 'travel', 250, 'upi-paytm'],
  [13, '18:10', 'Auto to market', 'Auto Rickshaw', 'travel', 150, 'cash'],
  [15, '10:00', 'Bus ticket home', 'RedBus', 'travel', 200, 'upi-gpay'],
  [5, '14:30', 'Photocopies & lab manual', 'Campus Xerox', 'stationery', 85, 'cash'],
  [11, '18:45', 'Toiletries', 'D-Mart', 'stationery', 245, 'debit-card'],
  [15, '16:20', 'Notebooks & pens', 'Campus Stationery', 'stationery', 120, 'cash'],
  [12, '15:00', 'T-shirt', 'Myntra', 'shopping', 350, 'upi-gpay'],
  [14, '19:30', 'Wireless earphones', 'Amazon', 'shopping', 799, 'paypal', { status: 'failed', source: 'paypal', note: 'Payment declined in PayPal sandbox' }],
]

const GOALS = [
  { name: 'MacBook Upgrade', label: 'Tech & Studies', icon: 'laptop', target: 65000, saved: 22000, targetDate: '2027-10-31' },
  { name: 'Goa Semester-End Trip', label: 'Travel', icon: 'plane', target: 12000, saved: 8400, targetDate: '2026-12-20' },
  { name: 'Emergency Fund', label: 'Safety Net', icon: 'shield', target: 5000, saved: 4100, targetDate: '2026-12-31' },
  { name: 'Arduino Robotics Kit', label: 'Engineering Lab', icon: 'bot', target: 3500, saved: 3500, targetDate: '2026-10-31' },
]

const rs = (rupees) => paiseToDecimal(rupees * 100)

/** Replaces all budget data for `userId` with the demo data. Run inside a transaction. */
export async function seedDemoData(client, userId) {
  await client.query('DELETE FROM notifications WHERE user_id = $1', [userId])
  await client.query('DELETE FROM payment_orders WHERE user_id = $1', [userId])
  await client.query('DELETE FROM transactions WHERE user_id = $1', [userId])
  await client.query('DELETE FROM savings_goals WHERE user_id = $1', [userId])
  await client.query('DELETE FROM categories WHERE user_id = $1', [userId])

  await client.query(
    `INSERT INTO wallets (user_id, monthly_allowance, cycle_reset_day) VALUES ($1, $2, 1)
     ON CONFLICT (user_id) DO UPDATE SET monthly_allowance = EXCLUDED.monthly_allowance, cycle_reset_day = 1, updated_at = now()`,
    [userId, rs(10000)],
  )

  const todayIso = today()
  const cycle = getCycle(1, todayIso)
  const maxDay = Math.min(16, Math.round((Date.parse(todayIso) - Date.parse(cycle.start)) / 86_400_000) + 1)

  const ids = {}
  for (const [position, c] of CATEGORIES.entries()) {
    const { rows } = await client.query(
      `INSERT INTO categories (user_id, name, kind, allocated, icon, color, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [userId, c.name, c.kind, rs(c.allocated), c.icon, c.color, position],
    )
    ids[c.key] = rows[0].id
  }

  for (const [day, time, description, merchant, key, rupees, method, extra = {}] of TRANSACTIONS) {
    await client.query(
      `INSERT INTO transactions (user_id, category_id, type, amount, description, merchant, note, occurred_on, occurred_time, payment_method, status, source)
       VALUES ($1, $2, 'expense', $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [userId, ids[key], rs(rupees), description, merchant, extra.note ?? '', addDays(cycle.start, Math.min(day, maxDay) - 1), time, method, extra.status ?? 'success', extra.source ?? 'seed'],
    )
  }

  for (const g of GOALS) {
    await client.query(
      `INSERT INTO savings_goals (user_id, name, label, icon, target, saved, target_date) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, g.name, g.label, g.icon, rs(g.target), rs(g.saved), g.targetDate],
    )
  }

  const notes = [
    ['warning', 'Food & Dining at 80%', 'You have ₹600 left for the rest of the month.', todayIso, false],
    ['info', 'Weekly recap ready', 'Your weekly spending summary is ready in Insights.', addDays(todayIso, -1), false],
    ['success', 'Goal achieved', 'Arduino Robotics Kit is fully funded.', addDays(cycle.start, -1), true],
  ]
  for (const [kind, title, body, date, read] of notes) {
    await client.query(`INSERT INTO notifications (user_id, kind, title, body, created_on, read) VALUES ($1, $2, $3, $4, $5, $6)`, [userId, kind, title, body, date, read])
  }
}
