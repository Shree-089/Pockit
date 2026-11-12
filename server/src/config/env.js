import 'dotenv/config'

/*
 * Reads and validates environment variables once at startup.
 * The server refuses to start with missing or unsafe configuration.
 */

function required(name) {
  const value = process.env[name]
  if (!value || !value.trim()) throw new Error(`Missing required environment variable: ${name}`)
  return value.trim()
}

const jwtSecret = required('JWT_SECRET')
if (jwtSecret.length < 32 || jwtSecret.startsWith('replace-with')) {
  throw new Error('JWT_SECRET must be a random string of at least 32 characters (see .env.example)')
}

const appToday = (process.env.APP_TODAY ?? '').trim()
if (appToday && !/^\d{4}-\d{2}-\d{2}$/.test(appToday)) {
  throw new Error('APP_TODAY must be empty or a date in YYYY-MM-DD format')
}

const nebiusApiKey = (process.env.NEBIUS_API_KEY ?? '').trim()
const nebiusModel = (process.env.NEBIUS_MODEL ?? '').trim()
if (nebiusApiKey && !nebiusModel) {
  throw new Error('NEBIUS_MODEL is required when NEBIUS_API_KEY is set (run `npm run ai:models` to list models)')
}

/** "88.5" -> 8850, parsed as integers (no floating point). */
function decimalStringToMinor(value) {
  const [whole, fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

// PayPal (Orders v2). The secret never leaves the server; the client ID is public by design.
const paypalClientId = (process.env.PAYPAL_CLIENT_ID ?? '').trim()
const paypalClientSecret = (process.env.PAYPAL_CLIENT_SECRET ?? '').trim()
if (Boolean(paypalClientId) !== Boolean(paypalClientSecret)) {
  throw new Error('Set both PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, or neither')
}
const paypalCurrency = (process.env.PAYPAL_CURRENCY ?? 'INR').trim().toUpperCase()
if (!['INR', 'USD'].includes(paypalCurrency)) throw new Error('PAYPAL_CURRENCY must be INR or USD')
const inrPerUsd = (process.env.PAYPAL_INR_PER_USD ?? '').trim()
if (paypalCurrency === 'USD' && !/^\d{1,4}(\.\d{1,2})?$/.test(inrPerUsd)) {
  throw new Error('PAYPAL_CURRENCY=USD needs PAYPAL_INR_PER_USD, the fixed test rate in rupees per US dollar (e.g. 88.00)')
}
const paypalBaseUrl = (process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com').trim().replace(/\/+$/, '')

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  timezone: process.env.APP_TIMEZONE ?? 'Asia/Kolkata',
  appToday: appToday || null,
  demoEmail: process.env.DEMO_EMAIL ?? 'demo@pockit.app',
  demoPassword: process.env.DEMO_PASSWORD ?? 'Pockit@123',
  allowDemoReset: process.env.ALLOW_DEMO_RESET === 'true',

  paypal: {
    clientId: paypalClientId || null,
    clientSecret: paypalClientSecret || null,
    baseUrl: paypalBaseUrl,
    environment: /sandbox/i.test(paypalBaseUrl) ? 'sandbox' : /api-m\.paypal\.com/i.test(paypalBaseUrl) ? 'live' : 'custom',
    currency: paypalCurrency,
    // INR paise per 1 USD (integer), only used when PAYPAL_CURRENCY=USD.
    inrPerUsdPaise: paypalCurrency === 'USD' ? decimalStringToMinor(inrPerUsd) : null,
    timeoutMs: Number(process.env.PAYPAL_TIMEOUT_MS ?? 15_000),
    enabled: Boolean(paypalClientId && paypalClientSecret),
  },

  // Nebius Token Factory (OpenAI-compatible). The key never leaves the server.
  nebius: {
    apiKey: nebiusApiKey || null,
    baseUrl: (process.env.NEBIUS_BASE_URL ?? 'https://api.tokenfactory.nebius.com/v1').trim().replace(/\/+$/, ''),
    model: nebiusModel || null,
    timeoutMs: Number(process.env.NEBIUS_TIMEOUT_MS ?? 20_000),
    enabled: Boolean(nebiusApiKey) && process.env.AI_ENABLED !== 'false',
  },
}
