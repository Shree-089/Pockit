/*
 * Live check of the AI features against a running server with a real NEBIUS_API_KEY.
 *   npm run dev            (terminal 1, with NEBIUS_API_KEY + NEBIUS_MODEL in .env)
 *   npm run test:ai-live   (terminal 2)
 * Prints which source answered each feature (nebius or rules) and checks the
 * financial invariants that must hold regardless of what the model says.
 */
import 'dotenv/config'

const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}/api`
let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`)
}
async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

const { token } = await call('POST', '/auth/login', null, { email: process.env.DEMO_EMAIL ?? 'demo@pockit.app', password: process.env.DEMO_PASSWORD ?? 'Pockit@123' })
const status = await call('GET', '/ai/status', token)
console.log('AI status:', status)
if (!status.enabled) console.log('⚠ NEBIUS_API_KEY / NEBIUS_MODEL not set: expect source "rules" everywhere.\n')

const t0 = Date.now()
const alloc = await call('POST', '/ai/budget-allocation', token, {
  monthlyAmount: '10000',
  savingsAmount: '1000',
  description: "I'm a college student living in a hostel. I spend around ₹100–150 on food when eating outside. I need money for college projects, stationery, occasional shopping and travelling home. I also want to save at least ₹1,000 every month.",
})
const total = alloc.categories.reduce((a, c) => a + c.allocated, 0)
console.log(`\n[allocation] source=${alloc.source} model=${alloc.model} (${Date.now() - t0} ms)\n  ${alloc.summary}`)
for (const c of alloc.categories) console.log(`  - ${c.name}: ₹${c.allocated / 100}  (${c.reason})`)
check('allocation total never exceeds allowance', total <= 1000000, `total ₹${total / 100}`)
check('allocation amounts are integer paise', alloc.categories.every((c) => Number.isSafeInteger(c.allocated) && c.allocated >= 0))

const t1 = Date.now()
const insights = await call('GET', '/ai/insights', token)
console.log(`\n[insights] source=${insights.ai.source} model=${insights.ai.model} (${Date.now() - t1} ms)\n  ${insights.ai.headline}`)
for (const r of insights.ai.recommendations) console.log(`  - ${r.title}: ${r.body}`)
const dash = await call('GET', '/dashboard', token)
check('intelligence uses real PostgreSQL totals', insights.intelligence.overview.totalSpentPaise === dash.totalSpent)

const t2 = Date.now()
const chat = await call('POST', '/ai/chat', token, { message: 'Can I spend ₹2,000 this week without affecting my project budget?' })
console.log(`\n[chat] source=${chat.source} model=${chat.model}${chat.reason ? ` reason=${chat.reason}` : ''} (${Date.now() - t2} ms)\n  ${chat.text}${chat.tip ? `\n  Tip: ${chat.tip}` : ''}`)
check('chat returned an answer', typeof chat.text === 'string' && chat.text.length > 0)
if (status.enabled) check('chat answered by Nebius', chat.source === 'nebius', chat.source === 'nebius' ? '' : `reason=${chat.reason}; run npm run test:chat-live for details`)

const food = dash.categories.find((c) => c.kind === 'spending')
const t3 = Date.now()
const guard = await call('POST', '/purchases/assess', token, { categoryId: food.id, amount: 50000, explain: true })
console.log(`\n[guard] risk=${guard.riskLevel} explanation source=${guard.explanationSource} (${Date.now() - t3} ms)\n  ${guard.explanation}`)
check('guard risk level is deterministic', ['safe', 'warning', 'high_risk'].includes(guard.riskLevel))
check('guard maths matches dashboard', guard.assessment.remainingBefore === food.remaining)
check('guard never blocks', guard.assessment.canProceed === true)

console.log(failures === 0 ? '\nAll live AI checks passed.' : `\n${failures} check(s) failed.`)
process.exitCode = failures === 0 ? 0 : 1
