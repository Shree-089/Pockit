import { env } from '../config/env.js'

/*
 * PAYPAL CHARGE-CURRENCY STRATEGY (isolated on purpose)
 *
 * Pockit's accounting currency is ALWAYS INR: budgets and transactions record the rupee
 * amount the student entered.
 *
 * PayPal only processes INR when BOTH the merchant and the buyer accounts are registered in
 * India, and PayPal stopped domestic India payments in April 2021. So two strategies exist:
 *
 *   PAYPAL_CURRENCY=INR (default): PayPal is asked to charge exactly the rupee amount.
 *   PAYPAL_CURRENCY=USD + PAYPAL_INR_PER_USD: PayPal charges a USD amount computed from a
 *     FIXED, configured test rate. The rate and the USD amount are stored on the order, shown
 *     to the student before paying, and verified on capture. A USD payment is never recorded
 *     as an INR payment: the budget is charged the original INR amount, and the order keeps
 *     both figures.
 *
 * All arithmetic is in integers (paise, cents); no floating point touches money.
 */

/**
 * Amount PayPal should charge for `amountPaise`.
 * Returns { currency, minor, value, fxRatePaise } where minor is paise or cents and
 * value is PayPal's decimal string ("300.00").
 */
export function chargeFor(amountPaise, config = env.paypal) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new Error('amountPaise must be a positive integer')
  if (config.currency === 'INR') return { currency: 'INR', minor: amountPaise, value: minorToValue(amountPaise), fxRatePaise: null }
  if (config.currency === 'USD') {
    const rate = config.inrPerUsdPaise // paise per 1 USD = paise per 100 cents
    if (!Number.isSafeInteger(rate) || rate <= 0) throw new Error('A positive INR-per-USD rate is required for USD charges')
    // cents = amountPaise * 100 / rate, rounded half up, in integers.
    const cents = Math.max(1, Math.floor((amountPaise * 200 + rate) / (2 * rate)))
    return { currency: 'USD', minor: cents, value: minorToValue(cents), fxRatePaise: rate }
  }
  throw new Error(`Unsupported PayPal currency ${config.currency}`)
}

/** 30050 -> "300.50" (both INR and USD use two decimals at PayPal). */
export function minorToValue(minor) {
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`
}

/** "300.5" / "300.50" / "300" -> 30050 / 30050 / 30000; anything else -> null. No floats. */
export function valueToMinor(value) {
  if (typeof value !== 'string' || !/^\d{1,9}(\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

/** 8850 -> "88.50" for display and storage in NUMERIC. */
export const rateToString = (ratePaise) => (ratePaise == null ? null : minorToValue(ratePaise))
