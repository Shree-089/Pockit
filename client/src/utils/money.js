/*
 * MONEY UTILITIES
 * Every amount in Pockit is stored as an INTEGER number of paise.
 *   ₹1 = 100 paise, so ₹2,400 is stored as 240000.
 * Integers add and subtract exactly; decimal rupees (0.1 + 0.2) do not.
 * Convert to rupees only at the edges: when formatting for display or feeding a chart.
 */

export const PAISE_PER_RUPEE = 100
export const MAX_TRANSACTION_PAISE = 100_000 * PAISE_PER_RUPEE // ₹1,00,000

/** Author-friendly helper for whole/decimal rupee literals: rupees(2400) -> 240000 */
export function rupees(amount) {
  if (!Number.isFinite(amount)) throw new TypeError(`Invalid rupee amount: ${amount}`)
  return Math.round(amount * PAISE_PER_RUPEE)
}

/** Alias used in code that converts a numeric rupee value to paise. */
export const toPaise = rupees

/** Paise -> rupees as a number. Use only for display/charts, never for further maths. */
export function fromPaise(paise) {
  return paise / PAISE_PER_RUPEE
}

export function isValidPaise(value) {
  return Number.isSafeInteger(value)
}

/**
 * Parses text typed by the user ("2,400", "₹ 99.5", "120") into paise.
 * Parsing the string directly avoids floating-point rounding entirely.
 * Returns null when the text is not a valid amount with at most 2 decimals.
 */
export function parseRupeeInput(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? rupees(input) : null
  if (typeof input !== 'string') return null

  const cleaned = input.replace(/[₹,\s]/g, '')
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned)
  if (!match) return null

  const whole = Number(match[1])
  const fraction = Number((match[2] ?? '').padEnd(2, '0'))
  const paise = whole * PAISE_PER_RUPEE + fraction
  return Number.isSafeInteger(paise) ? paise : null
}

/** Exact integer sum of paise values. */
export function sumPaise(values) {
  let total = 0
  for (const value of values) total += value
  return total
}

/** Percentage (a display number, not money). percentOf(240000, 300000) -> 80 */
export function percentOf(part, whole, decimals = 1) {
  if (!whole) return 0
  const factor = 10 ** decimals
  return Math.round((part / whole) * 100 * factor) / factor
}

/** Rounds paise down to a multiple of `step` paise (e.g. 5000 = ₹50). */
export function floorToStep(paise, step) {
  return Math.floor(paise / step) * step
}

/**
 * Splits `totalPaise` across weights so the parts ALWAYS sum exactly to the total.
 * Uses the largest-remainder method in units of `stepPaise` (default ₹50),
 * then gives any leftover paise (when total isn't a multiple of the step) to the largest part.
 */
export function allocateByWeights(totalPaise, weights, stepPaise = 5000) {
  if (weights.length === 0) return []
  const safeWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0))
  const weightSum = safeWeights.reduce((a, b) => a + b, 0)
  const normalized = weightSum > 0 ? safeWeights : safeWeights.map(() => 1)
  const sum = weightSum > 0 ? weightSum : normalized.length

  const units = Math.floor(totalPaise / stepPaise)
  const leftoverPaise = totalPaise - units * stepPaise

  const raw = normalized.map((w) => (units * w) / sum)
  const parts = raw.map(Math.floor)
  let unitsLeft = units - parts.reduce((a, b) => a + b, 0)

  const byFraction = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction)

  for (let i = 0; unitsLeft > 0; i = (i + 1) % byFraction.length, unitsLeft -= 1) {
    parts[byFraction[i].index] += 1
  }

  const result = parts.map((p) => p * stepPaise)
  const largest = result.indexOf(Math.max(...result))
  result[largest] += leftoverPaise
  return result
}

const formatterCache = new Map()

function getFormatter(fractionDigits, signDisplay) {
  const key = `${fractionDigits}|${signDisplay}`
  if (!formatterCache.has(key)) {
    formatterCache.set(
      key,
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
        signDisplay,
      }),
    )
  }
  return formatterCache.get(key)
}

/**
 * Formats paise as Indian Rupees with Indian digit grouping.
 *   formatINR(240000)               -> "₹2,400"
 *   formatINR(4285)                 -> "₹42.85"
 *   formatINR(-12000, { sign: true }) -> "-₹120"
 * options.decimals: 'auto' (default: hide .00), true (always 2), false (never)
 * options.sign: true shows "+" for positive values too.
 */
export function formatINR(paise, { decimals = 'auto', sign = false } = {}) {
  const value = Number.isFinite(paise) ? paise : 0
  const digits = decimals === true ? 2 : decimals === false ? 0 : value % 100 === 0 ? 0 : 2
  const signDisplay = sign ? 'exceptZero' : 'auto'
  return getFormatter(digits, signDisplay).format(fromPaise(value))
}

/** Short form for tight spaces and chart axes: "₹4.8K", "₹1.2L". */
export function formatINRCompact(paise) {
  const key = 'compact'
  if (!formatterCache.has(key)) {
    formatterCache.set(
      key,
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
    )
  }
  return formatterCache.get(key).format(fromPaise(paise))
}
