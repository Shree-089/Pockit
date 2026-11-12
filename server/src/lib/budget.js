import { daysBetween, addDays } from './dates.js'
import { percentOf } from './money.js'

/*
 * Derived budget figures. Inputs are integer paise coming from SQL aggregates;
 * outputs are integer paise (rounded once where a per-day figure is needed).
 * Mirrors client/src/utils/calculations.js so both sides show the same numbers.
 */

export function getCycleProgress({ start, end, today }) {
  const daysTotal = daysBetween(start, end) + 1
  const daysElapsed = Math.min(Math.max(daysBetween(start, today) + 1, 1), daysTotal)
  return {
    daysTotal,
    daysElapsed,
    daysRemaining: daysTotal - daysElapsed,
    elapsedRatio: daysElapsed / daysTotal,
    elapsedPct: percentOf(daysElapsed, daysTotal),
  }
}

export function getStatus({ allocated, spent, elapsedRatio }) {
  if (allocated <= 0) return spent > 0 ? 'over' : 'safe'
  if (spent > allocated) return 'over'
  const pace = spent / allocated / elapsedRatio
  if (pace > 1.15) return 'fast'
  if (pace >= 0.85) return 'on-track'
  return 'safe'
}

export function categoryStats(category, progress) {
  const { allocated, spent } = category
  const remaining = allocated - spent
  const isSavings = category.kind === 'savings'
  const dailyPace = Math.round(spent / progress.daysElapsed)
  let depletionDay = null
  if (!isSavings && allocated > 0) {
    if (remaining <= 0) depletionDay = progress.daysElapsed
    else if (dailyPace > 0) {
      const day = progress.daysElapsed + Math.ceil(remaining / dailyPace)
      depletionDay = day <= progress.daysTotal ? day : null
    }
  }
  return {
    ...category,
    remaining,
    consumedPct: allocated > 0 ? percentOf(spent, allocated) : spent > 0 ? 100 : 0,
    dailyPace,
    projected: spent + dailyPace * progress.daysRemaining,
    depletionDay,
    safeDailyLimit: progress.daysRemaining > 0 ? Math.max(0, Math.floor(remaining / progress.daysRemaining)) : Math.max(0, remaining),
    status: isSavings ? 'safe' : getStatus({ allocated, spent, elapsedRatio: progress.elapsedRatio }),
  }
}

/**
 * totals: authoritative SQL sums in paise { allowance, totalSpent, savingsMoved, walletBalance }
 * categories: [{ id, name, kind, allocated, spent, ... }] in paise
 */
export function buildSummary({ cycle, totals, categories, transactionCount }) {
  const progress = getCycleProgress(cycle)
  const stats = categories.map((c) => categoryStats(c, progress))
  const spendable = stats.filter((s) => s.kind !== 'savings')
  const savingsAllocated = stats.filter((s) => s.kind === 'savings').reduce((a, s) => a + s.allocated, 0)
  const totalAllocated = stats.reduce((a, s) => a + s.allocated, 0)
  const spendableAllocated = totalAllocated - savingsAllocated
  const spendableRemaining = spendableAllocated - totals.totalSpent
  const dailyAverage = Math.round(totals.totalSpent / progress.daysElapsed)
  const projectedSpend = totals.totalSpent + dailyAverage * progress.daysRemaining

  let score = 100
  const overallPace = spendableAllocated > 0 ? totals.totalSpent / spendableAllocated / progress.elapsedRatio : 0
  if (overallPace > 1) score -= Math.round((overallPace - 1) * 100)
  for (const s of spendable) score -= s.status === 'fast' ? 10 : s.status === 'over' ? 25 : 0
  score = Math.min(100, Math.max(0, score))
  const level = score >= 80 ? 'healthy' : score >= 60 ? 'watch' : 'at-risk'

  return {
    cycle,
    progress,
    allowance: totals.allowance,
    totalAllocated,
    unallocated: totals.allowance - totalAllocated,
    totalSpent: totals.totalSpent,
    savingsAllocated,
    savingsMoved: totals.savingsMoved,
    savingsRemaining: savingsAllocated - totals.savingsMoved,
    spendableAllocated,
    spendableRemaining,
    walletBalance: totals.walletBalance,
    spentPct: percentOf(totals.totalSpent, spendableAllocated),
    dailyAverage,
    safeDailyLimit: progress.daysRemaining > 0 ? Math.max(0, Math.floor(spendableRemaining / progress.daysRemaining)) : Math.max(0, spendableRemaining),
    projectedSpend,
    projectedSurplus: spendableAllocated - projectedSpend,
    transactionCount,
    health: { score, level, label: { healthy: 'Healthy', watch: 'Needs Attention', 'at-risk': 'At Risk' }[level] },
    categories: stats,
  }
}

/** Advisory purchase check. Never blocks: canProceed is always true. */
export function assessPurchase({ stats, amount, progress, cycle, warnThreshold = 80 }) {
  const spentAfter = stats.spent + amount
  const remainingAfter = stats.allocated - spentAfter
  const consumedAfter = stats.allocated > 0 ? percentOf(spentAfter, stats.allocated) : 100
  const paceAfter = stats.allocated > 0 ? spentAfter / stats.allocated / progress.elapsedRatio : Infinity
  let level = 'ok'
  if (remainingAfter < 0) level = 'over'
  else if (consumedAfter >= warnThreshold) level = 'warning'
  else if (paceAfter > 1.15) level = 'caution'

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
    remainingBefore: stats.remaining,
    remainingAfter,
    consumedBefore: stats.consumedPct,
    consumedAfter,
    shortfall: remainingAfter < 0 ? -remainingAfter : 0,
    shareOfRemaining: stats.remaining > 0 ? percentOf(amount, stats.remaining) : 100,
    daysRemaining: progress.daysRemaining,
    dailyLimitBefore: stats.safeDailyLimit,
    dailyLimitAfter: progress.daysRemaining > 0 ? Math.max(0, Math.floor(remainingAfter / progress.daysRemaining)) : Math.max(0, remainingAfter),
    dailyPace: stats.dailyPace,
    depletionDayAfter,
    depletionDateAfter: depletionDayAfter ? addDays(cycle.start, depletionDayAfter - 1) : null,
    level,
    // Fixed thresholds, decided here and never by the LLM:
    //   high_risk = purchase overspends the category or leaves nothing
    //   warning   = category ends at/above the user's warning threshold, or spending runs ahead of the month
    //   safe      = everything else
    riskLevel: remainingAfter <= 0 ? 'high_risk' : level === 'warning' || level === 'caution' ? 'warning' : 'safe',
    shouldWarn: level === 'warning' || level === 'over',
    canProceed: true,
  }
}
