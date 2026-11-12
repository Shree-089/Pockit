/*
 * Offline tests for the AI safety layer (no Nebius key or server needed).
 * Usage: npm run test:ai
 */
import { extractJson } from '../src/lib/nebiusClient.js'
import { allowedAmountSet, extractRupeeAmounts, isGrounded } from '../src/lib/grounding.js'
import { allocationOutput, chatOutput, insightsOutput } from '../src/validation/aiSchemas.js'
import { normalizeAllocation } from '../src/services/aiService.js'
import { AiUnavailableError } from '../src/lib/nebiusClient.js'
import { analyseQuestion, answerQuestion, askAssistant, checkPeriods, completeAnswer, loadChatData, overstatesWindowLimit, contradictsVerdict, groundSentences, mislabelsPeriod, normalizeText, periodSets, splitSentences } from '../src/services/chatService.js'
import { getSpendingIntelligence } from '../src/services/intelligenceService.js'
import { getSummary } from '../src/services/financeService.js'
import { formatINR } from '../src/lib/money.js'
import { pool } from '../src/db/pool.js'

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(`${ok ? '✓' : '✗'} ${label}: ${JSON.stringify(actual)}${ok ? '' : `  (expected ${JSON.stringify(expected)})`}`)
}
const throws = (fn) => {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

console.log('— JSON extraction')
check('plain JSON', extractJson('{"a":1}'), { a: 1 })
check('fenced JSON with prose', extractJson('Sure!\n```json\n{"a":2}\n```\nHope it helps'), { a: 2 })
check('reasoning tags stripped', extractJson('<think>let me think {x}</think>{"a":3}'), { a: 3 })
check('garbage rejected', throws(() => extractJson('no json here')), true)

console.log('\n— Output validation')
const good = {
  summary: 'Food gets the most because you eat out often.',
  categories: [
    { name: 'Food & Dining', amount_rupees: 3200.4, icon: 'utensils', reason: 'You eat out.' },
    { name: 'Projects', amount_rupees: 2000, icon: 'rocket', reason: 'Projects.' },
    { name: 'Travel', amount_rupees: 1500, reason: 'Trips home.' },
    { name: 'Savings', amount_rupees: 1000, reason: 'Should be removed by the server.' },
  ],
}
const parsed = allocationOutput.safeParse(good)
check('valid allocation accepted', parsed.success, true)
check('unknown icon replaced', parsed.data.categories[1].icon, 'wallet')
check('negative amount rejected', allocationOutput.safeParse({ ...good, categories: [{ name: 'A1', amount_rupees: -5, reason: 'x' }, good.categories[0]] }).success, false)
check('single category rejected', allocationOutput.safeParse({ summary: 'x', categories: [good.categories[0]] }).success, false)
check('chat output needs answer', chatOutput.safeParse({ tip: 'x' }).success, false)
check('insights max 4 recommendations', insightsOutput.safeParse({ headline: 'h', recommendations: Array(5).fill({ title: 't', body: 'b' }) }).success, false)

console.log('\n— Allocation normalisation (server decides the money)')
const norm = normalizeAllocation(parsed.data, { monthlyAmount: 1000000, savingsAmount: 100000 })
const total = norm.categories.reduce((a, c) => a + c.allocated, 0)
check('total equals allowance exactly', total, 1000000)
check('model "Savings" dropped, server savings added once', norm.categories.filter((c) => c.kind === 'savings').map((c) => c.allocated), [100000])
check('all amounts are integer paise in ₹50 steps', norm.categories.filter((c) => c.kind === 'spending').every((c) => Number.isSafeInteger(c.allocated) && c.allocated % 5000 === 0), true)
const inflated = normalizeAllocation({ ...parsed.data, categories: parsed.data.categories.map((c) => ({ ...c, amount_rupees: c.amount_rupees * 7 })) }, { monthlyAmount: 1000000, savingsAmount: 100000 })
check('over-budget model output scaled down to fit', inflated.categories.reduce((a, c) => a + c.allocated, 0), 1000000)
check('adjustment flagged', inflated.adjusted, true)

console.log('\n— Grounding (no invented figures)')
check('extract ₹ amounts', extractRupeeAmounts('You have ₹2,400 left, about Rs. 42.85/day and INR 100'), [240000, 4285, 10000])
const allowed = allowedAmountSet([240000, 4285])
check('known figures accepted', isGrounded('₹2,400 left, ₹42.85/day', allowed), true)
check('rounded figure accepted', isGrounded('about ₹43 a day', allowed), true)
check('invented figure rejected', isGrounded('Your balance is ₹9,999', allowed), false)

console.log('\n— Verdict consistency (server decides, model phrases)')
check('"Yes" rejected when it does not fit', contradictsVerdict('Yes, go ahead!', 'does_not_fit'), true)
check('"No" rejected when it fits comfortably', contradictsVerdict('No, that is too much.', 'fits_comfortably'), true)
check('matching answer accepted', contradictsVerdict('Yes, that fits within your budget.', 'fits_comfortably'), false)
check('"No" rejected when it fits but tight', contradictsVerdict('No, you can\'t afford that.', 'fits_but_tight'), true)
check('tight verdict allows nuance', contradictsVerdict('You can, but it will be tight.', 'fits_but_tight'), false)

console.log('\n— Copilot answer grounding (sentence level)')
check('sentence split keeps decimals and Rs.', splitSentences('Yes, but tight. You have ₹1,499.89 left. Rs. 500 is fine!'), ['Yes, but tight.', 'You have ₹1,499.89 left.', 'Rs. 500 is fine!'])
const chatAllowed = allowedAmountSet([200000, 149989, 100000])
const g1 = groundSentences('Yes, but it is tight. ₹2,000 is above the ₹1,499.89 comfortable this week. That is roughly ₹143 a day.', chatAllowed)
check('invented derived figure removed, rest kept', g1.text, 'Yes, but it is tight. ₹2,000 is above the ₹1,499.89 comfortable this week.')
check('verdict sentence survived', g1.firstDropped, false)
const g2 = groundSentences('Your balance is ₹9,999 so yes. Enjoy!', chatAllowed)
check('fabricated opening sentence flagged', g2.firstDropped, true)
check('chat tip of wrong type becomes null', chatOutput.parse({ answer: 'Yes.', tip: { x: 1 } }).tip, null)
check('chat empty tip becomes null', chatOutput.parse({ answer: 'Yes.', tip: '' }).tip, null)

console.log('\n— Copilot formatting (missing spaces)')
check('comma before word', normalizeText('Yes,but it is tight.'), 'Yes, but it is tight.')
check('full stop before ₹', normalizeText('tight.₹2,000 is a lot.'), 'tight. ₹2,000 is a lot.')
check('full stop before capital', normalizeText('this week.You would have more.'), 'this week. You would have more.')
check('amount glued to word', normalizeText('₹1,000left for ₹300/day'), '₹1,000 left for ₹300/day')
check('word glued to amount', normalizeText('a budget of₹1,200 (₹50 extra)'), 'a budget of ₹1,200 (₹50 extra)')
check('percent glued to word', normalizeText('75%used'), '75% used')
check('space before punctuation removed', normalizeText('left , for you .'), 'left, for you.')
check('odd whitespace normalised', normalizeText('₹2,000 is fine​.\n\nOk'), '₹2,000 is fine. Ok')
check('decimals, Indian grouping and times untouched', normalizeText('₹1,499.89 and ₹1,00,000 at 10:30.'), '₹1,499.89 and ₹1,00,000 at 10:30.')
check('digits never change', extractRupeeAmounts(normalizeText('Yes,but.₹2,000left;₹1,499.89.Of₹71.42/day')), [200000, 149989, 7142])
check('glued text splits into real sentences after normalising', splitSentences(normalizeText('Yes,but tight.₹2,000 is over.You have ₹1,000left.')).length, 3)

console.log('\n— Weekly vs monthly wording')
const sets = periodSets([149900, 50100], [300000, 100000])
check('monthly figure called weekly is flagged', mislabelsPeriod('You will have ₹1,000 left this week.', sets), true)
check('weekly limit called monthly is flagged', mislabelsPeriod('Your monthly budget is ₹1,499.', sets), true)
check('correct weekly wording passes', mislabelsPeriod('You can safely spend ₹1,499 this week.', sets), false)
check('correct monthly wording passes', mislabelsPeriod('₹3,000 is left for the rest of this month, so ₹1,000 remains.', sets), false)
check('sentence naming both periods passes', mislabelsPeriod('That is above the ₹1,499 weekly limit but within the ₹3,000 left this month.', sets), false)
check('exact monthly figure outranks a rounded weekly one', mislabelsPeriod('You have ₹600 left this week.', periodSets([59997], [60000])), true)
check('ambiguous figure (in both lists) is not flagged', mislabelsPeriod('₹500 this week.', periodSets([50000], [50000])), false)
const cp = checkPeriods('Yes, but it is tight. You can safely spend ₹1,499 this week. You will have ₹1,000 left this week.', sets)
check('mislabelled sentence dropped, others kept', cp.text, 'Yes, but it is tight. You can safely spend ₹1,499 this week.')

console.log('\n— Regression: "Can I spend ₹2,000 this week without affecting my project budget?"')
const REGRESSION_Q = 'Can I spend ₹2,000 this week without affecting my project budget?'

/*
 * Controlled data reproducing the reported scenario shape: a 5-day week, a weekly pace below ₹2,000
 * and a monthly non-project amount above it. Expected figures are NOT written here: every check
 * derives them from the analysis object that chatService itself produces from this data.
 */
function regressionFixture() {
  const cat = (id, name, allocated, spent, safeWeek, safeDay) => ({
    id, name, status: 'on-track', risk: 'low', allocatedPaise: allocated, spentPaise: spent, remainingPaise: allocated - spent,
    consumedPct: Math.round((spent / allocated) * 100), dailyPacePaise: safeDay, safeDailyLimitPaise: safeDay, safeThisWeekPaise: safeWeek,
    projectedPaise: spent, projectedOverspendPaise: 0, projectedSurplusPaise: 0, depletionDate: null, daysLeftInBudget: null, topMerchant: null,
  })
  const categories = [
    cat('c-food', 'Food & Dining', 300000, 240000, 16000, 3200),
    cat('c-proj', 'Projects & Learning', 200000, 80000, 30000, 6000),
    cat('c-travel', 'Travel & Commute', 150000, 100000, 14000, 2800),
    cat('c-stat', 'Stationery & Essentials', 100000, 70000, 8300, 1660),
    cat('c-shop', 'Shopping & Personal', 150000, 70000, 19500, 3900),
  ]
  const sum = (key) => categories.reduce((a, c) => a + c[key], 0)
  return {
    intel: {
      cycle: { start: '2026-11-01', end: '2026-11-30', today: '2026-11-12' },
      progress: { daysTotal: 30, daysElapsed: 12, daysRemaining: 18, elapsedRatio: 0.4, elapsedPct: 40 },
      overview: {
        allowancePaise: 1000000, spendableAllocatedPaise: sum('allocatedPaise'), totalSpentPaise: sum('spentPaise'), walletBalancePaise: 1000000 - sum('spentPaise'),
        spendableRemainingPaise: sum('remainingPaise'), savingsRemainingPaise: 100000, dailyAveragePaise: 46666, evenPaceDailyPaise: 30000,
        safeDailyLimitPaise: sum('safeDailyLimitPaise'), safeThisWeekPaise: sum('safeThisWeekPaise'), daysLeftInWeek: 5, projectedSpendPaise: 1000000,
        projectedSurplusPaise: -100000, velocityRatio: 1.5, last7DaysSpentPaise: 250000, previous7DaysSpentPaise: 200000, trendPct: 25, healthScore: 70, healthLabel: 'Needs Attention',
      },
      categories,
      risks: [],
      recommendations: [],
    },
    summary: { categories: [], progress: { daysTotal: 30, daysElapsed: 12, daysRemaining: 18, elapsedRatio: 0.4, elapsedPct: 40 }, cycle: { start: '2026-11-01', end: '2026-11-30', today: '2026-11-12' } },
    goals: [],
    transactions: [],
  }
}

const EXCEED_RE = /\b(more than|over|above|exceed\w*|beyond|past|ahead of)\b/i
const fake = (answer, tip = null) => async () => ({ json: { answer, tip }, model: 'test/fake' })

async function regressionSuite(label, data) {
  const t = (name) => `[${label}] ${name}`
  const qa = analyseQuestion(REGRESSION_Q, data.intel, data.summary)
  const A = formatINR(qa.amountPaise)
  const W = formatINR(qa.weeklyLimitPaise)
  const M = formatINR(qa.monthlyRemainingPaise)
  const L = formatINR(qa.monthlyLeftAfterPaise)
  const from = qa.protect ? `outside ${qa.mentioned.join(', ')}` : ''
  const known = new Set([qa.amountPaise, qa.weeklyLimitPaise, qa.monthlyRemainingPaise, qa.monthlyLeftAfterPaise, qa.overLimitByPaise])
  const notInData = (p) => p + 137 // ₹1.37 off a real figure: plausible-looking, never in the data

  check(t('analysis: tight verdict, pace < amount ≤ monthly, leftover = monthly − amount, week days from data'), [
    qa.verdict, qa.weeklyLimitPaise < qa.amountPaise, qa.amountPaise <= qa.monthlyRemainingPaise,
    qa.monthlyLeftAfterPaise === qa.monthlyRemainingPaise - qa.amountPaise, qa.daysInWeekIncludingToday === data.intel.overview.daysLeftInWeek,
  ], ['fits_but_tight', true, true, true, true])

  /** The four points the answer must explain, plus safety checks. All expected values come from `qa`. */
  const explains = (reply) => {
    const ss = splitSentences(reply.text)
    const has = (paise, re) => ss.some((x) => extractRupeeAmounts(x).includes(paise) && (!re || re.test(x)))
    return {
      weeklyPace: has(qa.weeklyLimitPaise, /\bweek(ly)?\b/i),
      exceedsPace: ss.some((x) => EXCEED_RE.test(x) && (extractRupeeAmounts(x).includes(qa.weeklyLimitPaise) || /\bweek(ly)?\b|\bpace\b|\blimit\b/i.test(x))),
      monthlyLeft: has(qa.monthlyRemainingPaise, /\bmonth(ly)?\b/i),
      leftAfter: has(qa.monthlyLeftAfterPaise),
      opening: /^Yes,? but\b/i.test(reply.text),
      neverSafeWithinWeek: !ss.some((x) => overstatesWindowLimit(x, qa)),
      spacing: normalizeText(reply.text) === reply.text,
      onlyKnownFigures: extractRupeeAmounts(reply.text).every((p) => known.has(p)),
    }
  }
  const allTrue = (o) => Object.values(o).every(Boolean)
  const ALL = { weeklyPace: true, exceedsPace: true, monthlyLeft: true, leftAfter: true, opening: true, neverSafeWithinWeek: true, spacing: true, onlyKnownFigures: true }
  const run = (answer, tip) => answerQuestion(data, REGRESSION_Q, [], { debug: true, complete: fake(answer, tip) })

  const complete = await run(`Yes, but it's tight. Your safe spending pace this week is ${W}, so ${A} goes over it. ${M} is left ${from} for the rest of this month, so ${A} would still fit there and leave ${L}.`)
  check(t('complete grounded answer: explains all four points'), explains(complete), ALL)
  check(t('complete grounded answer: Nebius, nothing added, no notice'), [complete.source, complete.debug.added, complete.notice ?? null], ['nebius', [], null])

  const glued = await run(`Yes,but it's tight.Your safe pace this week is ${W},so ${A} exceeds it.${M} is left ${from} for the rest of this month,so ${A} fitswithin those fundsand leaves ${L}.Plan fundslater.`)
  check(t('glued words and punctuation repaired ("fits within", "funds and", "funds later")'), [/fits within/.test(glued.text), /funds and/.test(glued.text), /funds later/.test(glued.text), /fitswithin|fundsand|fundslater|,so|\.[A-Z₹]/.test(glued.text)], [true, true, true, false])
  check(t('glued answer: still complete, no notice'), [allTrue(explains(glued)), glued.debug.added.length, glued.notice ?? null], [true, 0, null])

  const roundedUp = await run(`Yes, but it's tight. You can safely spend ${formatINR(notInData(qa.weeklyLimitPaise))} this week. ${M} is left ${from} for the rest of this month, so ${A} would leave ${L}.`)
  check(t('weekly figure not in data is removed and the exceed-the-pace sentence restored'), [
    roundedUp.text.includes(formatINR(notInData(qa.weeklyLimitPaise))), roundedUp.debug.added.length, allTrue(explains(roundedUp)), roundedUp.source, Boolean(roundedUp.notice),
  ], [false, 1, true, 'nebius', true])

  const badMonth = await run(`Yes, but it's tight: ${A} is more than the ${W} you can safely spend this week. You'd have about ${formatINR(notInData(qa.monthlyRemainingPaise))} left this month.`)
  check(t('monthly figure not in data is removed and the monthly sentence restored'), [badMonth.debug.unknownAmounts, allTrue(explains(badMonth)), Boolean(badMonth.notice)], [[formatINR(notInData(qa.monthlyRemainingPaise))], true, true])

  const verdictOnly = await run("Yes, but it's tight.")
  check(t('verdict-only answer: both deterministic sentences added after the verdict'), [splitSentences(verdictOnly.text)[0], verdictOnly.debug.added.length, allTrue(explains(verdictOnly))], ["Yes, but it's tight.", 2, true])

  const leftMissing = await run(`Yes, but it's tight. ${A} is more than your safe pace of ${W} this week. ${M} is left ${from} for the rest of this month.`)
  check(t('missing "would leave" figure: one sentence added with it'), [leftMissing.debug.added.length, leftMissing.debug.added[0]?.includes(L), allTrue(explains(leftMissing))], [1, true, true])

  const overClaim = await run(`Yes, but it's tight. You can safely spend ${A} this week. ${M} is left ${from} for the rest of this month, so ${A} would leave ${L}.`)
  check(t('"you can safely spend <amount> this week" is removed, never shown'), [overClaim.debug.removedOverstated.length, allTrue(explains(overClaim))], [1, true])

  const overClaimFirst = await run(`Yes, but ${A} is within your weekly limit.`)
  check(t('over-claim in the verdict sentence falls back to rules'), [overClaimFirst.source, overClaimFirst.reason, allTrue(explains(overClaimFirst))], ['rules', 'inconsistent', true])

  const fabricated = await run(`Yes, but your wallet has ${formatINR(notInData(qa.monthlyRemainingPaise * 3))} so it is fine.`)
  check(t('invented figure in the verdict sentence falls back to rules'), [fabricated.source, fabricated.reason], ['rules', 'ungrounded'])

  const mixed = await run(`Yes, but you only have ${M} left this week.`)
  check(t('monthly figure called weekly in the verdict sentence falls back to rules'), [mixed.source, mixed.reason], ['rules', 'inconsistent'])

  const rules = await answerQuestion(data, REGRESSION_Q, [], { complete: async () => { throw new AiUnavailableError('down', { reason: 'http' }) } })
  check(t('rule-based fallback explains all four points'), explains(rules), ALL)
}

await regressionSuite('fixture', regressionFixture())

console.log('\n— Weekly vs monthly consistency on real data (needs `npm run db:seed`)')
try {
  const { rows } = await pool.query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [process.env.DEMO_EMAIL ?? 'demo@pockit.app'])
  if (!rows[0]) throw new Error('demo user not found')
  const userId = rows[0].id
  const [intel, summary] = await Promise.all([getSpendingIntelligence(userId), getSummary(pool, userId)])
  const cases = [
    'Can I spend ₹2,000 this week without affecting my project budget?',
    'Can I spend ₹1,000 this week?',
    'Can I spend ₹5,000 on shopping this month?',
    'Can I afford ₹100 on food today?',
    'Can I spend ₹3,500 this week?',
  ]
  for (const question of cases) {
    const a = analyseQuestion(question, intel, summary)
    const expected = a.amountPaise <= a.limitPaise ? 'fits_comfortably' : a.amountPaise <= a.monthlyRemainingPaise ? 'fits_but_tight' : 'does_not_fit'
    const ok =
      a.weeklyLimitPaise <= a.monthlyRemainingPaise &&
      a.monthlyLeftAfterPaise === a.monthlyRemainingPaise - a.amountPaise &&
      a.verdict === expected &&
      (a.window !== 'week' || a.limitPaise === a.weeklyLimitPaise) &&
      (a.window !== 'month' || a.limitPaise === a.monthlyRemainingPaise)
    check(`analysis consistent: "${question}"`, ok ? a.verdict : { a }, ok ? a.verdict : 'consistent')
  }
  const tight = analyseQuestion(cases[0], intel, summary)
  check('weekly limit is a whole-rupee pace figure, separate from monthly remaining', [tight.weeklyLimitPaise % 100, tight.weeklyLimitPaise < tight.monthlyRemainingPaise], [0, true])

  // Rule-based answers (model call forced to fail) must quote each figure with the right period.
  const rulesOnly = async () => {
    throw new AiUnavailableError('forced for unit test', { reason: 'disabled' })
  }
  const OPENING_RE = { fits_comfortably: /^Yes\b/, fits_but_tight: /^Yes,? but\b/i, does_not_fit: /^Not really\b/i }
  const statesBoth = (reply) => {
    const a = reply.analysis
    const sentences = splitSentences(reply.text)
    const weeklyOk = a.window !== 'week' || a.verdict === 'does_not_fit' || sentences.some((s) => s.includes(formatINR(a.weeklyLimitPaise)) && /\bweek(ly)?\b/i.test(s))
    const monthlyOk = sentences.some((s) => s.includes(formatINR(a.monthlyRemainingPaise)) && /\bmonth(ly)?\b/i.test(s))
    const openingOk = !contradictsVerdict(reply.text, a.verdict) && OPENING_RE[a.verdict].test(reply.text)
    const spacingOk = normalizeText(reply.text) === reply.text
    return { ok: weeklyOk && monthlyOk && openingOk && spacingOk, weeklyOk, monthlyOk, openingOk, spacingOk }
  }
  for (const question of cases.filter((c) => /₹/.test(c))) {
    const reply = await askAssistant(userId, question, [], { debug: true, complete: rulesOnly })
    const r = statesBoth(reply)
    check(`${reply.source} answer states weekly and monthly figures correctly: "${question}"`, r.ok, true)
    if (!r.ok) console.log('    diagnostics:', JSON.stringify({ ...r, text: reply.text, analysis: reply.analysis, debug: reply.debug }, null, 2))
  }

  console.log('\n— Regression on your database figures')
  const dbData = await loadChatData(userId)
  const dbVerdict = analyseQuestion(REGRESSION_Q, dbData.intel, dbData.summary).verdict
  if (dbVerdict === 'fits_but_tight') await regressionSuite('db', dbData)
  else console.log(`  (skipped: with your current data this question is "${dbVerdict}", not "fits_but_tight"; the fixture suite above covers it)`)
} catch (error) {
  console.log(`  (skipped: ${error.message})`)
}

await pool.end()
console.log(failures === 0 ? '\nAll AI unit checks passed.' : `\n${failures} check(s) failed.`)
process.exitCode = failures === 0 ? 0 : 1
