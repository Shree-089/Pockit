/*
 * FINANCIAL CALCULATIONS
 * Pure functions: same input -> same output, no React, no storage, no network.
 * Components and services call these instead of computing totals themselves,
 * so every screen shows the same numbers.
 * All money values are integer paise (see money.js).
 */

import {
  MAX_TRANSACTION_PAISE,
  floorToStep,
  formatINR,
  parseRupeeInput,
  percentOf,
  sumPaise,
} from './money.js'

/* ------------------------------------------------------------------ */
/* Dates (ISO 'YYYY-MM-DD' strings, computed in UTC to avoid timezone drift) */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function daysBetween(fromIso, toIso) {
  return Math.round((parseISODate(toIso) - parseISODate(fromIso)) / DAY_MS)
}

export function addDays(iso, days) {
  return new Date(parseISODate(iso) + days * DAY_MS).toISOString().slice(0, 10)
}

export function formatDateLabel(iso, options = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('en-IN', { ...options, timeZone: 'UTC' }).format(parseISODate(iso))
}

/** Where we are in the budget cycle. Day counts are inclusive of start and today. */
export function getCycleProgress({ start, end, today }) {
  const daysTotal = daysBetween(start, end) + 1
  const rawElapsed = daysBetween(start, today) + 1
  const daysElapsed = Math.min(Math.max(rawElapsed, 1), daysTotal)
  const daysRemaining = daysTotal - daysElapsed
  return {
    daysTotal,
    daysElapsed,
    daysRemaining,
    elapsedRatio: daysElapsed / daysTotal,
    elapsedPct: percentOf(daysElapsed, daysTotal),
  }
}

/** Converts a day number in the cycle (1-based) to its ISO date. */
export function cycleDayToDate(cycle, dayNumber) {
  return addDays(cycle.start, dayNumber - 1)
}

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

/** Only successful transactions affect balances. Failed/pending ones are shown but not counted. */
export const isCounted = (tx) => tx.status === 'success'
export const isExpense = (tx) => tx.type === 'expense'
export const isSavingsTransfer = (tx) => tx.type === 'savings'

/** { [categoryId]: paise } for all counted transactions (expenses + savings transfers). */
export function spentByCategory(transactions) {
  const totals = {}
  for (const tx of transactions) {
    if (!isCounted(tx)) continue
    totals[tx.categoryId] = (totals[tx.categoryId] ?? 0) + tx.amount
  }
  return totals
}

/** Newest first: by date, then time. */
export function sortTransactions(transactions) {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return (b.time ?? '').localeCompare(a.time ?? '')
  })
}

/**
 * Filters transactions for the Passbook.
 * filters: { query, categoryId ('all' | id), from, to (ISO dates), status ('all' | status) }
 */
export function filterTransactions(transactions, filters = {}, categoriesById = {}) {
  const { query = '', categoryId = 'all', from, to, status = 'all' } = filters
  const needle = query.trim().toLowerCase()

  return transactions.filter((tx) => {
    if (categoryId !== 'all' && tx.categoryId !== categoryId) return false
    if (status !== 'all' && tx.status !== status) return false
    if (from && tx.date < from) return false
    if (to && tx.date > to) return false
    if (!needle) return true

    const haystack = [
      tx.description,
      tx.merchant,
      tx.note,
      tx.paymentMethod,
      categoriesById[tx.categoryId]?.name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(needle)
  })
}

/** Groups (already filtered) transactions by date, newest first, with a daily spend total. */
export function groupTransactionsByDate(transactions) {
  const groups = []
  const byDate = new Map()
  for (const tx of sortTransactions(transactions)) {
    if (!byDate.has(tx.date)) {
      const group = { date: tx.date, items: [], total: 0, count: 0 }
      byDate.set(tx.date, group)
      groups.push(group)
    }
    const group = byDate.get(tx.date)
    group.items.push(tx)
    if (isCounted(tx) && isExpense(tx)) {
      group.total += tx.amount
      group.count += 1
    }
  }
  return groups
}

/** Count of transactions per category (for filter chips like "Food (11)"). */
export function countByCategory(transactions) {
  const counts = {}
  for (const tx of transactions) counts[tx.categoryId] = (counts[tx.categoryId] ?? 0) + 1
  return counts
}

/* ------------------------------------------------------------------ */
/* Budget categories                                                   */
/* ------------------------------------------------------------------ */

export const BUDGET_STATUS = {
  SAFE: 'safe',
  ON_TRACK: 'on-track',
  FAST: 'fast',
  OVER: 'over',
}

/** Display metadata for each status. `tone` maps to a design-token colour. */
export const STATUS_META = {
  [BUDGET_STATUS.SAFE]: { label: 'Safe', tone: 'success' },
  [BUDGET_STATUS.ON_TRACK]: { label: 'On Track', tone: 'royal' },
  [BUDGET_STATUS.FAST]: { label: 'Fast Pace', tone: 'warning' },
  [BUDGET_STATUS.OVER]: { label: 'Over Budget', tone: 'error' },
}

/**
 * Compares how much of the budget is used against how much of the month has passed.
 * pace = consumed% / elapsed%.  > 1.15 fast, 0.85–1.15 on track, < 0.85 safe.
 */
export function getBudgetStatus({ allocated, spent, elapsedRatio }) {
  if (allocated <= 0) return spent > 0 ? BUDGET_STATUS.OVER : BUDGET_STATUS.SAFE
  if (spent > allocated) return BUDGET_STATUS.OVER
  const pace = spent / allocated / elapsedRatio
  if (pace > 1.15) return BUDGET_STATUS.FAST
  if (pace >= 0.85) return BUDGET_STATUS.ON_TRACK
  return BUDGET_STATUS.SAFE
}

/** Everything a budget card needs, derived from one category + its spend. */
export function getCategoryStats(category, spent, progress) {
  const { allocated } = category
  const remaining = allocated - spent
  const consumedPct = allocated > 0 ? percentOf(spent, allocated) : spent > 0 ? 100 : 0
  const isSavings = category.kind === 'savings'

  const dailyPace = Math.round(spent / progress.daysElapsed)
  const projected = spent + dailyPace * progress.daysRemaining

  let depletionDay = null
  if (!isSavings && allocated > 0) {
    if (remaining <= 0) depletionDay = progress.daysElapsed
    else if (dailyPace > 0) {
      const day = progress.daysElapsed + Math.ceil(remaining / dailyPace)
      depletionDay = day <= progress.daysTotal ? day : null
    }
  }

  const safeDailyLimit =
    progress.daysRemaining > 0
      ? Math.max(0, Math.floor(remaining / progress.daysRemaining))
      : Math.max(0, remaining)

  return {
    ...category,
    spent,
    remaining,
    consumedPct,
    dailyPace,
    projected,
    projectedOverspend: Math.max(0, projected - allocated),
    projectedSurplus: Math.max(0, allocated - projected),
    depletionDay,
    safeDailyLimit,
    status: isSavings
      ? BUDGET_STATUS.SAFE
      : getBudgetStatus({ allocated, spent, elapsedRatio: progress.elapsedRatio }),
  }
}

/** 0–100 score plus a label for the dashboard health indicator. */
export function getBudgetHealth({ spendableStats, totalSpent, spendableAllocated, progress }) {
  let score = 100
  const overallPace =
    spendableAllocated > 0 ? totalSpent / spendableAllocated / progress.elapsedRatio : 0
  if (overallPace > 1) score -= Math.round((overallPace - 1) * 100)
  for (const s of spendableStats) {
    if (s.status === BUDGET_STATUS.FAST) score -= 10
    if (s.status === BUDGET_STATUS.OVER) score -= 25
  }
  score = Math.min(100, Math.max(0, score))

  const level = score >= 80 ? 'healthy' : score >= 60 ? 'watch' : 'at-risk'
  const meta = {
    healthy: { label: 'Healthy', tone: 'success' },
    watch: { label: 'Needs Attention', tone: 'warning' },
    'at-risk': { label: 'At Risk', tone: 'error' },
  }[level]

  return {
    score,
    level,
    ...meta,
    overallPace: Math.round(overallPace * 100) / 100,
    fastCount: spendableStats.filter((s) => s.status === BUDGET_STATUS.FAST).length,
    overCount: spendableStats.filter((s) => s.status === BUDGET_STATUS.OVER).length,
  }
}

/**
 * THE single source of truth for dashboard numbers.
 * Invariants (checked by scripts/verify-data.mjs):
 *   totalAllocated     = sum of category allocations
 *   totalSpent         = sum of counted expense transactions = sum of spendable category spends
 *   walletBalance      = allowance - totalSpent - savingsMoved
 *   spendableRemaining = spendableAllocated - totalSpent
 */
export function buildBudgetSummary({ allowance, categories, transactions, cycle }) {
  const progress = getCycleProgress(cycle)
  const spentMap = spentByCategory(transactions)
  const categoryStats = categories.map((c) => getCategoryStats(c, spentMap[c.id] ?? 0, progress))

  const spendableStats = categoryStats.filter((s) => s.kind !== 'savings')
  const savingsStats = categoryStats.filter((s) => s.kind === 'savings')

  const counted = transactions.filter(isCounted)
  const totalSpent = sumPaise(counted.filter(isExpense).map((t) => t.amount))
  const savingsMoved = sumPaise(counted.filter(isSavingsTransfer).map((t) => t.amount))

  const totalAllocated = sumPaise(categories.map((c) => c.allocated))
  const savingsAllocated = sumPaise(savingsStats.map((s) => s.allocated))
  const spendableAllocated = totalAllocated - savingsAllocated
  const spendableRemaining = spendableAllocated - totalSpent

  const dailyAverage = Math.round(totalSpent / progress.daysElapsed)
  const projectedSpend = totalSpent + dailyAverage * progress.daysRemaining
  const safeDailyLimit =
    progress.daysRemaining > 0
      ? Math.max(0, Math.floor(spendableRemaining / progress.daysRemaining))
      : Math.max(0, spendableRemaining)

  return {
    progress,
    allowance,
    totalAllocated,
    unallocated: allowance - totalAllocated,
    totalSpent,
    spentPct: percentOf(totalSpent, spendableAllocated),
    savingsAllocated,
    savingsMoved,
    savingsRemaining: savingsAllocated - savingsMoved,
    spendableAllocated,
    spendableRemaining,
    walletBalance: allowance - totalSpent - savingsMoved,
    dailyAverage,
    safeDailyLimit,
    projectedSpend,
    projectedSurplus: spendableAllocated - projectedSpend,
    transactionCount: counted.filter(isExpense).length,
    categories: categoryStats,
    spendableCategories: spendableStats,
    health: getBudgetHealth({ spendableStats, totalSpent, spendableAllocated, progress }),
  }
}

/* ------------------------------------------------------------------ */
/* Pre-Payment Budget Guard                                            */
/* ------------------------------------------------------------------ */

export const GUARD_LEVEL = {
  OK: 'ok',
  CAUTION: 'caution',
  WARNING: 'warning',
  OVER: 'over',
}

/**
 * Evaluates a proposed purchase against one category. ADVISORY ONLY:
 * the result informs the UI; it never blocks the payment.
 *   stats: output of getCategoryStats for the chosen category
 *   amount: purchase in paise
 *   warnThreshold: % consumed after purchase at which we warn (user setting, default 80)
 */
export function assessPurchaseImpact({ stats, amount, progress, cycle, warnThreshold = 80 }) {
  const remainingBefore = stats.remaining
  const spentAfter = stats.spent + amount
  const remainingAfter = stats.allocated - spentAfter
  const consumedBefore = stats.consumedPct
  const consumedAfter =
    stats.allocated > 0 ? percentOf(spentAfter, stats.allocated) : amount > 0 ? 100 : 0

  const dailyLimitAfter =
    progress.daysRemaining > 0
      ? Math.max(0, Math.floor(remainingAfter / progress.daysRemaining))
      : Math.max(0, remainingAfter)

  const paceAfter = stats.allocated > 0 ? spentAfter / stats.allocated / progress.elapsedRatio : Infinity

  let level = GUARD_LEVEL.OK
  if (remainingAfter < 0) level = GUARD_LEVEL.OVER
  else if (consumedAfter >= warnThreshold) level = GUARD_LEVEL.WARNING
  else if (paceAfter > 1.15) level = GUARD_LEVEL.CAUTION

  // At the category's current daily pace, when would the money run out after this purchase?
  let depletionDayAfter = null
  if (remainingAfter <= 0) depletionDayAfter = progress.daysElapsed
  else if (stats.dailyPace > 0) {
    const day = progress.daysElapsed + Math.ceil(remainingAfter / stats.dailyPace)
    depletionDayAfter = day <= progress.daysTotal ? day : null
  }

  return {
    categoryId: stats.id,
    categoryName: stats.name,
    amount,
    allocated: stats.allocated,
    spentBefore: stats.spent,
    spentAfter,
    remainingBefore,
    remainingAfter,
    consumedBefore,
    consumedAfter,
    shortfall: remainingAfter < 0 ? -remainingAfter : 0,
    shareOfRemaining: remainingBefore > 0 ? percentOf(amount, remainingBefore) : 100,
    daysRemaining: progress.daysRemaining,
    dailyLimitBefore: stats.safeDailyLimit,
    dailyLimitAfter,
    dailyPace: stats.dailyPace,
    depletionDayAfter,
    depletionDateAfter: depletionDayAfter && cycle ? cycleDayToDate(cycle, depletionDayAfter) : null,
    level,
    shouldWarn: level === GUARD_LEVEL.WARNING || level === GUARD_LEVEL.OVER,
    canProceed: true, // Pockit is advisory: the user can ALWAYS proceed.
  }
}

/* ------------------------------------------------------------------ */
/* Insights & charts                                                   */
/* ------------------------------------------------------------------ */

/**
 * Rule-based insights derived from the live summary, so they stay correct
 * after the user adds expenses. Phase 3 can replace or enrich these with the AI model.
 */
export function buildInsights(summary, cycle) {
  const { progress } = summary
  const insights = []

  const risky = summary.spendableCategories
    .filter((s) => s.status === BUDGET_STATUS.FAST || s.status === BUDGET_STATUS.OVER)
    .sort((a, b) => b.consumedPct - a.consumedPct)

  for (const s of risky) {
    const runsOut =
      s.status === BUDGET_STATUS.OVER
        ? `It's already ${formatINR(-s.remaining)} over budget.`
        : s.depletionDay
          ? `At ${formatINR(s.dailyPace)}/day it runs out around ${formatDateLabel(cycleDayToDate(cycle, s.depletionDay))}, ${progress.daysTotal - s.depletionDay} days before the month ends.`
          : `Slow down to about ${formatINR(s.safeDailyLimit)}/day to finish the month.`
    insights.push({
      id: `depletion-${s.id}`,
      kind: 'depletion',
      severity: s.status === BUDGET_STATUS.OVER ? 'error' : 'warning',
      categoryId: s.id,
      title: `${s.name} is being used too fast`,
      body: `You've used ${s.consumedPct}% of ${s.name} with ${progress.elapsedPct}% of the month gone. ${runsOut}`,
      metric: { label: 'Days left in budget', value: s.depletionDay ? Math.max(0, s.depletionDay - progress.daysElapsed) : 0 },
    })
  }

  insights.push({
    id: 'velocity',
    kind: 'velocity',
    severity: summary.dailyAverage > summary.safeDailyLimit ? 'warning' : 'info',
    title: 'Spending velocity',
    body: `You're averaging ${formatINR(summary.dailyAverage)}/day. To stay within budget, keep it under ${formatINR(summary.safeDailyLimit)}/day for the remaining ${progress.daysRemaining} days.`,
    metric: { label: 'Daily average', value: summary.dailyAverage },
  })

  insights.push({
    id: 'projection',
    kind: 'projection',
    severity: summary.projectedSurplus < 0 ? 'warning' : 'info',
    title: 'Month-end forecast',
    body:
      summary.projectedSurplus < 0
        ? `At this pace you'll spend ${formatINR(summary.projectedSpend)}, which is ${formatINR(-summary.projectedSurplus)} more than your ${formatINR(summary.spendableAllocated)} spending budget.`
        : `At this pace you'll spend ${formatINR(summary.projectedSpend)} of your ${formatINR(summary.spendableAllocated)} spending budget, leaving ${formatINR(summary.projectedSurplus)}.`,
    metric: { label: 'Projected spend', value: summary.projectedSpend },
  })

  // Suggest moving surplus from the roomiest category to the most stressed one.
  const needy = risky.find((s) => s.projectedOverspend > 0)
  const donor = summary.spendableCategories
    .filter((s) => s.status === BUDGET_STATUS.SAFE && s.id !== needy?.id)
    .sort((a, b) => b.projectedSurplus - a.projectedSurplus)[0]
  if (needy && donor) {
    const amount = floorToStep(Math.min(donor.projectedSurplus, needy.projectedOverspend), 5000)
    if (amount > 0) {
      insights.push({
        id: `rebalance-${donor.id}-${needy.id}`,
        kind: 'rebalance',
        severity: 'info',
        categoryId: needy.id,
        title: `Move ${formatINR(amount)} from ${donor.name} to ${needy.name}`,
        body: `${donor.name} is on track to finish with about ${formatINR(floorToStep(donor.projectedSurplus, 100))} unused. Shifting ${formatINR(amount)} would cover ${percentOf(amount, needy.projectedOverspend, 0)}% of ${needy.name}'s projected ${formatINR(floorToStep(needy.projectedOverspend, 100))} gap.`,
        action: { type: 'rebalance', fromCategoryId: donor.id, toCategoryId: needy.id, amount },
      })
    }
  }

  return insights
}

/**
 * Day-by-day series for the burn-forecast chart (values in paise).
 *   actual:    cumulative spend up to today (null after today)
 *   projected: straight-line forecast from today to month end (null before today)
 *   guardrail: even-pace budget line (spendableAllocated spread across the month)
 */
export function buildSpendSeries({ transactions, cycle, spendableAllocated }) {
  const progress = getCycleProgress(cycle)
  const perDay = new Array(progress.daysTotal).fill(0)
  for (const tx of transactions) {
    if (!isCounted(tx) || !isExpense(tx)) continue
    const index = daysBetween(cycle.start, tx.date)
    if (index >= 0 && index < progress.daysTotal) perDay[index] += tx.amount
  }

  const series = []
  let cumulative = 0
  for (let i = 0; i < progress.daysElapsed; i += 1) cumulative += perDay[i]
  const dailyAverage = Math.round(cumulative / progress.daysElapsed)

  let running = 0
  for (let day = 1; day <= progress.daysTotal; day += 1) {
    if (day <= progress.daysElapsed) running += perDay[day - 1]
    series.push({
      day,
      date: cycleDayToDate(cycle, day),
      actual: day <= progress.daysElapsed ? running : null,
      projected: day >= progress.daysElapsed ? cumulative + dailyAverage * (day - progress.daysElapsed) : null,
      guardrail: Math.round((spendableAllocated * day) / progress.daysTotal),
    })
  }
  return series
}

/* ------------------------------------------------------------------ */
/* Validation (shared by forms now and mock services; mirrors future backend rules) */
/* ------------------------------------------------------------------ */

/**
 * input: { amount (string or paise number), description, categoryId, date, time, paymentMethod }
 * Returns { valid, errors, value } where value is normalised (amount in paise, trimmed text).
 */
export function validateExpense(input, { categories, cycle, paymentMethods }) {
  const errors = {}
  const amount =
    typeof input.amount === 'number' && Number.isSafeInteger(input.amount)
      ? input.amount
      : parseRupeeInput(String(input.amount ?? ''))

  if (amount === null) errors.amount = 'Enter a valid amount, e.g. 120 or 99.50'
  else if (amount <= 0) errors.amount = 'Amount must be more than ₹0'
  else if (amount > MAX_TRANSACTION_PAISE) errors.amount = 'Amount cannot exceed ₹1,00,000'

  const description = (input.description ?? '').trim()
  if (description.length < 2) errors.description = 'Add a short description'
  else if (description.length > 60) errors.description = 'Keep it under 60 characters'

  const category = categories.find((c) => c.id === input.categoryId)
  if (!category) errors.categoryId = 'Choose a budget category'
  else if (category.kind === 'savings') errors.categoryId = 'Use Savings Goals to move money into savings'

  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.date = 'Choose a date'
  else if (input.date < cycle.start || input.date > cycle.today) {
    errors.date = `Date must be between ${formatDateLabel(cycle.start)} and ${formatDateLabel(cycle.today)}`
  }

  if (input.time && !/^\d{2}:\d{2}$/.test(input.time)) errors.time = 'Use HH:MM format'

  if (!paymentMethods.some((m) => m.id === input.paymentMethod)) errors.paymentMethod = 'Choose a payment method'

  const valid = Object.keys(errors).length === 0
  return {
    valid,
    errors,
    value: valid
      ? {
          amount,
          description,
          merchant: (input.merchant ?? '').trim() || description,
          categoryId: input.categoryId,
          date: input.date,
          time: input.time || '12:00',
          paymentMethod: input.paymentMethod,
          note: (input.note ?? '').trim(),
        }
      : null,
  }
}

/** input: { name, allocated (string or paise) }. Names must be unique (case-insensitive). */
export function validateCategory(input, categories, { excludeId } = {}) {
  const errors = {}
  const name = (input.name ?? '').trim()
  if (name.length < 2) errors.name = 'Name must be at least 2 characters'
  else if (name.length > 30) errors.name = 'Keep the name under 30 characters'
  else if (categories.some((c) => c.id !== excludeId && c.name.toLowerCase() === name.toLowerCase())) {
    errors.name = 'A category with this name already exists'
  }

  const allocated =
    typeof input.allocated === 'number' && Number.isSafeInteger(input.allocated)
      ? input.allocated
      : parseRupeeInput(String(input.allocated ?? ''))
  if (allocated === null) errors.allocated = 'Enter a valid amount'
  else if (allocated < 0) errors.allocated = 'Amount cannot be negative'

  const valid = Object.keys(errors).length === 0
  return { valid, errors, value: valid ? { name, allocated } : null }
}
