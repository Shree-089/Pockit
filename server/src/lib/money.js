/*
 * MONEY CONVERSION
 * Database: NUMERIC(12,2) rupees, read by pg as strings like "2400.50".
 * API:      integer paise (240050), matching the frontend.
 * Conversions use string/integer operations only, never floating point.
 */

export const MAX_AMOUNT_PAISE = 100_000 * 100 // ₹1,00,000 per transaction

/** "2400.50" | "-12.5" | "7" -> integer paise. Throws on anything else. */
export function decimalToPaise(value) {
  if (value === null || value === undefined) return 0
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(String(value).trim())
  if (!match) throw new Error(`Invalid decimal amount: ${value}`)
  const paise = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'))
  return match[1] ? -paise : paise
}

/** 240050 -> "2400.50" (safe to pass to PostgreSQL as a NUMERIC parameter). */
export function paiseToDecimal(paise) {
  if (!Number.isSafeInteger(paise)) throw new Error(`Paise must be an integer: ${paise}`)
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(paise)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Accepts what clients send for an amount and returns paise, or null if invalid:
 *  - an integer number is treated as PAISE (the API contract)
 *  - a string is treated as RUPEES typed by a person ("2,400", "₹99.5")
 */
export function parseAmountInput(input) {
  if (typeof input === 'number') return Number.isSafeInteger(input) ? input : null
  if (typeof input !== 'string') return null
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(input.replace(/[₹,\s]/g, ''))
  if (!match) return null
  const paise = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(paise) ? paise : null
}

/** Display helper for messages: 240050 -> "₹2,400.50", 240000 -> "₹2,400". */
export function formatINR(paise) {
  const digits = paise % 100 === 0 ? 0 : 2
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(paise / 100)
}

/** Percentage for display (not money). */
export function percentOf(part, whole, decimals = 1) {
  if (!whole) return 0
  const factor = 10 ** decimals
  return Math.round((part / whole) * 100 * factor) / factor
}

/** Splits a total across weights so parts always sum exactly to the total (₹50 steps). */
export function allocateByWeights(totalPaise, weights, stepPaise = 5000) {
  if (weights.length === 0) return []
  const safe = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0))
  const weightSum = safe.reduce((a, b) => a + b, 0)
  const w = weightSum > 0 ? safe : safe.map(() => 1)
  const sum = weightSum > 0 ? weightSum : w.length
  const units = Math.floor(totalPaise / stepPaise)
  const leftover = totalPaise - units * stepPaise
  const raw = w.map((x) => (units * x) / sum)
  const parts = raw.map(Math.floor)
  let remaining = units - parts.reduce((a, b) => a + b, 0)
  const order = raw.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f)
  for (let k = 0; remaining > 0; k = (k + 1) % order.length, remaining -= 1) parts[order[k].i] += 1
  const result = parts.map((p) => p * stepPaise)
  result[result.indexOf(Math.max(...result))] += leftover
  return result
}
