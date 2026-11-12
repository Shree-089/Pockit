/*
 * Checks that the mock data reconciles. Run from client/:  node scripts/verify-data.mjs
 * Exits with code 1 if any check fails.
 */
import {
  MOCK_CATEGORIES,
  MOCK_CYCLE,
  MOCK_GOALS,
  MOCK_SETTINGS,
  MOCK_TRANSACTIONS,
} from '../src/data/mockData.js'
import {
  assessPurchaseImpact,
  buildBudgetSummary,
  buildInsights,
  buildSpendSeries,
  isCounted,
  isExpense,
} from '../src/utils/calculations.js'
import { allocateByWeights, formatINR, parseRupeeInput, rupees, sumPaise } from '../src/utils/money.js'

let failures = 0
function check(label, actual, expected) {
  const ok = Object.is(actual, expected)
  if (!ok) failures += 1
  const show = (v) => (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) >= 100 ? `${v} (${formatINR(v)})` : String(v))
  console.log(`${ok ? '✓' : '✗'} ${label}: ${show(actual)}${ok ? '' : `  — expected ${show(expected)}`}`)
}

const summary = buildBudgetSummary({
  allowance: MOCK_SETTINGS.monthlyAllowance,
  categories: MOCK_CATEGORIES,
  transactions: MOCK_TRANSACTIONS,
  cycle: MOCK_CYCLE,
})
const byId = Object.fromEntries(summary.categories.map((c) => [c.id, c]))

console.log('\n— Totals')
check('Allowance', summary.allowance, rupees(10000))
check('Total allocated', summary.totalAllocated, rupees(10000))
check('Unallocated', summary.unallocated, 0)
check('Total spent', summary.totalSpent, rupees(4800))
check('Wallet balance', summary.walletBalance, rupees(5200))
check('Savings allocated', summary.savingsAllocated, rupees(1000))
check('Spendable remaining', summary.spendableRemaining, rupees(4200))
check('Counted expenses', summary.transactionCount, 21)

console.log('\n— Cross-checks')
const sumOfCategorySpend = sumPaise(summary.spendableCategories.map((c) => c.spent))
check('Σ category spend = total spent', sumOfCategorySpend, summary.totalSpent)
const sumOfRemaining = sumPaise(summary.spendableCategories.map((c) => c.remaining))
check('Σ category remaining = spendable remaining', sumOfRemaining, summary.spendableRemaining)
const ledger = sumPaise(MOCK_TRANSACTIONS.filter((t) => isCounted(t) && isExpense(t)).map((t) => t.amount))
check('Ledger sum = total spent', ledger, summary.totalSpent)
check('All amounts are integers', MOCK_TRANSACTIONS.every((t) => Number.isSafeInteger(t.amount)), true)
check('All tx dates inside cycle', MOCK_TRANSACTIONS.every((t) => t.date >= MOCK_CYCLE.start && t.date <= MOCK_CYCLE.today), true)
check('All tx categories exist', MOCK_TRANSACTIONS.every((t) => byId[t.categoryId]), true)

console.log('\n— Categories')
for (const [id, alloc, spent, status] of [
  ['food', 3000, 2400, 'fast'],
  ['projects', 2000, 800, 'safe'],
  ['travel', 1500, 800, 'on-track'],
  ['stationery', 1000, 450, 'safe'],
  ['shopping', 1500, 350, 'safe'],
  ['savings', 1000, 0, 'safe'],
]) {
  check(`${id} allocated`, byId[id].allocated, rupees(alloc))
  check(`${id} spent`, byId[id].spent, rupees(spent))
  check(`${id} status`, byId[id].status, status)
}
check('Food consumed %', byId.food.consumedPct, 80)
check('Food remaining', byId.food.remaining, rupees(600))

console.log('\n— Budget Guard example (₹500 on Food)')
const guard = assessPurchaseImpact({ stats: byId.food, amount: rupees(500), progress: summary.progress, cycle: MOCK_CYCLE, warnThreshold: 80 })
check('Remaining before', guard.remainingBefore, rupees(600))
check('Remaining after', guard.remainingAfter, rupees(100))
check('Consumed before %', guard.consumedBefore, 80)
check('Level', guard.level, 'warning')
check('Should warn', guard.shouldWarn, true)
check('Can always proceed', guard.canProceed, true)

console.log('\n— Money helpers')
check('parseRupeeInput("2,400")', parseRupeeInput('2,400'), 240000)
check('parseRupeeInput("99.5")', parseRupeeInput('99.5'), 9950)
check('parseRupeeInput("0.1") + ("0.2")', parseRupeeInput('0.1') + parseRupeeInput('0.2'), 30)
check('parseRupeeInput("12.345") rejected', parseRupeeInput('12.345'), null)
const split = allocateByWeights(rupees(9000), [42, 28, 21, 14, 14])
check('allocateByWeights sums exactly', sumPaise(split), rupees(9000))
check('formatINR Indian grouping', formatINR(rupees(150000)), '₹1,50,000')

console.log('\n— Insights & series')
const insights = buildInsights(summary, MOCK_CYCLE)
for (const i of insights) console.log(`  [${i.severity}] ${i.title} — ${i.body}`)
const series = buildSpendSeries({ transactions: MOCK_TRANSACTIONS, cycle: MOCK_CYCLE, spendableAllocated: summary.spendableAllocated })
check('Series length', series.length, 30)
check('Series actual on day 16 = total spent', series[15].actual, summary.totalSpent)
check('Series projected on day 30 = projected spend', series[29].projected, summary.projectedSpend)
console.log(`  Goals saved: ${formatINR(sumPaise(MOCK_GOALS.map((g) => g.saved)))} across ${MOCK_GOALS.length} goals`)

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
