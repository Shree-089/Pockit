/*
 * End-to-end API check against a running server. Usage:
 *   npm run db:reset && npm run dev      (in one terminal)
 *   npm run test:api                     (in another)
 * Optional: API_URL=http://localhost:4000/api npm run test:api
 */
import 'dotenv/config'

const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}/api`
let failures = 0

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(`${ok ? '✓' : '✗'} ${label}: ${JSON.stringify(actual)}${ok ? '' : `  (expected ${JSON.stringify(expected)})`}`)
}

const health = await call('GET', '/health')
check('health', health.data?.status, 'ok')

const login = await call('POST', '/auth/login', { body: { email: process.env.DEMO_EMAIL ?? 'demo@pockit.app', password: process.env.DEMO_PASSWORD ?? 'Pockit@123' } })
check('demo login', login.status, 200)
const token = login.data.token

check('no token -> 401', (await call('GET', '/dashboard')).status, 401)
check('bad password -> 401', (await call('POST', '/auth/login', { body: { email: 'demo@pockit.app', password: 'wrong-password' } })).status, 401)

let dash = (await call('GET', '/dashboard', { token })).data
const food = dash.categories.find((c) => c.name === 'Food & Dining')
check('allowance (paise)', dash.allowance, 1000000)
check('total spent', dash.totalSpent, 480000)
check('wallet balance', dash.walletBalance, 520000)
check('food spent / remaining', [food.spent, food.remaining], [240000, 60000])
check('failed payment not counted (21 expenses)', dash.transactionCount, 21)

const guard = (await call('POST', '/purchases/assess', { token, body: { categoryId: food.id, amount: 50000 } })).data
check('guard ₹500 on food', [guard.assessment.level, guard.assessment.remainingAfter, guard.assessment.canProceed], ['warning', 10000, true])

const bad = await call('POST', '/transactions', { token, body: { amount: '-5', description: 'x', categoryId: food.id, date: dash.cycle.today, paymentMethod: 'cash' } })
check('invalid expense -> 400 with field errors', [bad.status, Object.keys(bad.data.error.fieldErrors ?? {}).sort()], [400, ['amount', 'description']])
const badCat = await call('POST', '/transactions', { token, body: { amount: 100, description: 'Test', categoryId: '00000000-0000-0000-0000-000000000000', date: dash.cycle.today, paymentMethod: 'cash' } })
check('unknown category -> 400', badCat.status, 400)

const created = await call('POST', '/transactions', { token, body: { amount: '120.50', description: 'Samosa & chai', categoryId: food.id, date: dash.cycle.today, time: '17:05', paymentMethod: 'cash' } })
check('create expense ₹120.50', [created.status, created.data.amount], [201, 12050])
dash = (await call('GET', '/dashboard', { token })).data
check('totals updated', [dash.totalSpent, dash.walletBalance], [492050, 507950])

const filtered = (await call('GET', `/transactions?categoryId=${food.id}&from=${dash.cycle.today}&to=${dash.cycle.today}`, { token })).data
check('filter by category + date', filtered.every((t) => t.categoryId === food.id && t.date === dash.cycle.today), true)
check('search q=canteen', (await call('GET', '/transactions?q=canteen', { token })).data.length > 0, true)

// Payments: the PayPal flow itself is tested with a mocked PayPal API in `npm run test:payments`.
// Here we only check the routes never fall back to the old simulated capture.
const payConfig = (await call('GET', '/payments/config', { token })).data
check('payment config never exposes the PayPal secret', JSON.stringify(payConfig).toLowerCase().includes('secret'), false)
const fakeRef = 'PKT-0000000000000000'
check('old simulateFailure capture flag rejected', (await call('POST', `/payments/orders/${fakeRef}/capture`, { token, body: { paypalOrderId: 'ABCDEFGHIJ1234567', simulateFailure: true } })).status, 400)
check('capture of an unknown order -> 404', (await call('POST', `/payments/orders/${fakeRef}/capture`, { token, body: { paypalOrderId: 'ABCDEFGHIJ1234567' } })).status, 404)
if (!payConfig.enabled) {
  check('checkout without PayPal configured -> 503', (await call('POST', '/payments/orders', { token, body: { categoryId: food.id, amount: 30000, description: 'Pizza' } })).status, 503)
}
check('payment checks deduct nothing', (await call('GET', '/dashboard', { token })).data.totalSpent, 492050)

const goals = (await call('GET', '/goals', { token })).data
const goa = goals.find((g) => g.name.startsWith('Goa'))
const contrib = await call('POST', `/goals/${goa.id}/contributions`, { token, body: { amount: 40000 } })
check('contribute ₹400 to goal', [contrib.status, contrib.data.goal.saved], [201, 880000])
check('savings bucket limit enforced', (await call('POST', `/goals/${goa.id}/contributions`, { token, body: { amount: 70000 } })).status, 400)
dash = (await call('GET', '/dashboard', { token })).data
check('wallet after savings move', [dash.walletBalance, dash.savingsRemaining, dash.totalSpent], [467950, 60000, 492050])

const reg = await call('POST', '/auth/register', { body: { name: 'Test Student', email: `test${Date.now()}@example.com`, password: 'password123', monthlyAllowance: 800000 } })
check('register', reg.status, 201)
const other = reg.data.token
check('other user cannot read demo transaction', (await call('GET', `/transactions/${created.data.id}`, { token: other })).status, 404)
check('other user cannot spend from demo category', (await call('POST', '/transactions', { token: other, body: { amount: 100, description: 'Hack', categoryId: food.id, date: dash.cycle.today, paymentMethod: 'cash' } })).status, 400)
const otherDash = (await call('GET', '/dashboard', { token: other })).data
check('new user starter budget sums to allowance', [otherDash.totalAllocated, otherDash.walletBalance, otherDash.totalSpent], [800000, 800000, 0])

const gym = await call('POST', '/budgets', { token, body: { name: 'Gym', allocated: '300', icon: 'heart-pulse' } })
check('create category', [gym.status, gym.data.allocated], [201, 30000])
check('duplicate name rejected', (await call('POST', '/budgets', { token, body: { name: 'gym', allocated: 0 } })).status, 400)
check('update category', (await call('PUT', `/budgets/${gym.data.id}`, { token, body: { allocated: 50000 } })).data.allocated, 50000)
const shopping = dash.categories.find((c) => c.name === 'Shopping & Personal')
check('delete with transactions needs reassignment', (await call('DELETE', `/budgets/${shopping.id}`, { token })).status, 409)
const del = await call('DELETE', `/budgets/${shopping.id}?reassignTo=${gym.data.id}`, { token })
check('delete + reassign keeps total spent', [del.status, (await call('GET', '/dashboard', { token })).data.totalSpent], [200, 492050])
const budgetsNow = (await call('GET', '/budgets', { token })).data.categories
const plan = await call('PUT', '/budgets', { token, body: { allowance: 1200000, categories: budgetsNow.filter((c) => c.name !== 'Gym').map((c) => ({ id: c.id, name: c.name, allocated: c.allocated, kind: c.kind })) } })
const afterPlan = (await call('GET', '/dashboard', { token })).data
check('save plan: removed category history moves to Other', [plan.status, plan.data.categories.some((c) => c.name === 'Other'), afterPlan.totalSpent, afterPlan.allowance], [200, true, 492050, 1200000])
check('plan over allowance rejected', (await call('PUT', '/budgets', { token, body: { allowance: 100, categories: [{ name: 'Food', allocated: 500 }] } })).status, 400)
check('settings patch', (await call('PATCH', '/settings', { token, body: { guardThreshold: 70, monthlyAllowance: 1000000 } })).data.guardThreshold, 70)
check('wallet get', (await call('GET', '/wallet', { token })).data.monthlyAllowance, 1000000)
check('wallet put validation', (await call('PUT', '/wallet', { token, body: { cycleResetDay: 31 } })).status, 400)
const alloc = (await call('POST', '/ai/budget-allocation', { token, body: { monthlyAmount: 1000000, savingsAmount: 100000, description: 'hostel, food outside, projects, travel home' } })).data
check('AI allocation sums to funds', alloc.categories.reduce((a, c) => a + c.allocated, 0), 1000000)
check('AI chat replies', typeof (await call('POST', '/ai/chat', { token, body: { message: 'Can I order dinner for ₹450?' } })).data.text, 'string')
check('notifications read-all', (await call('POST', '/notifications/read-all', { token })).data.every((n) => n.read), true)

const reset = await call('POST', '/demo/reset', { token })
check('demo reset', reset.data?.summary?.totalSpent, 480000)

console.log(failures === 0 ? '\nAll API checks passed.' : `\n${failures} check(s) failed.`)
process.exitCode = failures === 0 ? 0 : 1
