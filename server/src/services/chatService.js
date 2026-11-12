import { pool, query } from '../db/pool.js'
import { env } from '../config/env.js'
import { assessPurchase } from '../lib/budget.js'
import { formatDateLabel } from '../lib/dates.js'
import { allowedAmountSet, extractRupeeAmounts, isGrounded } from '../lib/grounding.js'
import { formatINR, parseAmountInput } from '../lib/money.js'
import { AiUnavailableError, aiModel, chatJson } from '../lib/nebiusClient.js'
import { chatOutput } from '../validation/aiSchemas.js'
import { RULES, SYSTEM_BASE, fallbackMeta } from './aiService.js'
import { getSummary } from './financeService.js'
import { getSpendingIntelligence } from './intelligenceService.js'

/*
 * POCKIT COPILOT (POST /api/ai/chat)
 * 1. Load the signed-in user's real data from PostgreSQL (user id comes from the JWT only).
 * 2. Work out the answer deterministically: amount asked, funds considered, the SAFE WEEKLY
 *    LIMIT and the REMAINING MONTHLY BUDGET (kept separate), verdict, and every derived figure.
 * 3. Give the model those figures as ready-made ₹ strings, grouped by period, and ask it to phrase.
 * 4. Clean up spacing, then validate: schema, verdict agreement, every ₹ figure must be one we
 *    supplied, and weekly figures must not be described as monthly (or vice versa).
 *    Failing sentences are dropped; if the verdict sentence or everything is dropped,
 *    the deterministic answer is returned instead (source: 'rules').
 */

const DEBUG = process.env.AI_DEBUG === 'true'
const floorRupee = (p) => Math.floor(p / 100) * 100

/* ---------------- Text formatting ---------------- */

/**
 * Restores missing spaces in model text without touching any digit:
 *   "Yes,but" -> "Yes, but"   "tight.₹2,000" -> "tight. ₹2,000"   "₹1,000left" -> "₹1,000 left"
 *   "of₹1,200" -> "of ₹1,200" "75%used" -> "75% used"            "word ." -> "word."
 * Amounts like ₹1,499.89 and times like 10:30 are left as they are.
 */
// Words used to repair two words the model glued together ("fitswithin" -> "fits within").
// A token is only split when it is NOT a word itself and splits into exactly two listed words.
const VOCAB = new Set(
  `a about above after afford affordable afterwards again ahead all also am amount amounts an and any are as at away be because been before below
  between both budget budgets but by can cannot categories category comfortable comfortably cost costs could day days do does each enough even
  every exceed exceeds extra fit fits fitting food for from fund funds go goal goals has have here how if in into is it its just keep later leave
  leaves leaving left less limit limits money month monthly more most much need needs next no not now of off on only or other our out over pace
  per plan project projects remain remaining remains rest room safe safely save saving savings so some spend spending spent still than that the
  their them then there these this those through to today too total under until up us very want was we week weekly well were what when where
  which while will with within without would you your`.split(/\s+/),
)
// Real words that happen to be two listed words joined.
const COMPOUNDS = new Set(['somewhat', 'overall', 'everyday', 'weekday', 'weekdays', 'throughout', 'someday', 'overspend', 'overspending', 'overspent', 'underspend', 'underspent', 'whereas', 'thereafter', 'hereafter', 'nobody', 'withdraw', 'outspend', 'uptake', 'onwards', 'atop',
  'nowhere', 'somewhere', 'anywhere', 'everywhere', 'elsewhere', 'thereby', 'whereby', 'hereby', 'moreover', 'anymore', 'therein', 'wherein', 'herein',
  'thereof', 'whereof', 'hereof', 'thereto', 'whereto', 'hereto', 'thereon', 'whereon', 'whatnot', 'upkeep', 'inasmuch', 'thereupon', 'whereupon'])

function splitGlued(word) {
  if (word.length < 6 || VOCAB.has(word) || COMPOUNDS.has(word)) return word
  for (let i = 2; i <= word.length - 2; i += 1) {
    const left = word.slice(0, i)
    const right = word.slice(i)
    if (VOCAB.has(left) && VOCAB.has(right) && left.length + right.length >= 6) return `${left} ${right}`
  }
  return word
}

export function normalizeText(input) {
  return String(input ?? '')
    .replace(/\u200B/g, ' ') // zero-width SPACE separates words: keep the break
    .replace(/[\u200C\u200D\u2060\uFEFF\u00AD]/g, '')
    .replace(/[\u00A0\u2007\u2009\u202F]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/([A-Za-z0-9%)])([.!?])(?=[A-Z₹"])/g, '$1$2 ')
    .replace(/([,;:])(?=[A-Za-z₹])/g, '$1 ')
    .replace(/([A-Za-z0-9)])₹/g, '$1 ₹')
    .replace(/(₹\s?\d[\d,]*(?:\.\d{1,2})?)(?=[A-Za-z])/g, '$1 ')
    .replace(/(\d)%(?=[A-Za-z])/g, '$1% ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\b[a-z]{6,}\b/g, splitGlued)
    .replace(/ {2,}/g, ' ')
    .trim()
}

/* ---------------- Question analysis (deterministic) ---------------- */

const escapeRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whole-word match (plural allowed), so "spend" doesn't match "pen". */
function mentionsWord(lower, word) {
  return new RegExp(`\\b${escapeRe(word)}(s|es)?\\b`, 'i').test(lower)
}

function mentionedCategories(text, categories) {
  const lower = text.toLowerCase()
  return categories.filter((c) => {
    const rule = RULES.find((r) => r.name.toLowerCase() === c.name.toLowerCase())
    const words = [c.name.toLowerCase(), ...c.name.toLowerCase().split(/[\s&]+/).filter((w) => w.length > 3), ...(rule?.keywords ?? [])]
    return words.some((w) => mentionsWord(lower, w))
  })
}

/**
 * Two separate limits, never mixed:
 *   weeklyLimit       = sum of each considered category's safe-this-week figure (pace-based), floored to ₹1
 *   monthlyRemaining  = what is actually left in those categories until the month ends
 * Verdict for a week question: ≤ weekly limit → fits_comfortably; ≤ monthly remaining → fits_but_tight;
 * otherwise does_not_fit. A month question compares only with the monthly remaining.
 */
export function analyseQuestion(message, intel, summary) {
  const amountMatch = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]{3,}(?:\.\d{1,2})?)/i.exec(message)
  const amount = amountMatch ? parseAmountInput((amountMatch[1] ?? amountMatch[2]).replace(/,/g, '')) : null
  const lower = message.toLowerCase()
  const protect = /without (affecting|touching|hurting|using)|not (from|touch)|keep .* (safe|intact)|except/.test(lower)
  const mentioned = mentionedCategories(message, intel.categories)
  const window = /this week|next \d+ days|weekend/.test(lower) ? 'week' : /today|tonight/.test(lower) ? 'today' : 'month'
  if (!amount || amount <= 0) return { amountPaise: null, window, mentioned: mentioned.map((c) => c.name), protect, verdict: null }

  const scope = protect ? intel.categories.filter((c) => !mentioned.some((m) => m.id === c.id)) : mentioned.length ? mentioned : intel.categories
  const monthlyRemaining = scope.reduce((a, c) => a + Math.max(0, c.remainingPaise), 0)
  // Whole budget: use the same overview figures the Insights screen shows; a subset: sum its categories.
  const allCategories = scope.length === intel.categories.length
  const weeklyLimit = Math.min(monthlyRemaining, floorRupee(allCategories ? intel.overview.safeThisWeekPaise : scope.reduce((a, c) => a + c.safeThisWeekPaise, 0)))
  const todayLimit = Math.min(monthlyRemaining, floorRupee(allCategories ? intel.overview.safeDailyLimitPaise : scope.reduce((a, c) => a + c.safeDailyLimitPaise, 0)))
  const limit = window === 'week' ? weeklyLimit : window === 'today' ? todayLimit : monthlyRemaining
  const verdict = amount <= limit ? 'fits_comfortably' : amount <= monthlyRemaining ? 'fits_but_tight' : 'does_not_fit'
  const monthlyLeftAfter = monthlyRemaining - amount
  const daysAfterToday = intel.progress.daysRemaining

  let categoryImpact = null
  if (!protect && mentioned.length === 1) {
    const stats = summary.categories.find((c) => c.id === mentioned[0].id)
    const a = assessPurchase({ stats, amount, progress: summary.progress, cycle: summary.cycle })
    categoryImpact = { category: stats.name, remainingAfterPaise: a.remainingAfter, percentUsedAfter: a.consumedAfter, safeDailyAfterPaise: a.dailyLimitAfter }
  }
  return {
    amountPaise: amount,
    window,
    mentioned: mentioned.map((c) => c.name),
    protect,
    fundsConsidered: protect ? `all spending categories except ${mentioned.map((c) => c.name).join(', ') || 'none'}` : mentioned.length ? mentioned.map((c) => c.name).join(', ') : 'all spending categories',
    daysInWeekIncludingToday: intel.overview.daysLeftInWeek,
    daysLeftInMonthAfterToday: daysAfterToday,
    weeklyLimitPaise: weeklyLimit,
    todayLimitPaise: todayLimit,
    monthlyRemainingPaise: monthlyRemaining,
    limitPaise: limit,
    overLimitByPaise: window !== 'month' ? Math.max(0, amount - limit) : 0,
    roomLeftInLimitPaise: window !== 'month' ? Math.max(0, limit - amount) : 0,
    monthlyLeftAfterPaise: monthlyLeftAfter,
    shortByPaise: Math.max(0, amount - monthlyRemaining),
    perDayAfterPaise: daysAfterToday > 0 ? Math.max(0, Math.floor(monthlyLeftAfter / daysAfterToday)) : Math.max(0, monthlyLeftAfter),
    protectedRemainingPaise: protect ? mentioned.reduce((a, c) => a + Math.max(0, c.remainingPaise), 0) : null,
    verdict,
    categoryImpact,
  }
}

/** "outside Projects & Learning" / "in Food & Dining" / "across your spending categories" */
const fundsLabel = (q) =>
  q.protect && q.mentioned.length ? `outside ${q.mentioned.join(', ')}` : q.mentioned.length ? `in ${q.mentioned.join(', ')}` : 'across your spending categories'

const windowPhrase = (q) =>
  q.window === 'week' ? `this week (${q.daysInWeekIncludingToday} days including today)` : q.window === 'today' ? 'today' : 'this month'

function ruleAnswer(q, intel, goals) {
  const o = intel.overview
  if (q.amountPaise) {
    const from = fundsLabel(q)
    const keep = q.protect && q.mentioned.length ? `${q.mentioned.join(', ')} stays untouched.` : null
    const monthLine = `You have ${formatINR(q.monthlyRemainingPaise)} left ${from} for the rest of this month`
    if (q.verdict === 'fits_comfortably') {
      const within = q.window === 'month'
        ? `${monthLine}, so ${formatINR(q.amountPaise)} fits.`
        : `${formatINR(q.amountPaise)} is within the ${formatINR(q.limitPaise)} you can safely spend ${windowPhrase(q)} ${from}.`
      return {
        text: q.window === 'month'
          ? `Yes. ${within} Afterwards, ${formatINR(q.monthlyLeftAfterPaise)} remains for the other ${q.daysLeftInMonthAfterToday} days of the month.`
          : `Yes. ${within} ${monthLine}, so ${formatINR(q.monthlyLeftAfterPaise)} remains afterwards.`,
        tip: keep,
      }
    }
    if (q.verdict === 'fits_but_tight') {
      return {
        text: `Yes, but it's tight. ${formatINR(q.amountPaise)} is ${formatINR(q.overLimitByPaise)} more than the ${formatINR(q.limitPaise)} you can safely spend ${windowPhrase(q)} ${from}. ${monthLine}, so it is affordable, leaving ${formatINR(q.monthlyLeftAfterPaise)} for the other ${q.daysLeftInMonthAfterToday} days.`,
        tip: keep ?? 'Spreading the purchase over two weeks keeps you within the weekly limit.',
      }
    }
    return {
      text: `Not really. ${formatINR(q.amountPaise)} is more than the ${formatINR(q.monthlyRemainingPaise)} left ${from} for the rest of this month, short by ${formatINR(q.shortByPaise)}.`,
      tip: 'Consider waiting for your next allowance or moving money from a category with room to spare.',
    }
  }
  const lower = q.raw.toLowerCase()
  if (/(where|most|biggest|spent|spending|going)/.test(lower)) {
    const top = [...intel.categories].sort((a, b) => b.spentPaise - a.spentPaise).slice(0, 3)
    return { text: `You've spent ${formatINR(o.totalSpentPaise)} so far this month. Top categories: ${top.map((c) => `${c.name} ${formatINR(c.spentPaise)} (${c.consumedPct}% used)`).join('; ')}.`, tip: intel.risks[0]?.message ?? null }
  }
  if (/(save|saving|goal)/.test(lower)) {
    const g = goals.find((x) => x.savedPaise < x.targetPaise)
    return {
      text: `You have ${formatINR(o.savingsRemainingPaise)} in this month's Savings bucket.${g ? ` ${g.name} needs ${formatINR(g.targetPaise - g.savedPaise)} more by ${formatDateLabel(g.targetDate)}.` : ''}`,
      tip: intel.recommendations.find((r) => r.kind === 'savings')?.title ?? null,
    }
  }
  return {
    text: `You have ${formatINR(o.walletBalancePaise)} in your wallet and ${formatINR(o.spendableRemainingPaise)} left to spend this month. You can safely spend ${formatINR(o.safeThisWeekPaise)} this week, about ${formatINR(o.safeDailyLimitPaise)} a day.`,
    tip: 'Ask something like "Can I spend ₹2,000 this week without affecting my project budget?"',
  }
}

/* ---------------- Validation helpers (exported for unit tests) ---------------- */

/** The server's verdict wins: reject a model answer that opens with the opposite conclusion. */
export function contradictsVerdict(answer, verdict) {
  const opening = answer.trim().toLowerCase()
  if (verdict === 'does_not_fit') return /^(yes|sure|absolutely|of course|definitely)\b/.test(opening)
  // "Tight" still means it fits, so a flat "no" contradicts it as well.
  if (verdict === 'fits_comfortably' || verdict === 'fits_but_tight') return /^(no|not really|unfortunately|sadly|you can'?t|you cannot)\b/.test(opening)
  return false
}

const OPENING = { fits_comfortably: 'Yes', fits_but_tight: 'Yes, but', does_not_fit: 'Not really' }

/** Splits on sentence ends (not inside "₹1,499.89" or after "Rs."). */
export function splitSentences(text) {
  return text.trim().split(/(?<=[.!?])\s+(?=[A-Z₹"'(])/).filter(Boolean)
}

/**
 * Keeps only sentences whose ₹ figures are all in `allowed`.
 * Returns { text, dropped, firstDropped }.
 */
export function groundSentences(text, allowed) {
  const sentences = splitSentences(text)
  const kept = []
  const dropped = []
  for (const s of sentences) (isGrounded(s, allowed) ? kept : dropped).push(s)
  return { text: kept.join(' '), dropped, firstDropped: sentences.length > 0 && dropped[0] === sentences[0] }
}

const WEEK_WORD = /\b(week|weekly|weekend|week's)\b/i
const MONTH_WORD = /\b(month|monthly|month's|month-end|cycle)\b/i

/**
 * Period labels for figures: { weekly: paise[], monthly: paise[] }.
 * An amount in both lists is ambiguous and never checked.
 */
export function periodSets(weekly, monthly) {
  const wExact = new Set(weekly.filter((p) => p > 0))
  const mExact = new Set(monthly.filter((p) => p > 0))
  const w = allowedAmountSet([...wExact])
  const m = allowedAmountSet([...mExact])
  // An exact figure outranks another figure's whole-rupee rounding (₹600 left vs ₹599.97 ≈ ₹600 weekly);
  // only a figure that is exact (or only rounded) in both lists is ambiguous.
  const label = (own, ownExact, other, otherExact) =>
    new Set([...own].filter((p) => !otherExact.has(p) && (ownExact.has(p) || !other.has(p))))
  return { weeklyOnly: label(w, wExact, m, mExact), monthlyOnly: label(m, mExact, w, wExact) }
}

/** True when a sentence calls a monthly-only figure weekly, or a weekly-only figure monthly. */
export function mislabelsPeriod(sentence, { weeklyOnly, monthlyOnly }) {
  const amounts = extractRupeeAmounts(sentence)
  const saysWeek = WEEK_WORD.test(sentence)
  const saysMonth = MONTH_WORD.test(sentence)
  if (saysWeek && !saysMonth && amounts.some((p) => monthlyOnly.has(p))) return true
  if (saysMonth && !saysWeek && amounts.some((p) => weeklyOnly.has(p))) return true
  return false
}

/** Drops sentences that mislabel the period. Returns { text, dropped, firstDropped }. */
export function checkPeriods(text, sets) {
  const sentences = splitSentences(text)
  const kept = []
  const dropped = []
  for (const s of sentences) (mislabelsPeriod(s, sets) ? dropped : kept).push(s)
  return { text: kept.join(' '), dropped, firstDropped: sentences.length > 0 && dropped[0] === sentences[0] }
}

const EXCEED = /\b(more than|over|above|exceed|exceeds|exceeded|exceeding|beyond|higher than|bigger than|larger than|past|ahead of|not within|isn'?t within|outside your)\b/i
const windowWord = (q) => (q.window === 'week' ? WEEK_WORD : /\btoday\b/i)

/**
 * For a "fits_but_tight" week/today question: true when a sentence implies the asked amount is
 * safe or within the weekly (today's) limit, e.g. "You can safely spend ₹2,000 this week".
 */
export function overstatesWindowLimit(sentence, q) {
  if (q.verdict !== 'fits_but_tight' || q.window === 'month' || !q.amountPaise) return false
  const amounts = extractRupeeAmounts(sentence)
  if (!amounts.includes(q.amountPaise)) return false
  const aboutLimit = windowWord(q).test(sentence) || amounts.includes(q.limitPaise) || /\b(pace|limit)\b/i.test(sentence)
  const claimsSafe = /\b(safe|safely|within|under|fit|fits|comfortable|comfortably)\b/i.test(sentence)
  return aboutLimit && claimsSafe && !EXCEED.test(sentence)
}

/**
 * Every amount question must state the figures its verdict rests on:
 *   weekly / today questions that fit (comfortably or tight): the safe limit for that window
 *   all amount questions: what is left for the rest of the month
 * Returns the deterministic, data-grounded sentences that are missing from `text`.
 */
export function missingKeyFigures(text, q) {
  if (!q.amountPaise) return []
  const sentences = splitSentences(text)
  const states = (paise, word) => sentences.some((s) => extractRupeeAmounts(s).includes(paise) && (!word || word.test(s)))
  const from = fundsLabel(q)
  const amount = formatINR(q.amountPaise)
  const limit = formatINR(q.limitPaise)
  const add = []

  if (q.window !== 'month' && q.verdict === 'fits_comfortably') {
    if (!states(q.limitPaise, windowWord(q))) add.push(`You can safely spend ${limit} ${windowPhrase(q)} ${from}.`)
  }
  if (q.window !== 'month' && q.verdict === 'fits_but_tight') {
    // Must say BOTH what the safe pace is and that the amount goes over it.
    const limitStated = states(q.limitPaise, windowWord(q))
    const exceedStated = sentences.some((s) => EXCEED.test(s) && (extractRupeeAmounts(s).includes(q.limitPaise) || windowWord(q).test(s) || /\b(pace|limit)\b/i.test(s)))
    if (!limitStated) add.push(`${amount} is more than the ${limit} you can safely spend ${windowPhrase(q)} ${from}.`)
    else if (!exceedStated) add.push(`So ${amount} goes over your safe pace for ${q.window === 'week' ? 'this week' : 'today'}.`)
  }

  if (q.verdict === 'does_not_fit') {
    if (!states(q.monthlyRemainingPaise, MONTH_WORD)) add.push(`Only ${formatINR(q.monthlyRemainingPaise)} is left ${from} for the rest of this month, short by ${formatINR(q.shortByPaise)}.`)
  } else if (!states(q.monthlyRemainingPaise, MONTH_WORD)) {
    add.push(`${formatINR(q.monthlyRemainingPaise)} is left ${from} for the rest of this month, so ${amount} would leave ${formatINR(q.monthlyLeftAfterPaise)}.`)
  } else if (!states(q.monthlyLeftAfterPaise)) {
    add.push(`Spending ${amount} would leave ${formatINR(q.monthlyLeftAfterPaise)} ${from} for the rest of this month.`)
  }
  return add
}

/** Inserts the missing sentences right after the verdict sentence. */
export function completeAnswer(text, q) {
  const added = missingKeyFigures(text, q)
  if (!added.length) return { text, added }
  const [first, ...rest] = splitSentences(text)
  return { text: [first, ...added, ...rest].join(' '), added }
}

/* ---------------- Facts for the model ---------------- */

/** Builds model-facing facts as ₹ strings and records every paise value used, for grounding. */
function buildFacts(intel, q, goals, transactions) {
  const amounts = []
  const m = (paise) => {
    if (paise === null || paise === undefined) return null
    amounts.push(paise)
    return formatINR(paise)
  }
  const o = intel.overview
  const facts = {
    today: formatDateLabel(intel.cycle.today),
    month_ends: formatDateLabel(intel.cycle.end),
    days_left_in_month_after_today: intel.progress.daysRemaining,
    days_in_this_week_including_today: o.daysLeftInWeek,
    this_month: {
      monthly_allowance: m(o.allowancePaise),
      total_spent_this_month: m(o.totalSpentPaise),
      wallet_balance: m(o.walletBalancePaise),
      left_to_spend_for_rest_of_month: m(o.spendableRemainingPaise),
      savings_bucket_left: m(o.savingsRemainingPaise),
      average_daily_spend: m(o.dailyAveragePaise),
      safe_daily_limit: m(o.safeDailyLimitPaise),
      projected_month_spend: m(o.projectedSpendPaise),
      projected_month_end_surplus: m(o.projectedSurplusPaise),
      budget_health: `${o.healthLabel} (${o.healthScore}/100)`,
    },
    this_week: {
      safe_to_spend_this_week: m(o.safeThisWeekPaise),
      spent_last_7_days: m(o.last7DaysSpentPaise),
      spent_previous_7_days: m(o.previous7DaysSpentPaise),
      trend_vs_previous_week_pct: o.trendPct,
    },
    categories: intel.categories.map((c) => ({
      name: c.name,
      status: c.status,
      risk: c.risk,
      monthly_allocation: m(c.allocatedPaise),
      spent_this_month: m(c.spentPaise),
      left_for_rest_of_month: m(c.remainingPaise),
      percent_used: c.consumedPct,
      daily_pace: m(c.dailyPacePaise),
      safe_per_day: m(c.safeDailyLimitPaise),
      safe_this_week: m(c.safeThisWeekPaise),
      runs_out_around: c.depletionDate ? formatDateLabel(c.depletionDate) : 'lasts the month',
      top_merchant: c.topMerchant ? `${c.topMerchant.name} (${c.topMerchant.count} payments, ${m(c.topMerchant.spentPaise)})` : null,
    })),
    recent_transactions: transactions.map((t) => ({ date: formatDateLabel(t.occurred_on), merchant: t.merchant, category: t.category, amount: m(t.amount), status: t.status })),
    savings_goals: goals.map((g) => ({ name: g.name, target: m(g.targetPaise), saved: m(g.savedPaise), still_needed: m(Math.max(0, g.targetPaise - g.savedPaise)), target_date: formatDateLabel(g.targetDate) })),
  }
  if (q.amountPaise) {
    facts.question_analysis = {
      amount_asked: m(q.amountPaise),
      asked_about: q.window === 'week' ? 'this week' : q.window === 'today' ? 'today' : 'this month',
      funds_considered: q.fundsConsidered,
      weekly: {
        safe_weekly_limit: m(q.weeklyLimitPaise),
        days_in_week_including_today: q.daysInWeekIncludingToday,
        ...(q.window === 'week' && q.overLimitByPaise > 0 ? { over_weekly_limit_by: m(q.overLimitByPaise) } : {}),
        ...(q.window === 'week' && q.overLimitByPaise === 0 ? { weekly_room_left_after: m(q.roomLeftInLimitPaise) } : {}),
      },
      ...(q.window === 'today'
        ? { today: { safe_limit_today: m(q.todayLimitPaise), ...(q.overLimitByPaise > 0 ? { over_today_limit_by: m(q.overLimitByPaise) } : { room_left_today_after: m(q.roomLeftInLimitPaise) }) } }
        : {}),
      monthly: {
        remaining_for_rest_of_month: m(q.monthlyRemainingPaise),
        days_left_in_month_after_today: q.daysLeftInMonthAfterToday,
        // Only meaningful when the spend fits; otherwise the shortfall is the figure to use.
        ...(q.shortByPaise > 0
          ? { short_by: m(q.shortByPaise) }
          : { remaining_after_this_spend: m(q.monthlyLeftAfterPaise), per_day_after_this_spend: m(q.perDayAfterPaise) }),
      },
      protected_categories_left_this_month: q.protectedRemainingPaise === null ? null : `${q.mentioned.join(', ')}: ${m(q.protectedRemainingPaise)} (untouched)`,
      category_impact: q.categoryImpact
        ? { category: q.categoryImpact.category, left_for_rest_of_month_after: m(q.categoryImpact.remainingAfterPaise), percent_used_after: q.categoryImpact.percentUsedAfter, safe_per_day_after: m(q.categoryImpact.safeDailyAfterPaise) }
        : null,
      verdict: q.verdict,
      answer_must_start_with: OPENING[q.verdict],
    }
  } else if (q.mentioned.length) {
    facts.question_analysis = { categories_mentioned: q.mentioned, asked_about: q.window }
  }
  return { facts, amounts }
}

/** Which figures belong to which period (for the consistency check). */
function periodFigures(intel, q) {
  const o = intel.overview
  const weekly = [o.safeThisWeekPaise, o.last7DaysSpentPaise, o.previous7DaysSpentPaise, ...intel.categories.map((c) => c.safeThisWeekPaise)]
  const monthly = [o.allowancePaise, o.totalSpentPaise, o.spendableRemainingPaise, o.projectedSpendPaise, ...intel.categories.flatMap((c) => [c.allocatedPaise, c.spentPaise, c.remainingPaise])]
  if (q.amountPaise) {
    weekly.push(q.weeklyLimitPaise)
    if (q.window === 'week') weekly.push(q.overLimitByPaise, q.roomLeftInLimitPaise)
    monthly.push(q.monthlyRemainingPaise, q.shortByPaise)
    if (q.monthlyLeftAfterPaise > 0) monthly.push(q.monthlyLeftAfterPaise)
    if (q.protectedRemainingPaise) monthly.push(q.protectedRemainingPaise)
  }
  // The amount the student asked about is neutral: it may appear next to either period.
  const neutral = new Set(allowedAmountSet(q.amountPaise ? [q.amountPaise] : []))
  return periodSets(weekly.filter((p) => !neutral.has(p)), monthly.filter((p) => !neutral.has(p)))
}

/** Deterministic figures returned with every reply, so clients and tests can check the wording. */
function publicAnalysis(q) {
  if (!q.amountPaise) return null
  return {
    amountPaise: q.amountPaise,
    window: q.window,
    fundsConsidered: q.fundsConsidered,
    fundsLabel: fundsLabel(q),
    daysInWeekIncludingToday: q.daysInWeekIncludingToday,
    daysLeftInMonthAfterToday: q.daysLeftInMonthAfterToday,
    weeklyLimitPaise: q.weeklyLimitPaise,
    limitPaise: q.limitPaise,
    overLimitByPaise: q.overLimitByPaise,
    monthlyRemainingPaise: q.monthlyRemainingPaise,
    monthlyLeftAfterPaise: q.monthlyLeftAfterPaise,
    shortByPaise: q.shortByPaise,
    verdict: q.verdict,
  }
}

/* ---------------- Logging (never logs the key or full facts) ---------------- */

function logFallback(error, ms) {
  const status = error.status ? ` status=${error.status}` : ''
  console.warn(`[ai:chat] fallback to rules: reason=${error.reason}${status} model=${aiModel() ?? '-'} ${ms}ms: ${error.message}`)
  if (DEBUG && error.detail) console.warn('[ai:chat] detail:', error.detail)
}

/** Prompt lines naming the exact figures this answer must explain (all from question_analysis). */
function keyFigureRule(q) {
  const amount = formatINR(q.amountPaise)
  const limit = formatINR(q.limitPaise)
  const month = formatINR(q.monthlyRemainingPaise)
  const period = q.window === 'week' ? 'this week' : 'today'
  if (q.verdict === 'fits_but_tight') {
    return `Explain all of this: ${limit} is the safe spending pace for ${period}; ${month} is left ${fundsLabel(q)} for the rest of this month; spending ${amount} would leave ${formatINR(q.monthlyLeftAfterPaise)}; so ${amount} exceeds the safe pace for ${period} even though it fits within the ${month} left this month.
Never say or imply that ${amount} is safe or within the limit for ${period}. Quote ${limit} exactly; never round it.`
  }
  if (q.verdict === 'does_not_fit') return `Explain that only ${month} is left ${fundsLabel(q)} for the rest of this month, short by ${formatINR(q.shortByPaise)}.`
  return q.window === 'month'
    ? `State that ${month} is left ${fundsLabel(q)} for the rest of this month and spending ${amount} would leave ${formatINR(q.monthlyLeftAfterPaise)}.`
    : `State that ${limit} is the safe amount for ${period} and ${month} is left for the rest of this month, leaving ${formatINR(q.monthlyLeftAfterPaise)} after spending ${amount}. Quote amounts exactly.`
}

const rejection = (message, reason, detail) => Object.assign(new AiUnavailableError(message, { reason }), { detail })

/* ---------------- Main ---------------- */

/** Loads everything Copilot may use for this user from PostgreSQL. */
export async function loadChatData(userId) {
  const [intel, summary, goalsRes, txRes] = await Promise.all([
    getSpendingIntelligence(userId),
    getSummary(pool, userId),
    query(`SELECT name, (target * 100)::bigint AS target, (saved * 100)::bigint AS saved, target_date FROM savings_goals WHERE user_id = $1 ORDER BY target_date`, [userId]),
    query(
      `SELECT t.occurred_on, t.merchant, c.name AS category, (t.amount * 100)::bigint AS amount, t.status
         FROM transactions t JOIN categories c ON c.id = t.category_id
        WHERE t.user_id = $1 AND t.type = 'expense'
        ORDER BY t.occurred_on DESC, t.occurred_time DESC LIMIT 12`,
      [userId],
    ),
  ])
  const goals = goalsRes.rows.map((g) => ({ name: g.name, targetPaise: g.target, savedPaise: g.saved, targetDate: g.target_date }))
  return { intel, summary, goals, transactions: txRes.rows }
}

/** POST /api/ai/chat for the signed-in user. */
export async function askAssistant(userId, message, history = [], options = {}) {
  return answerQuestion(await loadChatData(userId), message, history, options)
}

/**
 * Answers from already-loaded data (pure apart from the model call).
 * options.complete: model call (defaults to Nebius chatJson; tests inject a fake)
 * options.debug: attach `debug` (raw model answer, removed and added sentences). Never set by the HTTP route.
 */
export async function answerQuestion({ intel, summary, goals, transactions }, message, history = [], options = {}) {
  const complete = options.complete ?? chatJson
  const q = { ...analyseQuestion(message, intel, summary), raw: message }
  const deterministic = ruleAnswer(q, intel, goals)
  const base = { id: `msg_${Date.now().toString(36)}`, role: 'assistant', createdAt: new Date().toISOString(), analysis: publicAnalysis(q) }
  const { facts, amounts } = buildFacts(intel, q, goals, transactions)

  // Amounts the student typed may be echoed back (they are the student's own figures, not balances).
  const studentText = [message, ...history.filter((h) => h.role === 'user').map((h) => h.text)].join(' ')
  const allowed = allowedAmountSet([...amounts, ...extractRupeeAmounts(studentText)])
  const periods = periodFigures(intel, q)

  const started = Date.now()
  try {
    const convo = history
      .slice(-6)
      .map((h) => `${h.role === 'user' ? 'Student' : 'Pockit AI'}: ${h.text}`)
      .join('\n')
    const verdictRule = q.verdict
      ? `question_analysis.verdict is "${q.verdict}". Your answer MUST begin with "${OPENING[q.verdict]}" and agree with it.`
      : 'There is no calculated verdict for this question.'
    const { json, model } = await complete({
      system: SYSTEM_BASE,
      temperature: 0.3,
      maxTokens: 700,
      user: `Answer the student's question in a friendly way using only these facts.
${verdictRule}
Every money amount in FACTS is already a ready-to-quote rupee string. Quote amounts exactly as written.
Do NOT add, subtract, divide or estimate any amount yourself, and do not mention any amount that is not in FACTS.
${q.amountPaise ? keyFigureRule(q) : ''}
Keep the two periods separate and name them explicitly:
- "weekly" figures are the SAFE amount to spend this week (a pace limit), e.g. "you can safely spend ₹X this week".
- "monthly" figures are what is LEFT in the budget until the month ends, e.g. "₹Y is left for the rest of this month".
Never call a monthly figure weekly or a weekly figure monthly. "Yes, but" means it fits the monthly budget but exceeds the weekly limit.
Write normal English with a space after every comma and full stop and around every ₹ amount.
If the facts don't contain what's needed, say so briefly instead of guessing.

FACTS:
${JSON.stringify(facts)}

Recent conversation (for context only):
<student_input>
${convo.slice(0, 2000)}
</student_input>

Question:
<student_input>
${message}
</student_input>

Return JSON: {"answer": "2-4 sentences, max 600 characters", "tip": "one practical tip, max 200 characters, or null"}`,
    })

    // Some models use a different key for the main text.
    const raw = json && typeof json === 'object' && json.answer === undefined ? { ...json, answer: json.response ?? json.text ?? json.message } : json
    const parsed = chatOutput.safeParse(raw)
    if (!parsed.success) {
      throw rejection('Model output failed validation', 'invalid_output', { issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`), keys: Object.keys(json ?? {}) })
    }

    // Fix spacing first, so sentence-level checks see real sentence boundaries.
    const answer = normalizeText(parsed.data.answer)
    const tipText = parsed.data.tip ? normalizeText(parsed.data.tip) : null

    if (contradictsVerdict(answer, q.verdict)) {
      throw rejection('Model answer contradicted the calculated verdict', 'contradiction', { verdict: q.verdict, answer })
    }

    const grounded = groundSentences(answer, allowed)
    if (!grounded.text || (q.verdict && grounded.firstDropped)) {
      throw rejection('Model mentioned figures that are not in your data', 'ungrounded', {
        dropped: grounded.dropped,
        unknownAmounts: extractRupeeAmounts(grounded.dropped.join(' ')).filter((p) => !allowed.has(p)).map(formatINR),
      })
    }
    const consistent = checkPeriods(grounded.text, periods)
    // grounded.text still starts with the model's verdict sentence; it must survive this check too.
    if (!consistent.text || (q.verdict && consistent.firstDropped)) {
      throw rejection('Model mixed up weekly and monthly figures', 'inconsistent', { dropped: consistent.dropped })
    }
    const allSentences = splitSentences(consistent.text)
    const overstated = allSentences.filter((x) => overstatesWindowLimit(x, q))
    if (q.verdict && overstated[0] === allSentences[0] && overstated.length) {
      throw rejection('Model implied the amount is within the weekly limit', 'inconsistent', { dropped: overstated })
    }
    const honest = allSentences.filter((x) => !overstated.includes(x)).join(' ')
    const removed = [...grounded.dropped, ...consistent.dropped, ...overstated]
    if (removed.length) {
      console.warn(`[ai:chat] removed ${removed.length} sentence(s): ${grounded.dropped.length} with unknown figures, ${consistent.dropped.length} with weekly/monthly mix-ups, ${overstated.length} implying the amount is within the weekly limit`)
      if (DEBUG) console.warn('[ai:chat] removed:', removed)
    }

    // If filtering removed a figure the verdict rests on, restore it from the server's own numbers.
    const capped = honest.length > 520 ? `${honest.slice(0, 517).replace(/\s+\S*$/, '')}…` : honest
    const completed = completeAnswer(capped, q)
    if (completed.added.length) {
      console.warn(`[ai:chat] added ${completed.added.length} deterministic sentence(s) with key figures the model left out`)
      if (DEBUG) console.warn('[ai:chat] added:', completed.added)
    }
    const tip = tipText && isGrounded(tipText, allowed) && !mislabelsPeriod(tipText, periods) && !overstatesWindowLimit(tipText, q) ? tipText : null
    if (DEBUG) console.info(`[ai:chat] nebius ok model=${model} ${Date.now() - started}ms`)
    return {
      ...base,
      text: completed.text,
      tip,
      source: 'nebius',
      model,
      ...(completed.added.length ? { notice: 'Pockit added figures from your budget that the AI left out.' } : {}),
      ...(options.debug
        ? {
            debug: {
              rawAnswer: parsed.data.answer,
              removedUnknownFigures: grounded.dropped,
              unknownAmounts: extractRupeeAmounts(grounded.dropped.join(' ')).filter((p) => !allowed.has(p)).map(formatINR),
              removedPeriodMixups: consistent.dropped,
              removedOverstated: overstated,
              added: completed.added,
            },
          }
        : {}),
    }
  } catch (error) {
    if (!(error instanceof AiUnavailableError)) throw error
    if (error.reason !== 'disabled' || !env.isProduction) logFallback(error, Date.now() - started)
    return {
      ...base,
      text: normalizeText(deterministic.text),
      tip: deterministic.tip ? normalizeText(deterministic.tip) : null,
      model: null,
      ...fallbackMeta(error),
      ...(options.debug ? { debug: { reason: error.reason, message: error.message, detail: error.detail ?? null } } : {}),
    }
  }
}
