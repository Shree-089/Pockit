import { env } from '../config/env.js'

/*
 * PAYPAL ORDERS v2 CLIENT (server-side only)
 * - OAuth 2.0 client credentials; the access token is cached until shortly before expiry.
 * - Every write sends PayPal-Request-Id, so retrying the same request never creates a
 *   second order or a second capture.
 * - Errors become PayPalError { status, issue, debugId } and NEVER contain the client
 *   secret, the Basic credentials or the access token.
 * Docs: https://developer.paypal.com/docs/api/orders/v2/
 */

export class PayPalError extends Error {
  constructor(message, { status = 0, issue = null, debugId = null, code = 'PAYPAL_ERROR' } = {}) {
    super(message)
    this.name = 'PayPalError'
    this.status = status // HTTP status from PayPal (0 = network/timeout)
    this.issue = issue // e.g. INSTRUMENT_DECLINED, ORDER_ALREADY_CAPTURED, CURRENCY_NOT_SUPPORTED
    this.debugId = debugId // PayPal's debug_id, safe to log and useful for PayPal support
    this.code = code // PAYPAL_ERROR | PAYPAL_TIMEOUT | PAYPAL_NETWORK | PAYPAL_AUTH
  }
}

export const isPayPalEnabled = () => env.paypal.enabled

const tokenCache = { token: null, expiresAt: 0 }
const EXPIRY_MARGIN_MS = 60_000 // refresh a minute before PayPal's expiry

/** For tests: forget the cached token. */
export function clearPayPalTokenCache() {
  tokenCache.token = null
  tokenCache.expiresAt = 0
}

async function timedFetch(url, init) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.paypal.timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (error.name === 'AbortError') throw new PayPalError('PayPal did not respond in time', { code: 'PAYPAL_TIMEOUT' })
    throw new PayPalError(`Could not reach PayPal (${error.cause?.code ?? error.message})`, { code: 'PAYPAL_NETWORK' })
  } finally {
    clearTimeout(timer)
  }
}

async function getAccessToken() {
  if (!isPayPalEnabled()) throw new PayPalError('PayPal is not configured on the server', { code: 'PAYPAL_NOT_CONFIGURED' })
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token

  const basic = Buffer.from(`${env.paypal.clientId}:${env.paypal.clientSecret}`).toString('base64')
  const res = await timedFetch(`${env.paypal.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.access_token) {
    // data.error_description is PayPal's text (e.g. "Client Authentication failed"); it never echoes the secret.
    throw new PayPalError(`PayPal authentication failed: ${data?.error_description ?? `HTTP ${res.status}`}`, { status: res.status, code: 'PAYPAL_AUTH' })
  }
  tokenCache.token = data.access_token
  tokenCache.expiresAt = Date.now() + Math.max(0, Number(data.expires_in ?? 0) * 1000 - EXPIRY_MARGIN_MS)
  return tokenCache.token
}

function toPayPalError(res, data) {
  const detail = data?.details?.[0]
  const issue = detail?.issue ?? data?.name ?? null
  const text = detail?.description ?? data?.message ?? data?.error_description ?? `HTTP ${res.status}`
  return new PayPalError(`PayPal error${issue ? ` ${issue}` : ''}: ${text}`, { status: res.status, issue, debugId: data?.debug_id ?? null })
}

/** Calls the Orders API; on 401 refreshes the token once and retries. */
async function request(method, path, { body, requestId } = {}, retried = false) {
  const token = await getAccessToken()
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', Prefer: 'return=representation' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (requestId) headers['PayPal-Request-Id'] = requestId
  const res = await timedFetch(`${env.paypal.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => null)
  if (res.status === 401 && !retried) {
    clearPayPalTokenCache()
    return request(method, path, { body, requestId }, true)
  }
  if (!res.ok) throw toPayPalError(res, data)
  return data
}

/**
 * POST /v2/checkout/orders with intent CAPTURE.
 * The amount comes from the stored local order; `reference` ties the PayPal order to it
 * (custom_id / invoice_id / reference_id all carry the local reference).
 */
export function createOrder({ reference, currency, value, description }) {
  return request('POST', '/v2/checkout/orders', {
    requestId: `pockit-create-${reference}`,
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: reference,
          custom_id: reference,
          invoice_id: reference,
          description: description.slice(0, 127),
          amount: { currency_code: currency, value },
        },
      ],
      payment_source: {
        paypal: { experience_context: { brand_name: 'Pockit', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' } },
      },
    },
  })
}

/** POST /v2/checkout/orders/{id}/capture: idempotent per local order via PayPal-Request-Id. */
export function captureOrder(paypalOrderId, reference) {
  return request('POST', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, { requestId: `pockit-capture-${reference}`, body: {} })
}

/** GET /v2/checkout/orders/{id}: used to recover after a lost capture response. */
export function getOrder(paypalOrderId) {
  return request('GET', `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`)
}
