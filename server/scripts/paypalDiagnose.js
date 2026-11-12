/*
 * PayPal Sandbox diagnostics. Usage: npm run paypal:diagnose
 *
 * Creates ONE unapproved Sandbox order using the configured currency (exactly as checkout does)
 * and prints:
 *   - the PayPal order id, status and the currency/amount PayPal recorded
 *   - the payee (merchant) account PayPal will pay: merchant id (+ masked e-mail)
 *   - the currency the browser SDK is loaded with
 *   - PayPal's own approval link, to test approval WITHOUT Pockit's frontend
 * Never prints the client secret, access tokens or buyer credentials. Refuses to run against live PayPal.
 * An unapproved order moves no money and simply expires.
 */
import { randomBytes } from 'node:crypto'
import { env } from '../src/config/env.js'
import { createOrder, getOrder } from '../src/lib/paypalClient.js'
import { chargeFor, rateToString } from '../src/lib/paypalCurrency.js'

const mask = (s, keep = 6) => (s ? `…${s.slice(-keep)}` : '(not set)')
const maskEmail = (e) => (e ? e.replace(/^(.{3}).*(@.*)$/, '$1***$2') : '(not returned)')

console.log('— Configuration (server/.env)')
console.log(`  environment      ${env.paypal.environment} (${new URL(env.paypal.baseUrl).host})`)
console.log(`  client id        ${mask(env.paypal.clientId)}   secret: ${env.paypal.clientSecret ? 'set (hidden)' : 'NOT SET'}`)
console.log(`  charge currency  ${env.paypal.currency}${env.paypal.currency === 'USD' ? `  at ₹${rateToString(env.paypal.inrPerUsdPaise)} per USD` : ''}`)
const sdkUrl = `https://www.paypal.com/sdk/js?client-id=${mask(env.paypal.clientId)}&currency=${env.paypal.currency}&intent=capture&components=buttons`
console.log(`  browser SDK URL  ${sdkUrl}`)

if (!env.paypal.enabled) {
  console.error('\nPayPal is not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).')
  process.exit(1)
}
if (env.paypal.environment === 'live') {
  console.error('\nRefusing to create a diagnostic order against LIVE PayPal. Point PAYPAL_BASE_URL at the sandbox.')
  process.exit(1)
}

try {
  const charge = chargeFor(10000) // ₹100 test amount, converted exactly like checkout
  const reference = `DIAG-${randomBytes(6).toString('hex').toUpperCase()}`
  const created = await createOrder({ reference, currency: charge.currency, value: charge.value, description: 'Pockit PayPal diagnostic (not a real purchase)' })
  const details = await getOrder(created.id).catch(() => created)
  const unit = details.purchase_units?.[0] ?? created.purchase_units?.[0]
  const payee = unit?.payee ?? {}
  const approve = (created.links ?? details.links ?? []).find((l) => l.rel === 'payer-action' || l.rel === 'approve')

  console.log('\n— Order created at PayPal')
  console.log(`  order id         ${created.id}`)
  console.log(`  status           ${details.status ?? created.status}`)
  console.log(`  requested        ${charge.currency} ${charge.value}`)
  console.log(`  PayPal recorded  ${unit?.amount ? `${unit.amount.currency_code} ${unit.amount.value}` : '(not returned)'}`)
  console.log(`  payee merchant   ${payee.merchant_id ?? '(not returned)'}   e-mail ${maskEmail(payee.email_address)}`)

  const sameCurrency = unit?.amount?.currency_code === env.paypal.currency
  console.log('\n— Checks')
  console.log(`  ${sameCurrency ? '✓' : '✗'} order currency (${unit?.amount?.currency_code ?? '?'}) matches the browser SDK currency (${env.paypal.currency})`)
  console.log(`  ${unit?.amount?.currency_code === charge.currency ? '✓' : '✗'} PayPal recorded the currency the server requested (${charge.currency})`)

  console.log('\n— Next step: approve WITHOUT Pockit\'s frontend')
  console.log(`  1. Open: ${approve?.href ?? '(no approval link returned)'}`)
  console.log('  2. Log in with your Sandbox PERSONAL (buyer) account and approve.')
  console.log('  If PayPal shows genericError / UNSUPPORTED_PAYEE_CURRENCY here too, the payee merchant account above')
  console.log(`  cannot receive ${charge.currency}. Check its country in developer.paypal.com → Testing Tools → Sandbox Accounts.`)
  console.log('  (Approving only authorises the order; nothing is captured, and the order expires.)')
} catch (error) {
  console.error(`\nPayPal request failed: ${error.message}${error.debugId ? ` (debug_id ${error.debugId})` : ''}`)
  process.exitCode = 1
}
