import { randomBytes } from 'node:crypto'
import { pool, query, withTransaction } from '../db/pool.js'
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js'
import { env } from '../config/env.js'
import { assessPurchase } from '../lib/budget.js'
import { formatDateLabel, nowTime } from '../lib/dates.js'
import { formatINR, paiseToDecimal } from '../lib/money.js'
import { getSummary } from './financeService.js'
import { TRANSACTION_COLUMNS, mapTransaction } from './mappers.js'
import { categorySpent, notifyIfThresholdCrossed } from './transactionService.js'
import { getCurrentCycle } from './financeService.js'
import { explainPurchase } from './aiService.js'
import * as paypal from '../lib/paypalClient.js'
import { PayPalError, isPayPalEnabled } from '../lib/paypalClient.js'
import { chargeFor, minorToValue, rateToString, valueToMinor } from '../lib/paypalCurrency.js'

/*
 * Pre-Payment Budget Guard + PayPal Sandbox checkout (Orders v2).
 * Only a capture that PayPal reports COMPLETED and that matches the stored order exactly
 * creates a successful transaction. Declined captures are recorded with status 'failed'
 * (visible, never deducted); pending or unverified captures and cancelled orders record nothing.
 */

function recommendation(a, categoryName) {
  const isFood = /food|dining|meal|canteen/i.test(categoryName)
  if (a.level === 'over') return `This would put ${categoryName} ${formatINR(a.shortfall)} over budget. If you go ahead, consider moving money from a category with room to spare.`
  if (a.level === 'warning') {
    return isFood
      ? `You'd have ${formatINR(a.remainingAfter)} left for ${a.daysRemaining} days (about ${formatINR(a.dailyLimitAfter)}/day). A canteen meal or splitting this order with friends would keep more in reserve.`
      : `You'd have ${formatINR(a.remainingAfter)} left for ${a.daysRemaining} days. If this can wait until next month, your budget stays comfortable.`
  }
  if (a.level === 'caution') return `This is affordable, but ${categoryName} is running ahead of the month. Try to keep it near ${formatINR(a.dailyLimitAfter)}/day afterwards.`
  return `Looks fine. You'll still have ${formatINR(a.remainingAfter)} in ${categoryName}.`
}

/**
 * POST /api/purchases/assess: advisory only, never blocks.
 * The risk level and all figures are computed here; with explain=true the model may
 * rephrase the explanation (validated and grounded), otherwise the deterministic text is used.
 */
export async function evaluatePurchase(userId, { categoryId, amount, description = '', explain = false }) {
  const [summary, prefs] = await Promise.all([getSummary(pool, userId), query('SELECT preferences FROM users WHERE id = $1', [userId])])
  const stats = summary.categories.find((c) => c.id === categoryId)
  if (!stats) throw badRequest('Choose a budget category', { categoryId: 'Choose a budget category' })
  if (stats.kind === 'savings') throw badRequest('Purchases cannot be made from Savings', { categoryId: 'Choose a spending category' })

  const threshold = prefs.rows[0].preferences?.guardThreshold ?? 80
  const assessment = assessPurchase({ stats, amount, progress: summary.progress, cycle: summary.cycle, warnThreshold: threshold })
  const message =
    assessment.riskLevel === 'high_risk'
      ? `This purchase would use up your ${stats.name} budget${assessment.shortfall ? ` and go ${formatINR(assessment.shortfall)} over` : ''}.`
      : assessment.riskLevel === 'warning'
        ? `This purchase might affect your remaining ${stats.name.toLowerCase()} budget. You've already used ${assessment.consumedBefore}% of it.`
        : `This fits within your ${stats.name} budget.`
  const advice = recommendation(assessment, stats.name)
  const explained = explain ? await explainPurchase(assessment, `${message} ${advice}`) : { explanation: `${message} ${advice}`, explanationSource: 'rules', model: null }

  return {
    description,
    assessment,
    riskLevel: assessment.riskLevel,
    title: assessment.riskLevel === 'high_risk' ? 'This one is risky' : assessment.riskLevel === 'warning' ? 'Hold on a second!' : 'You’re good to go',
    message,
    recommendation: advice,
    explanation: explained.explanation,
    explanationSource: explained.explanationSource,
    explanationModel: explained.model,
    forecast: assessment.depletionDateAfter
      ? `At your current pace (${formatINR(assessment.dailyPace)}/day), ${stats.name} would run out around ${formatDateLabel(assessment.depletionDateAfter)}.`
      : `At your current pace, ${stats.name} should last the rest of the month.`,
  }
}

/* ================================================================== */
/* PayPal Orders v2 checkout                                           */
/* ================================================================== */

const ORDER_COLS = `id, reference, user_id, category_id, (amount * 100)::bigint AS amount_paise, currency, description, merchant, status, provider,
  charge_currency, (charge_amount * 100)::bigint AS charge_minor, fx_rate::numeric(12,2)::text AS fx_rate, paypal_order_id, paypal_capture_id, paypal_status,
  failure_reason, transaction_id, captured_at, created_at`

const mapOrder = (r) => ({
  orderId: r.reference,
  paypalOrderId: r.paypal_order_id ?? null,
  status: r.status.toUpperCase(),
  amount: r.amount_paise, // accounting amount, INR paise
  currency: r.currency, // accounting currency (INR)
  charge: r.charge_currency ? { currency: r.charge_currency, amount: r.charge_minor, value: minorToValue(r.charge_minor), fxRate: r.fx_rate } : null,
  description: r.description,
  merchant: r.merchant,
  categoryId: r.category_id,
  createdAt: r.created_at,
})

/** Public checkout settings for the browser. The client ID is public by design; the secret never leaves the server. */
export function getPaymentConfig() {
  return {
    provider: 'paypal',
    enabled: isPayPalEnabled(),
    environment: env.paypal.environment,
    clientId: env.paypal.clientId,
    accountingCurrency: 'INR',
    chargeCurrency: env.paypal.currency,
    fxRate: rateToString(env.paypal.inrPerUsdPaise), // INR per USD, only for USD charges
  }
}

const notConfigured = () => new AppError(503, 'PayPal checkout is not configured on the server', { code: 'PAYPAL_NOT_CONFIGURED' })

/** Turns a PayPal failure into a safe API error (no secrets, PayPal debug id kept for support). */
function paypalApiError(error, action) {
  const debug = error.debugId ? ` (PayPal debug id ${error.debugId})` : ''
  if (error.code === 'PAYPAL_NOT_CONFIGURED') return notConfigured()
  if (['CURRENCY_NOT_SUPPORTED', 'CURRENCY_NOT_ALLOWED', 'PAYEE_ACCOUNT_RESTRICTED'].includes(error.issue)) {
    return new AppError(502, `PayPal refused to ${action} in ${env.paypal.currency}${debug}. INR works only when the PayPal merchant and buyer accounts are both registered in India; otherwise set PAYPAL_CURRENCY=USD with PAYPAL_INR_PER_USD.`, { code: 'PAYPAL_CURRENCY_UNSUPPORTED' })
  }
  if (error.code === 'PAYPAL_AUTH') return new AppError(502, `PayPal rejected the server's credentials${debug}. Check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_BASE_URL.`, { code: 'PAYPAL_AUTH' })
  if (error.code === 'PAYPAL_TIMEOUT' || error.code === 'PAYPAL_NETWORK' || error.status >= 500) {
    return new AppError(502, `PayPal is unavailable right now, please try again${debug}.`, { code: 'PAYPAL_UNAVAILABLE' })
  }
  return new AppError(502, `PayPal could not ${action}${error.issue ? ` (${error.issue})` : ''}${debug}.`, { code: 'PAYPAL_ERROR' })
}

function logPayPal(level, message, error) {
  // Only PayPal's issue code, HTTP status and debug id: never tokens, credentials or card data.
  console[level](`[paypal] ${message}: ${error.code}${error.issue ? ` ${error.issue}` : ''}${error.status ? ` status=${error.status}` : ''}${error.debugId ? ` debug_id=${error.debugId}` : ''}`)
}

/**
 * POST /api/payments/orders
 * 1. creates the local order (amount, currency and category from the validated request + DB)
 * 2. creates the PayPal order from THAT stored order
 * 3. stores the PayPal order id; if PayPal fails, the local order is closed as 'failed'
 */
export async function createPaymentOrder(userId, { categoryId, amount, description, merchant }) {
  if (!isPayPalEnabled()) throw notConfigured()
  const cat = await query(`SELECT id, kind FROM categories WHERE id = $1 AND user_id = $2`, [categoryId, userId])
  if (cat.rowCount === 0) throw badRequest('Choose a budget category', { categoryId: 'Choose a budget category' })
  if (cat.rows[0].kind === 'savings') throw badRequest('Purchases cannot be made from Savings', { categoryId: 'Choose a spending category' })

  const charge = chargeFor(amount)
  const reference = `PKT-${randomBytes(8).toString('hex').toUpperCase()}`
  const { rows } = await query(
    `INSERT INTO payment_orders (user_id, category_id, reference, amount, currency, description, merchant, provider, charge_currency, charge_amount, fx_rate)
     VALUES ($1, $2, $3, $4, 'INR', $5, $6, 'paypal', $7, $8, $9) RETURNING ${ORDER_COLS}`,
    [userId, categoryId, reference, paiseToDecimal(amount), description, merchant || description, charge.currency, minorToValue(charge.minor), rateToString(charge.fxRatePaise)],
  )
  const local = rows[0]

  let paypalOrder
  try {
    paypalOrder = await paypal.createOrder({ reference, currency: local.charge_currency, value: minorToValue(local.charge_minor), description: local.description })
  } catch (error) {
    if (!(error instanceof PayPalError)) throw error
    logPayPal('warn', `create order failed for ${reference}`, error)
    await query(`UPDATE payment_orders SET status = 'failed', failure_reason = $2, updated_at = now() WHERE id = $1`, [local.id, `create: ${error.issue ?? error.code}`])
    throw paypalApiError(error, 'create the order')
  }
  if (!paypalOrder?.id) {
    await query(`UPDATE payment_orders SET status = 'failed', failure_reason = 'create: no order id', updated_at = now() WHERE id = $1`, [local.id])
    throw new AppError(502, 'PayPal did not return an order id', { code: 'PAYPAL_ERROR' })
  }
  const { rows: updated } = await query(
    `UPDATE payment_orders SET paypal_order_id = $2, paypal_status = $3, updated_at = now() WHERE id = $1 RETURNING ${ORDER_COLS}`,
    [local.id, paypalOrder.id, paypalOrder.status ?? null],
  )
  const paypalInfo = describePayPalOrder(paypalOrder, local)
  return { ...mapOrder(updated[0]), paypal: paypalInfo }
}

/**
 * Safe diagnostics for a newly created PayPal order: the currency/amount PayPal recorded,
 * the payee (merchant) PayPal will pay, and the currency the browser SDK is configured with.
 * Logs only ids and currency codes: never tokens, secrets or e-mail addresses.
 */
function describePayPalOrder(paypalOrder, local) {
  const unit = paypalOrder.purchase_units?.[0]
  const info = {
    orderId: paypalOrder.id,
    status: paypalOrder.status ?? null,
    currency: unit?.amount?.currency_code ?? null, // as recorded by PayPal (null if PayPal did not echo it)
    value: unit?.amount?.value ?? null,
    payeeMerchantId: unit?.payee?.merchant_id ?? null,
  }
  const requested = `${local.charge_currency} ${minorToValue(local.charge_minor)}`
  console.info(
    `[paypal] order created ref=${local.reference} paypal_order=${info.orderId} status=${info.status ?? '?'} requested=${requested}` +
      ` paypal_unit=${info.currency ? `${info.currency} ${info.value}` : 'not echoed'} payee_merchant_id=${info.payeeMerchantId ?? 'not returned'}` +
      ` sdk_currency=${env.paypal.currency} env=${env.paypal.environment}`,
  )
  if (info.currency && info.currency !== local.charge_currency) {
    console.warn(`[paypal] currency mismatch on ${local.reference}: requested ${local.charge_currency}, PayPal recorded ${info.currency}`)
  }
  if (env.paypal.currency !== local.charge_currency) {
    console.warn(`[paypal] SDK currency ${env.paypal.currency} differs from order currency ${local.charge_currency} on ${local.reference}`)
  }
  return info
}

/**
 * Checks a PayPal order (capture response or GET order) against the stored local order.
 * Returns { outcome: 'completed' | 'pending' | 'declined' | 'not_captured' | 'mismatch', captureId, paypalStatus, reason }.
 * Exported for tests.
 */
export function verifyCapture(paypalOrder, local) {
  const fail = (reason) => ({ outcome: 'mismatch', captureId: null, paypalStatus: paypalOrder?.status ?? null, reason })
  if (!paypalOrder || paypalOrder.id !== local.paypal_order_id) return fail('PayPal order id does not match this payment')
  const unit = paypalOrder.purchase_units?.[0]
  const capture = unit?.payments?.captures?.[0]
  if (!capture) return { outcome: 'not_captured', captureId: null, paypalStatus: paypalOrder.status ?? null, reason: 'No capture on this PayPal order' }
  const ref = capture.custom_id ?? unit.custom_id ?? unit.reference_id
  if (ref && ref !== local.reference) return fail('PayPal order belongs to a different payment')
  if (!capture.id) return fail('PayPal capture id missing')
  if (capture.amount?.currency_code !== local.charge_currency) return fail(`Currency mismatch: PayPal ${capture.amount?.currency_code}, expected ${local.charge_currency}`)
  if (valueToMinor(capture.amount?.value) !== local.charge_minor) return fail(`Amount mismatch: PayPal ${capture.amount?.value}, expected ${minorToValue(local.charge_minor)}`)
  const base = { captureId: capture.id, paypalStatus: capture.status }
  if (capture.status === 'COMPLETED' && paypalOrder.status === 'COMPLETED') return { ...base, outcome: 'completed', reason: null }
  if (capture.status === 'PENDING') return { ...base, outcome: 'pending', reason: capture.status_details?.reason ?? 'PENDING' }
  if (capture.status === 'DECLINED' || capture.status === 'FAILED') return { ...base, outcome: 'declined', reason: capture.status }
  return fail(`Unexpected PayPal status ${paypalOrder.status}/${capture.status}`)
}

async function recordTransaction(client, userId, order, status, captureId, cycle, note) {
  const { rows } = await client.query(
    `INSERT INTO transactions (user_id, category_id, type, amount, description, merchant, note, occurred_on, occurred_time, payment_method, status, source, payment_reference, paypal_capture_id)
     VALUES ($1, $2, 'expense', $3, $4, $5, $6, $7, $8, 'paypal', $9, 'paypal', $10, $11) RETURNING id`,
    [userId, order.category_id, paiseToDecimal(order.amount_paise), order.description.slice(0, 60), order.merchant.slice(0, 60), note.slice(0, 120), cycle.today, nowTime(), status, order.reference, captureId],
  )
  const { rows: tx } = await client.query(`SELECT ${TRANSACTION_COLUMNS} FROM transactions t WHERE t.id = $1`, [rows[0].id])
  return { id: rows[0].id, transaction: mapTransaction(tx[0]) }
}

const chargeNote = (order) =>
  order.charge_currency === 'INR'
    ? 'Paid with PayPal'
    : `Paid ${order.charge_currency} ${minorToValue(order.charge_minor)} with PayPal (test rate ₹${order.fx_rate}/${order.charge_currency})`

/**
 * POST /api/payments/orders/:ref/capture  { paypalOrderId }
 * Runs in one DB transaction holding a row lock on the local order, so concurrent or repeated
 * requests cannot capture twice or record two expenses. A transaction is recorded only after
 * PayPal's response is verified against the stored order (id, reference, currency, exact amount,
 * COMPLETED). Repeating a completed capture returns the original transaction.
 */
export async function capturePaymentOrder(userId, reference, { paypalOrderId }) {
  return withTransaction(async (client) => {
    // Scoped to the authenticated user: another user's order is simply "not found".
    const { rows } = await client.query(`SELECT ${ORDER_COLS} FROM payment_orders WHERE reference = $1 AND user_id = $2 FOR UPDATE`, [reference, userId])
    const order = rows[0]
    if (!order) throw notFound('Payment order')
    if (order.provider !== 'paypal' || !order.paypal_order_id) throw conflict('This payment was not created with PayPal', 'NOT_A_PAYPAL_ORDER')
    if (order.paypal_order_id !== paypalOrderId) throw badRequest('This PayPal approval does not belong to this payment', { paypalOrderId: 'PayPal order id mismatch' })

    if (order.status === 'completed') {
      const { rows: tx } = await client.query(`SELECT ${TRANSACTION_COLUMNS} FROM transactions t WHERE t.id = $1 AND t.user_id = $2`, [order.transaction_id, userId])
      return { status: 'COMPLETED', alreadyCaptured: true, order: mapOrder(order), transaction: tx[0] ? mapTransaction(tx[0]) : null }
    }
    if (!['created', 'pending'].includes(order.status)) throw conflict(`This payment is already ${order.status.replace('_', ' ')}`, 'ORDER_CLOSED')

    let paypalOrder
    try {
      paypalOrder = await paypal.captureOrder(order.paypal_order_id, order.reference)
    } catch (error) {
      if (!(error instanceof PayPalError)) throw error
      if (error.issue === 'ORDER_ALREADY_CAPTURED') {
        // e.g. our earlier response was lost: read the order and verify it like a fresh capture.
        try {
          paypalOrder = await paypal.getOrder(order.paypal_order_id)
        } catch (lookupError) {
          if (!(lookupError instanceof PayPalError)) throw lookupError
          logPayPal('warn', `order lookup failed for ${reference}`, lookupError)
          throw paypalApiError(lookupError, 'confirm the payment')
        }
      } else if (error.issue === 'INSTRUMENT_DECLINED') {
        logPayPal('info', `instrument declined for ${reference}`, error)
        // Recoverable: the buyer can choose another funding source; the order stays open.
        throw new AppError(422, 'PayPal declined this payment method. Please choose another one.', { code: 'INSTRUMENT_DECLINED' })
      } else if (error.issue === 'ORDER_NOT_APPROVED' || error.issue === 'PAYER_ACTION_REQUIRED') {
        throw new AppError(409, 'This PayPal payment has not been approved yet.', { code: 'ORDER_NOT_APPROVED' })
      } else {
        logPayPal('warn', `capture failed for ${reference}`, error)
        throw paypalApiError(error, 'capture the payment') // order stays open; retry is safe (same PayPal-Request-Id)
      }
    }

    const result = verifyCapture(paypalOrder, order)
    const { cycle } = await getCurrentCycle(client, userId)

    if (result.outcome === 'completed') {
      const { rows: catRows } = await client.query(
        `SELECT id, name, (allocated * 100)::bigint AS allocated_paise FROM categories WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [order.category_id, userId],
      )
      const spentBefore = await categorySpent(client, userId, order.category_id, cycle)
      const { id: txId, transaction } = await recordTransaction(client, userId, order, 'success', result.captureId, cycle, chargeNote(order))
      const { rows: done } = await client.query(
        `UPDATE payment_orders SET status = 'completed', paypal_capture_id = $2, paypal_status = $3, transaction_id = $4, captured_at = now(), failure_reason = NULL, updated_at = now()
          WHERE id = $1 RETURNING ${ORDER_COLS}`,
        [order.id, result.captureId, paypalOrder.status, txId],
      )
      if (catRows[0]) await notifyIfThresholdCrossed(client, userId, catRows[0], spentBefore, spentBefore + order.amount_paise, cycle)
      return { status: 'COMPLETED', order: mapOrder(done[0]), transaction }
    }

    if (result.outcome === 'pending') {
      const { rows: pending } = await client.query(
        `UPDATE payment_orders SET status = 'pending', paypal_capture_id = $2, paypal_status = $3, failure_reason = $4, updated_at = now() WHERE id = $1 RETURNING ${ORDER_COLS}`,
        [order.id, result.captureId, 'PENDING', result.reason],
      )
      return { status: 'PENDING', order: mapOrder(pending[0]), message: 'PayPal is still processing this payment. Nothing has been deducted yet.' }
    }

    if (result.outcome === 'declined') {
      // Shown in the Passbook as failed; failed transactions are never counted in budgets.
      const { id: txId, transaction } = await recordTransaction(client, userId, order, 'failed', null, cycle, `PayPal capture ${result.reason.toLowerCase()}`)
      const { rows: failed } = await client.query(
        `UPDATE payment_orders SET status = 'failed', paypal_status = $2, failure_reason = $3, transaction_id = $4, updated_at = now() WHERE id = $1 RETURNING ${ORDER_COLS}`,
        [order.id, result.paypalStatus, `capture: ${result.reason}`, txId],
      )
      return { status: 'FAILED', order: mapOrder(failed[0]), transaction }
    }

    if (result.outcome === 'not_captured') {
      throw new AppError(409, 'PayPal has not captured this payment yet.', { code: 'ORDER_NOT_APPROVED' })
    }

    // mismatch: PayPal reported something we cannot verify. Never deducted; flagged for review.
    console.error(`[paypal] capture verification failed for ${reference}: ${result.reason}`)
    const { rows: review } = await client.query(
      `UPDATE payment_orders SET status = 'needs_review', paypal_status = $2, paypal_capture_id = COALESCE(paypal_capture_id, $3), failure_reason = $4, updated_at = now()
        WHERE id = $1 RETURNING ${ORDER_COLS}`,
      // Keep PayPal's capture id for the audit trail, but only if the PayPal order itself is ours.
      [order.id, paypalOrder?.status ?? null, paypalOrder?.id === order.paypal_order_id ? (paypalOrder.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null) : null, `verify: ${result.reason}`],
    )
    return { status: 'NEEDS_REVIEW', order: mapOrder(review[0]), message: 'We could not verify this PayPal payment, so nothing was deducted. Please contact support with the reference.' }
  })
}

/** The buyer cancelled at PayPal or backed out: nothing is recorded or deducted. */
export async function cancelPaymentOrder(userId, reference) {
  const { rows } = await query(
    `UPDATE payment_orders SET status = 'cancelled', updated_at = now() WHERE reference = $1 AND user_id = $2 AND status = 'created' RETURNING ${ORDER_COLS}`,
    [reference, userId],
  )
  if (rows.length === 0) throw notFound('Open payment order')
  return mapOrder(rows[0])
}
