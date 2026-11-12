/*
 * PayPal checkout tests with a MOCKED PayPal API (no network calls to PayPal).
 *   npm run test:payments
 * Starts a fake PayPal Orders v2 server and the real Express app in-process, registers two
 * temporary users, runs every payment scenario, then deletes the temporary users.
 * Needs PostgreSQL (DATABASE_URL) with migrations applied (`npm run db:migrate`).
 */
import http from 'node:http'
import { randomBytes } from 'node:crypto'

/* ---------------- Mock PayPal ---------------- */

const CLIENT_ID = 'test-client-id'
const CLIENT_SECRET = 'test-client-secret-DO-NOT-LOG'
const mock = { tokenCalls: 0, createCalls: 0, captureCalls: 0, getCalls: 0, tokens: new Set(), revokeOnce: false, nextCreate: null, nextCapture: null, orders: new Map(), requests: [] }
const rid = (n) => randomBytes(n).toString('hex').toUpperCase().slice(0, n)

/** A COMPLETED capture response mirroring what PayPal returns, built from the stored order. */
function completedFor(order, override = {}) {
  const pu = order.unit
  return {
    id: override.id ?? order.id,
    status: override.orderStatus ?? 'COMPLETED',
    purchase_units: [
      {
        reference_id: pu.reference_id,
        payments: {
          captures: [
            {
              id: override.captureId ?? `CAP${rid(14)}`,
              status: override.captureStatus ?? 'COMPLETED',
              amount: { currency_code: override.currency ?? pu.amount.currency_code, value: override.value ?? pu.amount.value },
              custom_id: override.customId ?? pu.custom_id,
            },
          ],
        },
      },
    ],
  }
}
const ppError = (status, issue) => ({ status, body: { name: 'UNPROCESSABLE_ENTITY', message: 'The requested action could not be performed.', debug_id: `dbg${rid(8)}`, details: [{ issue, description: `${issue} (mock)` }] } })

const paypalServer = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    mock.requests.push({ method: req.method, url: req.url, headers: req.headers, body: raw })

    if (req.url === '/v1/oauth2/token') {
      mock.tokenCalls += 1
      const expected = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
      if (req.headers.authorization !== expected || raw !== 'grant_type=client_credentials') return send(401, { error: 'invalid_client', error_description: 'Client Authentication failed' })
      const token = `A21AA-mock-token-${rid(10)}`
      mock.tokens.add(token)
      return send(200, { access_token: token, token_type: 'Bearer', expires_in: 32400 })
    }
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '')
    if (mock.revokeOnce || !mock.tokens.has(bearer)) {
      mock.revokeOnce = false
      mock.tokens.delete(bearer)
      return send(401, { error: 'invalid_token', error_description: 'Token signature verification failed' })
    }

    if (req.method === 'POST' && req.url === '/v2/checkout/orders') {
      mock.createCalls += 1
      if (mock.nextCreate) {
        const r = mock.nextCreate
        mock.nextCreate = null
        return send(r.status, r.body)
      }
      const body = JSON.parse(raw)
      const order = { id: `${rid(17)}`, unit: body.purchase_units[0], intent: body.intent, requestId: req.headers['paypal-request-id'], captured: false, getResponse: null }
      mock.orders.set(order.id, order)
      // Like PayPal with Prefer: return=representation: the purchase unit incl. the payee merchant.
      return send(201, { id: order.id, status: 'PAYER_ACTION_REQUIRED', purchase_units: [{ ...order.unit, payee: { merchant_id: 'MOCKMERCHANT01', email_address: 'merchant@business.example.com' } }] })
    }

    const capture = req.url.match(/^\/v2\/checkout\/orders\/([A-Z0-9]+)\/capture$/)
    if (req.method === 'POST' && capture) {
      mock.captureCalls += 1
      const order = mock.orders.get(capture[1])
      if (!order) return send(404, { name: 'RESOURCE_NOT_FOUND', details: [{ issue: 'INVALID_RESOURCE_ID' }] })
      if (mock.nextCapture) {
        const fn = mock.nextCapture
        mock.nextCapture = null
        const r = fn(order)
        return send(r.status, r.body)
      }
      if (order.captured) return send(...Object.values(ppError(422, 'ORDER_ALREADY_CAPTURED')))
      order.captured = true
      order.getResponse = completedFor(order)
      return send(201, order.getResponse)
    }

    const get = req.url.match(/^\/v2\/checkout\/orders\/([A-Z0-9]+)$/)
    if (req.method === 'GET' && get) {
      mock.getCalls += 1
      const order = mock.orders.get(get[1])
      if (!order) return send(404, { name: 'RESOURCE_NOT_FOUND' })
      return send(200, order.getResponse ?? { id: order.id, status: 'APPROVED', purchase_units: [order.unit] })
    }
    send(404, { name: 'NOT_FOUND' })
  })
})
await new Promise((r) => paypalServer.listen(0, '127.0.0.1', r))

/* ---------------- App under test (env set BEFORE importing it) ---------------- */

process.env.PAYPAL_CLIENT_ID = CLIENT_ID
process.env.PAYPAL_CLIENT_SECRET = CLIENT_SECRET
process.env.PAYPAL_BASE_URL = `http://127.0.0.1:${paypalServer.address().port}`
process.env.PAYPAL_CURRENCY = 'INR'
process.env.PAYPAL_TIMEOUT_MS = '5000'

// Capture logs so we can prove no secret or token is ever logged (PayPal log lines are not echoed).
const logs = []
for (const level of ['log', 'info', 'warn', 'error']) {
  const original = console[level].bind(console)
  console[level] = (...args) => {
    const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
    logs.push(line)
    if (!line.startsWith('[paypal]')) original(...args)
  }
}

const { createApp } = await import('../src/app.js')
const { pool } = await import('../src/db/pool.js')
const { chargeFor, valueToMinor } = await import('../src/lib/paypalCurrency.js')
const appServer = createApp().listen(0)
await new Promise((r) => appServer.once('listening', r))
const API = `http://127.0.0.1:${appServer.address().port}/api`

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : `\n    got ${JSON.stringify(actual)}\n    expected ${JSON.stringify(expected)}`}`)
}
async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, data: await res.json().catch(() => null) }
}

const createdUsers = []
async function newUser(tag) {
  const email = `paytest-${tag}-${Date.now()}-${rid(4)}@pockit.test`.toLowerCase()
  const r = await call('POST', '/auth/register', null, { name: `Pay Test ${tag}`, email, password: 'PayTest@1234', monthlyAllowance: '10000' })
  if (r.status !== 201) throw new Error(`register failed: ${JSON.stringify(r.data)}`)
  createdUsers.push(r.data.user.id)
  const boot = await call('GET', '/bootstrap', r.data.token)
  return { id: r.data.user.id, token: r.data.token, category: boot.data.categories.find((c) => c.kind === 'spending') }
}
const txCount = async (userId, status) => Number((await pool.query(`SELECT count(*) FROM transactions WHERE user_id = $1 ${status ? 'AND status = $2' : ''}`, status ? [userId, status] : [userId])).rows[0].count)
const spent = async (token) => (await call('GET', '/dashboard', token)).data.totalSpent
const orderRow = async (ref) => (await pool.query('SELECT status, paypal_order_id, paypal_capture_id, transaction_id, charge_currency, (charge_amount*100)::bigint AS charge_minor FROM payment_orders WHERE reference = $1', [ref])).rows[0]
const newOrder = (u, amount = 30000, extra = {}) => call('POST', '/payments/orders', u.token, { categoryId: u.category.id, amount, description: 'Dinner order', merchant: 'Swiggy', ...extra })
const capture = (u, order, paypalOrderId = order.paypalOrderId, extra = {}) => call('POST', `/payments/orders/${order.orderId}/capture`, u.token, { paypalOrderId, ...extra })

try {
  const a = await newUser('a')
  const b = await newUser('b')
  const startSpent = await spent(a.token)

  console.log('— Currency strategy (pure)')
  check('INR charges the exact rupee amount', chargeFor(30050, { currency: 'INR' }), { currency: 'INR', minor: 30050, value: '300.50', fxRatePaise: null })
  check('USD uses the configured rate, rounded half up to the cent', chargeFor(30000, { currency: 'USD', inrPerUsdPaise: 8850 }), { currency: 'USD', minor: 339, value: '3.39', fxRatePaise: 8850 })
  check('PayPal values parsed without floats', [valueToMinor('300.5'), valueToMinor('300.50'), valueToMinor('300'), valueToMinor('1e3'), valueToMinor('-1.00')], [30050, 30050, 30000, null, null])

  console.log('\n— Config')
  const config = await call('GET', '/payments/config', a.token)
  check('config exposes the public client ID and currency, never the secret', [config.data.enabled, config.data.clientId, config.data.chargeCurrency, JSON.stringify(config.data).includes(CLIENT_SECRET)], [true, CLIENT_ID, 'INR', false])
  check('config requires sign-in', (await call('GET', '/payments/config')).status, 401)

  console.log('\n— Order creation')
  const before = await txCount(a.id)
  const o1 = await newOrder(a, 30000, { currency: 'USD', value: '1.00', userId: b.id }) // tampered extras are ignored
  const sent = mock.orders.get(o1.data.paypalOrderId)
  check('201 with local reference and PayPal order id', [o1.status, /^PKT-[0-9A-F]{16}$/.test(o1.data.orderId), Boolean(o1.data.paypalOrderId)], [201, true, true])
  check('PayPal order built from the stored local order (INR 300.00, intent CAPTURE, reference attached)', [sent.intent, sent.unit.amount, sent.unit.custom_id], ['CAPTURE', { currency_code: 'INR', value: '300.00' }, o1.data.orderId])
  check('PayPal-Request-Id sent for idempotent creation', sent.requestId, `pockit-create-${o1.data.orderId}`)
  check('PayPal order id stored on the local order', (await orderRow(o1.data.orderId)).paypal_order_id, o1.data.paypalOrderId)
  check('no transaction exists before a verified capture', await txCount(a.id), before)
  check('create response reports the currency PayPal recorded and the payee merchant', o1.data.paypal, { orderId: o1.data.paypalOrderId, status: 'PAYER_ACTION_REQUIRED', currency: 'INR', value: '300.00', payeeMerchantId: 'MOCKMERCHANT01' })
  const diagLine = logs.find((l) => l.includes(`paypal_order=${o1.data.paypalOrderId}`)) ?? ''
  check('diagnostic log line: order id, requested + recorded currency, payee, SDK currency', [diagLine.includes('requested=INR 300.00'), diagLine.includes('paypal_unit=INR 300.00'), diagLine.includes('payee_merchant_id=MOCKMERCHANT01'), diagLine.includes('sdk_currency=INR')], [true, true, true, true])
  check('diagnostic log line contains no e-mail address', /@/.test(diagLine), false)

  mock.nextCreate = ppError(422, 'CURRENCY_NOT_SUPPORTED')
  const badCreate = await newOrder(a)
  const lastOrder = (await pool.query(`SELECT status, failure_reason FROM payment_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [a.id])).rows[0]
  check('PayPal create failure -> 502 with currency guidance', [badCreate.status, badCreate.data.error.code], [502, 'PAYPAL_CURRENCY_UNSUPPORTED'])
  check('…and the local order is closed, not left open', lastOrder, { status: 'failed', failure_reason: 'create: CURRENCY_NOT_SUPPORTED' })
  mock.nextCreate = { status: 500, body: { name: 'INTERNAL_SERVER_ERROR', debug_id: 'dbg500' } }
  check('PayPal outage on create -> 502 PAYPAL_UNAVAILABLE', (await newOrder(a)).data.error.code, 'PAYPAL_UNAVAILABLE')
  check('invalid amount rejected by validation', (await newOrder(a, -5)).status, 400)

  console.log('\n— Cancelled approval')
  const oc = (await newOrder(a)).data
  check('cancel -> CANCELLED', (await call('POST', `/payments/orders/${oc.orderId}/cancel`, a.token)).data.status, 'CANCELLED')
  const capturesBefore = mock.captureCalls
  check('capturing a cancelled order -> 409, PayPal not called', [(await capture(a, oc)).status, mock.captureCalls - capturesBefore], [409, 0])
  check('cancelled order created no transaction', await txCount(a.id), before)

  console.log('\n— Successful capture')
  const ok = await capture(a, o1.data)
  const okRow = await orderRow(o1.data.orderId)
  check('COMPLETED with a successful PayPal transaction', [ok.status, ok.data.status, ok.data.transaction.status, ok.data.transaction.paymentMethod, ok.data.transaction.amount], [200, 'COMPLETED', 'success', 'paypal', 30000])
  check('budget charged exactly the INR amount', (await spent(a.token)) - startSpent, 30000)
  check('PayPal order id and capture id stored for audit', [okRow.status, okRow.paypal_order_id, /^CAP/.test(okRow.paypal_capture_id), okRow.transaction_id === ok.data.transaction.id], ['completed', o1.data.paypalOrderId, true, true])
  const txCapture = (await pool.query('SELECT paypal_capture_id FROM transactions WHERE id = $1', [ok.data.transaction.id])).rows[0].paypal_capture_id
  check('transaction carries the PayPal capture id', txCapture, okRow.paypal_capture_id)
  check('capture used PayPal-Request-Id', mock.requests.filter((r) => r.url.endsWith('/capture')).at(-1).headers['paypal-request-id'], `pockit-capture-${o1.data.orderId}`)

  console.log('\n— Duplicate capture (idempotent)')
  const calls = mock.captureCalls
  const again = await capture(a, o1.data)
  check('repeat returns the same transaction, no new PayPal call', [again.status, again.data.alreadyCaptured, again.data.transaction.id, mock.captureCalls - calls], [200, true, ok.data.transaction.id, 0])
  check('still exactly one successful transaction for this order', Number((await pool.query(`SELECT count(*) FROM transactions WHERE payment_reference = $1 AND status = 'success'`, [o1.data.orderId])).rows[0].count), 1)
  const o2 = (await newOrder(a)).data
  const c0 = mock.captureCalls
  const [p1, p2, p3] = await Promise.all([capture(a, o2), capture(a, o2), capture(a, o2)])
  check('3 concurrent captures -> one PayPal capture, one expense', [[p1, p2, p3].map((p) => p.data.status), mock.captureCalls - c0, Number((await pool.query(`SELECT count(*) FROM transactions WHERE payment_reference = $1`, [o2.orderId])).rows[0].count)], [['COMPLETED', 'COMPLETED', 'COMPLETED'], 1, 1])
  check('…and the same transaction id for all three', new Set([p1, p2, p3].map((p) => p.data.transaction.id)).size, 1)
  let dbBlocked = false
  try {
    await pool.query(`INSERT INTO transactions (user_id, category_id, type, amount, description, merchant, occurred_on, payment_method, status, source, payment_reference)
      VALUES ($1, $2, 'expense', 300, 'dup', 'dup', CURRENT_DATE, 'paypal', 'success', 'paypal', $3)`, [a.id, a.category.id, o2.orderId])
  } catch (e) {
    dbBlocked = e.code === '23505'
  }
  check('database unique index blocks a second successful expense for the same order', dbBlocked, true)

  console.log('\n— Failed capture')
  const spentNow = await spent(a.token)
  const o3 = (await newOrder(a)).data
  mock.nextCapture = (order) => ({ status: 201, body: completedFor(order, { orderStatus: 'COMPLETED', captureStatus: 'DECLINED' }) })
  const declined = await capture(a, o3)
  check('DECLINED capture -> FAILED, recorded as a failed (not counted) transaction', [declined.data.status, declined.data.transaction.status, (await orderRow(o3.orderId)).status], ['FAILED', 'failed', 'failed'])
  check('declined capture deducts nothing', await spent(a.token), spentNow)
  const o4 = (await newOrder(a)).data
  mock.nextCapture = () => ppError(422, 'INSTRUMENT_DECLINED')
  const inst = await capture(a, o4)
  check('INSTRUMENT_DECLINED -> 422, order stays open for actions.restart(), nothing recorded', [inst.status, inst.data.error.code, (await orderRow(o4.orderId)).status, Number((await pool.query('SELECT count(*) FROM transactions WHERE payment_reference = $1', [o4.orderId])).rows[0].count)], [422, 'INSTRUMENT_DECLINED', 'created', 0])
  check('…and the buyer can then pay with another method', (await capture(a, o4)).data.status, 'COMPLETED')
  const o5 = (await newOrder(a)).data
  mock.nextCapture = (order) => {
    order.captured = true
    order.getResponse = completedFor(order)
    return { status: 500, body: { name: 'INTERNAL_SERVER_ERROR', debug_id: 'dbgLost' } }
  }
  const lost = await capture(a, o5)
  check('PayPal error after capturing (lost response) -> 502, nothing recorded yet', [lost.status, lost.data.error.code, Number((await pool.query('SELECT count(*) FROM transactions WHERE payment_reference = $1', [o5.orderId])).rows[0].count)], [502, 'PAYPAL_UNAVAILABLE', 0])
  const recovered = await capture(a, o5)
  check('retry recovers via ORDER_ALREADY_CAPTURED + order lookup, recorded once', [recovered.data.status, Number((await pool.query(`SELECT count(*) FROM transactions WHERE payment_reference = $1`, [o5.orderId])).rows[0].count)], ['COMPLETED', 1])

  console.log('\n— Pending capture')
  const o6 = (await newOrder(a)).data
  const spentBeforePending = await spent(a.token)
  mock.nextCapture = (order) => {
    order.captured = true
    order.getResponse = completedFor(order, { orderStatus: 'COMPLETED', captureStatus: 'PENDING' })
    return { status: 201, body: order.getResponse }
  }
  const pend = await capture(a, o6)
  check('PENDING capture -> PENDING, no transaction, nothing deducted', [pend.data.status, Number((await pool.query('SELECT count(*) FROM transactions WHERE payment_reference = $1', [o6.orderId])).rows[0].count), await spent(a.token)], ['PENDING', 0, spentBeforePending])
  mock.orders.get(o6.paypalOrderId).getResponse = completedFor(mock.orders.get(o6.paypalOrderId), { captureId: (await orderRow(o6.orderId)).paypal_capture_id })
  check('once PayPal completes it, a later capture call records it exactly once', [(await capture(a, o6)).data.status, (await spent(a.token)) - spentBeforePending], ['COMPLETED', 30000])

  console.log('\n— Amount / currency / order id mismatches (never deducted)')
  for (const [label, override] of [
    ['amount mismatch (₹299.00 instead of ₹300.00)', { value: '299.00' }],
    ['currency mismatch (USD instead of INR)', { currency: 'USD' }],
    ['PayPal response for a different order id', { id: 'WRONGORDER12345678' }],
    ['capture tagged with another payment reference', { customId: 'PKT-0000000000000000' }],
  ]) {
    const o = (await newOrder(a)).data
    const s0 = await spent(a.token)
    mock.nextCapture = (order) => ({ status: 201, body: completedFor(order, override) })
    const r = await capture(a, o)
    check(`${label} -> NEEDS_REVIEW, no transaction, nothing deducted`, [r.data.status, (await orderRow(o.orderId)).status, Number((await pool.query('SELECT count(*) FROM transactions WHERE payment_reference = $1', [o.orderId])).rows[0].count), await spent(a.token)], ['NEEDS_REVIEW', 'needs_review', 0, s0])
    check(`…a later retry cannot complete it (${label.split(' (')[0]})`, (await capture(a, o)).data?.error?.code, 'ORDER_CLOSED')
  }
  const o7 = (await newOrder(a)).data
  const c1 = mock.captureCalls
  const wrongId = await capture(a, o7, 'SOMEOTHERORDER1234')
  check('client sends a different PayPal order id -> 400, PayPal never called', [wrongId.status, mock.captureCalls - c1], [400, 0])

  console.log('\n— Cross-user access')
  const o8 = (await newOrder(a)).data
  const c2 = mock.captureCalls
  check("user B cannot capture user A's order (404), PayPal never called", [(await capture(b, o8)).status, mock.captureCalls - c2], [404, 0])
  check("user B cannot cancel user A's order (404)", (await call('POST', `/payments/orders/${o8.orderId}/cancel`, b.token)).status, 404)
  check("user B cannot pay from user A's category", (await call('POST', '/payments/orders', b.token, { categoryId: a.category.id, amount: 30000, description: 'Hack' })).status, 400)
  check('user B has no transactions', await txCount(b.id), 0)

  console.log('\n— Request validation')
  check('old simulateFailure flag is rejected', (await capture(a, o8, o8.paypalOrderId, { simulateFailure: true })).status, 400)
  check('client-supplied amount on capture is rejected', (await capture(a, o8, o8.paypalOrderId, { amount: 1 })).status, 400)
  check('malformed reference rejected', (await call('POST', '/payments/orders/NOT-A-REF/capture', a.token, { paypalOrderId: o8.paypalOrderId })).status, 400)
  check('capture requires sign-in', (await call('POST', `/payments/orders/${o8.orderId}/capture`, null, { paypalOrderId: o8.paypalOrderId })).status, 401)

  console.log('\n— Tokens and secrets')
  check('OAuth token fetched once and cached across all calls', mock.tokenCalls, 1)
  mock.revokeOnce = true
  check('expired token: refreshed once and the request succeeds', [(await newOrder(a)).status, mock.tokenCalls], [201, 2])
  const everything = logs.join('\n')
  const tokens = [...mock.tokens]
  check('no client secret, Basic credentials or access token in any log line', [everything.includes(CLIENT_SECRET), everything.includes(Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')), tokens.some((t) => everything.includes(t))], [false, false, false])
  check('PayPal failures are logged with issue + debug id', logs.some((l) => l.startsWith('[paypal]') && l.includes('CURRENCY_NOT_SUPPORTED') && l.includes('debug_id=')), true)
} catch (error) {
  failures += 1
  console.error('✗ test run crashed:', error)
} finally {
  if (createdUsers.length) {
    await pool.query('DELETE FROM transactions WHERE user_id = ANY($1)', [createdUsers])
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [createdUsers])
  }
  await new Promise((r) => appServer.close(r))
  await new Promise((r) => paypalServer.close(r))
  await pool.end()
  console.log(failures === 0 ? '\nAll payment checks passed.' : `\n${failures} payment check(s) failed.`)
  process.exitCode = failures === 0 ? 0 : 1
}
