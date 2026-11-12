import { pool, query } from '../db/pool.js'
import { addDays, daysBetween, formatDateLabel, parseISODate } from '../lib/dates.js'
import { formatINR, percentOf } from '../lib/money.js'
import { getSummary } from './financeService.js'

/*
 * DETERMINISTIC SPENDING INTELLIGENCE
 * Everything here is plain arithmetic on PostgreSQL data (integer paise).
 * The LLM never computes or changes these numbers; it may only explain them.
 */

const STEP = 5000 // ₹50 rounding for suggested amounts
const floorStep = (p) => Math.floor(p / STEP) * STEP

/** Per-category risk from deterministic rules. */
function categoryRisk(c, progress) {
  if (c.status === 'over') return 'high'
  const daysEarly = c.depletionDay ? progress.daysTotal - c.depletionDay : 0
  if (c.depletionDay && daysEarly >= 3 && c.consumedPct >= 75) return 'high'
  if (c.status === 'fast' || (c.depletionDay && daysEarly > 0)) return 'medium'
  return 'low'
}

/** Days from today to the end of the current week (Mon–Sun), capped at the cycle end, inclusive of today. */
export function weekWindow(cycle, progress) {
  const dow = new Date(parseISODate(cycle.today)).getUTCDay() // 0 = Sunday
  const daysToSunday = dow === 0 ? 0 : 7 - dow
  const days = Math.min(daysToSunday + 1, progress.daysRemaining + 1)
  return { days, end: addDays(cycle.today, days - 1) }
}

export async function getSpendingIntelligence(userId) {
  const summary = await getSummary(pool, userId)
  const { progress, cycle } = summary
  const spendable = summary.categories.filter((c) => c.kind !== 'savings')

  // Spending trend: last 7 days vs the 7 days before (within the cycle).
  const { rows: trendRows } = await query(
    `SELECT (COALESCE(SUM(amount) FILTER (WHERE occurred_on > $2::date - 7), 0) * 100)::bigint AS last7,
            (COALESCE(SUM(amount) FILTER (WHERE occurred_on <= $2::date - 7 AND occurred_on > $2::date - 14), 0) * 100)::bigint AS prev7
       FROM transactions
      WHERE user_id = $1 AND status = 'success' AND type = 'expense' AND occurred_on BETWEEN $3 AND $2`,
    [userId, cycle.today, cycle.start],
  )
  const { rows: merchantRows } = await query(
    `SELECT t.category_id, t.merchant, (SUM(t.amount) * 100)::bigint AS spent, COUNT(*)::int AS n
       FROM transactions t
      WHERE t.user_id = $1 AND t.status = 'success' AND t.type = 'expense' AND t.occurred_on BETWEEN $2 AND $3
      GROUP BY t.category_id, t.merchant
      ORDER BY spent DESC`,
    [userId, cycle.start, cycle.end],
  )
  const topMerchant = (categoryId) => merchantRows.find((m) => m.category_id === categoryId) ?? null

  const evenDaily = Math.floor(summary.spendableAllocated / progress.daysTotal)
  const week = weekWindow(cycle, progress)

  const categories = spendable.map((c) => {
    const risk = categoryRisk(c, progress)
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      risk,
      allocatedPaise: c.allocated,
      spentPaise: c.spent,
      remainingPaise: c.remaining,
      consumedPct: c.consumedPct,
      dailyPacePaise: c.dailyPace,
      safeDailyLimitPaise: c.safeDailyLimit,
      safeThisWeekPaise: Math.max(0, Math.min(c.remaining, c.safeDailyLimit * week.days)),
      projectedPaise: c.projected,
      projectedOverspendPaise: Math.max(0, c.projected - c.allocated),
      projectedSurplusPaise: Math.max(0, c.allocated - c.projected),
      depletionDate: c.depletionDay ? addDays(cycle.start, c.depletionDay - 1) : null,
      daysLeftInBudget: c.depletionDay ? Math.max(0, c.depletionDay - progress.daysElapsed) : null,
      topMerchant: topMerchant(c.id) ? { name: topMerchant(c.id).merchant, spentPaise: topMerchant(c.id).spent, count: topMerchant(c.id).n } : null,
    }
  })

  const risks = categories
    .filter((c) => c.risk !== 'low')
    .sort((a, b) => (a.risk === b.risk ? b.consumedPct - a.consumedPct : a.risk === 'high' ? -1 : 1))
    .map((c) => ({
      categoryId: c.id,
      categoryName: c.name,
      level: c.risk,
      message:
        c.status === 'over'
          ? `${c.name} is ${formatINR(-c.remainingPaise)} over budget.`
          : c.depletionDate
            ? `${c.name} is ${c.consumedPct}% used with ${progress.elapsedPct}% of the month gone; at ${formatINR(c.dailyPacePaise)}/day it runs out around ${formatDateLabel(c.depletionDate)}.`
            : `${c.name} is running ahead of the month (${c.consumedPct}% used vs ${progress.elapsedPct}% of the month).`,
    }))

  const recommendations = []
  for (const c of categories.filter((x) => x.risk !== 'low')) {
    recommendations.push({
      id: `cap-${c.id}`,
      kind: 'daily-cap',
      categoryId: c.id,
      title: `Keep ${c.name} under ${formatINR(c.safeDailyLimitPaise)}/day`,
      body: `You have ${formatINR(Math.max(0, c.remainingPaise))} left for ${progress.daysRemaining} days. Your current pace is ${formatINR(c.dailyPacePaise)}/day.`,
    })
    if (c.topMerchant && c.topMerchant.count >= 2) {
      recommendations.push({
        id: `merchant-${c.id}`,
        kind: 'merchant',
        categoryId: c.id,
        title: `${c.topMerchant.name} is your biggest ${c.name} expense`,
        body: `${c.topMerchant.count} payments totalling ${formatINR(c.topMerchant.spentPaise)} this month. Cutting one or two would ease the pressure on ${c.name}.`,
      })
    }
  }
  const needy = categories.filter((c) => c.projectedOverspendPaise > 0).sort((a, b) => b.projectedOverspendPaise - a.projectedOverspendPaise)[0]
  const donor = categories.filter((c) => c.risk === 'low' && c.id !== needy?.id).sort((a, b) => b.projectedSurplusPaise - a.projectedSurplusPaise)[0]
  if (needy && donor) {
    const amount = floorStep(Math.min(donor.projectedSurplusPaise, needy.projectedOverspendPaise))
    if (amount > 0) {
      recommendations.push({
        id: `rebalance-${donor.id}-${needy.id}`,
        kind: 'rebalance',
        categoryId: needy.id,
        title: `Move ${formatINR(amount)} from ${donor.name} to ${needy.name}`,
        body: `${donor.name} is on track to finish with about ${formatINR(floorStep(donor.projectedSurplusPaise))} unused, while ${needy.name} is heading ${formatINR(floorStep(needy.projectedOverspendPaise))} over.`,
        action: { type: 'rebalance', fromCategoryId: donor.id, toCategoryId: needy.id, amount },
      })
    }
  }
  if (summary.projectedSurplus > 0 && summary.savingsRemaining >= 0) {
    const extra = floorStep(Math.floor(summary.projectedSurplus / 2))
    if (extra > 0) {
      recommendations.push({
        id: 'save-surplus',
        kind: 'savings',
        title: `You could save an extra ${formatINR(extra)} this month`,
        body: `At your current pace you'll finish with about ${formatINR(floorStep(summary.projectedSurplus))} unspent. Moving half of it to a goal keeps a buffer.`,
      })
    }
  }

  const last7 = trendRows[0].last7
  const prev7 = trendRows[0].prev7
  return {
    generatedFor: cycle.today,
    cycle,
    progress,
    overview: {
      allowancePaise: summary.allowance,
      spendableAllocatedPaise: summary.spendableAllocated,
      totalSpentPaise: summary.totalSpent,
      walletBalancePaise: summary.walletBalance,
      spendableRemainingPaise: summary.spendableRemaining,
      savingsRemainingPaise: summary.savingsRemaining,
      dailyAveragePaise: summary.dailyAverage,
      evenPaceDailyPaise: evenDaily,
      safeDailyLimitPaise: summary.safeDailyLimit,
      safeThisWeekPaise: Math.max(0, Math.min(summary.spendableRemaining, summary.safeDailyLimit * week.days)),
      daysLeftInWeek: week.days,
      projectedSpendPaise: summary.projectedSpend,
      projectedSurplusPaise: summary.projectedSurplus,
      velocityRatio: evenDaily > 0 ? Math.round((summary.dailyAverage / evenDaily) * 100) / 100 : 0,
      last7DaysSpentPaise: last7,
      previous7DaysSpentPaise: prev7,
      trendPct: prev7 > 0 ? Math.round(percentOf(last7 - prev7, prev7)) : null,
      healthScore: summary.health.score,
      healthLabel: summary.health.label,
    },
    categories,
    risks,
    recommendations: recommendations.slice(0, 6),
    daysRemaining: daysBetween(cycle.today, cycle.end),
  }
}
