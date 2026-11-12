import { formatINR } from './money.js'

/*
 * GROUNDING CHECKS FOR MODEL TEXT
 * The model may phrase advice, but every rupee figure it mentions must be one we gave it.
 * Any sentence containing an unknown ₹ amount is rejected, so the assistant can never
 * invent a balance, a transaction or a limit.
 */

const RUPEE_PATTERN = /(?:₹|rs\.?\s?|inr\s?)\s*([\d,]+(?:\.\d{1,2})?)/gi

/** Every ₹ amount in `text`, as integer paise. */
export function extractRupeeAmounts(text) {
  const amounts = []
  for (const match of String(text).matchAll(RUPEE_PATTERN)) {
    const [whole, fraction = ''] = match[1].replace(/,/g, '').split('.')
    if (!whole) continue
    amounts.push(Number(whole) * 100 + Number(fraction.padEnd(2, '0')))
  }
  return amounts
}

/**
 * Builds the set of amounts the model may mention: each fact value plus whole-rupee
 * rounding (models often write ₹42 for ₹42.85).
 */
export function allowedAmountSet(paiseValues) {
  const set = new Set()
  for (const v of paiseValues) {
    if (!Number.isSafeInteger(v)) continue
    const abs = Math.abs(v)
    set.add(abs)
    set.add(Math.floor(abs / 100) * 100)
    set.add(Math.round(abs / 100) * 100)
  }
  return set
}

/** True when every ₹ figure in text is in the allowed set. */
export function isGrounded(text, allowed) {
  return extractRupeeAmounts(text).every((p) => allowed.has(p))
}

/** Collects every integer paise value found anywhere in a facts object. */
export function collectPaise(facts, out = []) {
  if (Array.isArray(facts)) facts.forEach((f) => collectPaise(f, out))
  else if (facts && typeof facts === 'object') {
    for (const [key, value] of Object.entries(facts)) {
      if (typeof value === 'number' && /paise$/i.test(key)) out.push(value)
      else if (typeof value === 'object') collectPaise(value, out)
    }
  }
  return out
}

/** Facts handed to the model use both paise (for checks) and display strings (for wording). */
export const money = (paise) => ({ paise, display: formatINR(paise) })
