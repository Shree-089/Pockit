/*
 * CENTRAL MOCK DATA
 * The seed "database" for Phase 1. All amounts are integer paise, written with rupees().
 * Nothing here is derived: totals, remaining amounts and statuses are computed by
 * utils/calculations.js so they always reconcile.
 *
 * Reconciliation (checked by scripts/verify-data.mjs):
 *   Allocations  ₹3,000 + ₹2,000 + ₹1,500 + ₹1,000 + ₹1,500 + ₹1,000 = ₹10,000 (allowance)
 *   Spent        ₹2,400 + ₹800 + ₹800 + ₹450 + ₹350 = ₹4,800  (21 successful expenses)
 *   Wallet       ₹10,000 − ₹4,800 = ₹5,200
 *   One failed PayPal payment (₹799) is shown in history but excluded from totals.
 */

import { rupees } from '../utils/money.js'

export const MOCK_DB_VERSION = 2

/* Budget cycle: the demo is frozen on 16 Nov 2026 (day 16 of 30). */
export const MOCK_CYCLE = {
  start: '2026-11-01',
  end: '2026-11-30',
  today: '2026-11-16',
}

export const MOCK_USER = {
  id: 'user_aanya',
  name: 'Aanya Sharma',
  firstName: 'Aanya',
  email: 'aanya.sharma@student.example.edu',
  college: 'IIIT Delhi',
  program: 'B.Tech Computer Science (2023–2027)',
  residence: 'Hostel',
  avatarUrl: null,
}

export const MOCK_SETTINGS = {
  monthlyAllowance: rupees(10000),
  currency: 'INR',
  cycleResetDay: 1,
  guardEnabled: true,
  guardThreshold: 80, // warn when a purchase would push a category to >= 80% used
  smartRebalancing: true,
  dailyRecap: true,
  weekendNudge: true, // a reminder, never a lock: Pockit is advisory
  paceAlerts: true,
}

/*
 * kind: 'spending' | 'savings'
 * icon: a key the UI maps to a Lucide icon
 * color: chart/accent colour, chosen to sit within the Stitch palette
 */
export const MOCK_CATEGORIES = [
  { id: 'food', name: 'Food & Dining', icon: 'utensils', color: '#4169E1', kind: 'spending', allocated: rupees(3000) },
  { id: 'projects', name: 'Projects & Learning', icon: 'laptop', color: '#B8941F', kind: 'spending', allocated: rupees(2000) },
  { id: 'travel', name: 'Travel & Commute', icon: 'bus', color: '#16A085', kind: 'spending', allocated: rupees(1500) },
  { id: 'stationery', name: 'Stationery & Essentials', icon: 'pencil', color: '#A78BFA', kind: 'spending', allocated: rupees(1000) },
  { id: 'shopping', name: 'Shopping & Personal', icon: 'shopping-bag', color: '#E57EA6', kind: 'spending', allocated: rupees(1500) },
  { id: 'savings', name: 'Savings', icon: 'piggy-bank', color: '#7C8BA1', kind: 'savings', allocated: rupees(1000) },
]

export const PAYMENT_METHODS = [
  { id: 'upi-gpay', label: 'UPI (GPay)', short: 'GPay UPI' },
  { id: 'upi-paytm', label: 'UPI (Paytm)', short: 'Paytm UPI' },
  { id: 'campus-card', label: 'Campus Card', short: 'Campus Card' },
  { id: 'debit-card', label: 'Debit Card', short: 'Debit Card' },
  { id: 'cash', label: 'Cash', short: 'Cash' },
  { id: 'paypal', label: 'PayPal', short: 'PayPal' },
]

/** Internal method used only for moving money into savings goals (not user-selectable). */
export const VAULT_METHOD = { id: 'pockit-vault', label: 'Pockit Vault', short: 'Pockit Vault' }

const tx = (id, date, time, description, merchant, categoryId, amount, paymentMethod, extra = {}) => ({
  id,
  type: 'expense',
  description,
  merchant,
  categoryId,
  amount: rupees(amount),
  date,
  time,
  paymentMethod,
  status: 'success',
  source: 'seed',
  note: '',
  ...extra,
})

export const MOCK_TRANSACTIONS = [
  // Food & Dining: 11 expenses = ₹2,400
  tx('txn_001', '2026-11-01', '20:30', 'Biryani dinner', 'Swiggy', 'food', 280, 'upi-gpay'),
  tx('txn_002', '2026-11-02', '13:10', 'Lunch thali', 'Campus Canteen', 'food', 120, 'campus-card'),
  tx('txn_003', '2026-11-03', '17:45', 'Chai & samosa', 'Tea Stall, Gate 2', 'food', 60, 'cash'),
  tx('txn_004', '2026-11-04', '21:15', 'Pizza night', "Domino's", 'food', 450, 'upi-gpay'),
  tx('txn_005', '2026-11-06', '13:20', 'Lunch combo', 'Campus Canteen', 'food', 140, 'campus-card'),
  tx('txn_006', '2026-11-07', '22:05', 'Friday dinner', 'Zomato', 'food', 380, 'upi-paytm'),
  tx('txn_007', '2026-11-08', '16:30', 'Cold coffee with friends', 'Café Coffee Day', 'food', 220, 'upi-gpay'),
  tx('txn_008', '2026-11-10', '13:05', 'Lunch thali', 'Campus Canteen', 'food', 130, 'campus-card'),
  tx('txn_009', '2026-11-12', '23:20', 'Late-night snacks', 'Zepto', 'food', 180, 'upi-paytm', { note: 'Ordered after 11 PM' }),
  tx('txn_010', '2026-11-14', '20:50', 'Pizza with roommates', 'Swiggy', 'food', 320, 'upi-gpay'),
  tx('txn_011', '2026-11-16', '13:40', 'Lunch thali', 'Campus Canteen', 'food', 120, 'campus-card'),

  // Projects & Learning: 2 expenses = ₹800
  tx('txn_012', '2026-11-03', '19:00', 'React course', 'Udemy', 'projects', 449, 'debit-card'),
  tx('txn_013', '2026-11-09', '11:30', 'Ultrasonic sensor kit', 'Robu.in', 'projects', 351, 'upi-gpay'),

  // Travel & Commute: 4 expenses = ₹800
  tx('txn_014', '2026-11-02', '09:15', 'Metro card recharge', 'Delhi Metro', 'travel', 200, 'upi-gpay'),
  tx('txn_015', '2026-11-08', '07:40', 'Cab to railway station', 'Uber', 'travel', 250, 'upi-paytm'),
  tx('txn_016', '2026-11-13', '18:10', 'Auto to market', 'Auto Rickshaw', 'travel', 150, 'cash'),
  tx('txn_017', '2026-11-15', '10:00', 'Bus ticket home', 'RedBus', 'travel', 200, 'upi-gpay'),

  // Stationery & Essentials: 3 expenses = ₹450
  tx('txn_018', '2026-11-05', '14:30', 'Photocopies & lab manual', 'Campus Xerox', 'stationery', 85, 'cash'),
  tx('txn_019', '2026-11-11', '18:45', 'Toiletries', 'D-Mart', 'stationery', 245, 'debit-card'),
  tx('txn_020', '2026-11-15', '16:20', 'Notebooks & pens', 'Campus Stationery', 'stationery', 120, 'cash'),

  // Shopping & Personal: 1 expense = ₹350
  tx('txn_021', '2026-11-12', '15:00', 'T-shirt', 'Myntra', 'shopping', 350, 'upi-gpay'),

  // Failed payment: visible in Passbook, NOT counted in any total
  tx('txn_022', '2026-11-14', '19:30', 'Wireless earphones', 'Amazon', 'shopping', 799, 'paypal', {
    status: 'failed',
    source: 'paypal',
    note: 'Payment declined in PayPal sandbox',
  }),
]

/* Savings goals hold money saved in previous months; it is NOT part of this month's wallet. */
export const MOCK_GOALS = [
  { id: 'goal_laptop', name: 'MacBook Upgrade', category: 'Tech & Studies', icon: 'laptop', target: rupees(65000), saved: rupees(22000), targetDate: '2027-10-31', createdAt: '2026-01-05' },
  { id: 'goal_goa', name: 'Goa Semester-End Trip', category: 'Travel', icon: 'plane', target: rupees(12000), saved: rupees(8400), targetDate: '2026-12-20', createdAt: '2026-06-01' },
  { id: 'goal_emergency', name: 'Emergency Fund', category: 'Safety Net', icon: 'shield', target: rupees(5000), saved: rupees(4100), targetDate: '2026-12-31', createdAt: '2026-03-10' },
  { id: 'goal_arduino', name: 'Arduino Robotics Kit', category: 'Engineering Lab', icon: 'bot', target: rupees(3500), saved: rupees(3500), targetDate: '2026-10-31', createdAt: '2026-07-15' },
]

export const MOCK_NOTIFICATIONS = [
  { id: 'ntf_1', kind: 'warning', title: 'Food & Dining at 80%', body: 'You have ₹600 left for the next 14 days.', date: '2026-11-16', read: false },
  { id: 'ntf_2', kind: 'info', title: 'Weekly recap ready', body: 'You spent ₹2,046 between 9 and 15 Nov.', date: '2026-11-15', read: false },
  { id: 'ntf_3', kind: 'success', title: 'Goal achieved', body: 'Arduino Robotics Kit is fully funded.', date: '2026-10-31', read: true },
]

/* ------------------------------------------------------------------ */
/* AI simulation data (used only by the mock services)                 */
/* ------------------------------------------------------------------ */

/**
 * Rules for the mock AI budget allocator. `core` categories are always suggested;
 * optional ones only when the description mentions them. Matching keywords boosts weight.
 */
export const AI_CATEGORY_RULES = [
  { key: 'food', name: 'Food & Dining', icon: 'utensils', color: '#4169E1', core: true, weight: 30,
    keywords: ['food', 'eat', 'meal', 'canteen', 'swiggy', 'zomato', 'snack', 'cafe', 'dinner', 'lunch', 'outside'],
    reason: 'Eating out is usually the biggest and fastest-moving expense for hostel students.' },
  { key: 'projects', name: 'Projects & Learning', icon: 'laptop', color: '#B8941F', core: true, weight: 20,
    keywords: ['project', 'course', 'learning', 'book', 'arduino', 'coding', 'lab', 'component', 'study'],
    reason: 'Project components and courses come in bursts, so this keeps a buffer ready.' },
  { key: 'travel', name: 'Travel & Commute', icon: 'bus', color: '#16A085', core: true, weight: 15,
    keywords: ['travel', 'home', 'train', 'bus', 'metro', 'cab', 'uber', 'auto', 'trip', 'commute'],
    reason: 'Covers daily commute plus a trip home.' },
  { key: 'stationery', name: 'Stationery & Essentials', icon: 'pencil', color: '#A78BFA', core: true, weight: 10,
    keywords: ['stationery', 'print', 'xerox', 'notebook', 'pen', 'essential', 'toiletries', 'laundry'],
    reason: 'Small, regular costs: printouts, notebooks and toiletries.' },
  { key: 'shopping', name: 'Shopping & Personal', icon: 'shopping-bag', color: '#E57EA6', core: true, weight: 10,
    keywords: ['shopping', 'clothes', 'personal', 'gift', 'movie', 'fun', 'outing', 'occasional'],
    reason: 'Room for occasional shopping and outings without guilt.' },
  { key: 'health', name: 'Health & Fitness', icon: 'heart-pulse', color: '#DC5656', core: false, weight: 8,
    keywords: ['gym', 'medicine', 'health', 'fitness', 'doctor', 'pharmacy'],
    reason: 'You mentioned health or fitness costs.' },
  { key: 'subscriptions', name: 'Subscriptions & Recharge', icon: 'smartphone', color: '#E99A45', core: false, weight: 6,
    keywords: ['netflix', 'spotify', 'subscription', 'recharge', 'phone', 'data', 'internet', 'prime'],
    reason: 'You mentioned subscriptions or mobile recharges.' },
]

export const SAVINGS_CATEGORY_TEMPLATE = {
  key: 'savings', name: 'Savings', icon: 'piggy-bank', color: '#7C8BA1', kind: 'savings',
  reason: 'Set aside first, so saving happens before spending.',
}

export const ASSISTANT_SUGGESTIONS = [
  'Can I afford a ₹2,000 purchase this week?',
  'Can I order dinner for ₹450 tonight?',
  'Where is most of my money going?',
  'How can I save more this month?',
]

export const ASSISTANT_WELCOME = {
  id: 'msg_welcome',
  role: 'assistant',
  text: "Hi Aanya! I'm Pockit AI. Ask me whether you can afford something, where your money is going, or how to save more.",
  createdAt: '2026-11-16T09:00:00+05:30',
}

/** Returns a fresh deep copy of the seed data (so mutations never touch these constants). */
export function createSeedDatabase() {
  return structuredClone({
    version: MOCK_DB_VERSION,
    user: MOCK_USER,
    settings: MOCK_SETTINGS,
    cycle: MOCK_CYCLE,
    categories: MOCK_CATEGORIES,
    transactions: MOCK_TRANSACTIONS,
    goals: MOCK_GOALS,
    notifications: MOCK_NOTIFICATIONS,
  })
}
