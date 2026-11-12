/*
 * Live Copilot test against a running server with a real NEBIUS_API_KEY.
 *   npm run dev              (terminal 1; add AI_DEBUG=true to .env to see rejected sentences)
 *   npm run test:chat-live   (terminal 2)
 * Passes only if every question is answered by Nebius (source=nebius), the text is properly
 * spaced, and weekly/monthly figures agree with the server's deterministic analysis.
 */
import 'dotenv/config'
import { formatINR } from '../src/lib/money.js'
import { contradictsVerdict, mislabelsPeriod, normalizeText, overstatesWindowLimit, periodSets, splitSentences } from '../src/services/chatService.js'

const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}/api`
const QUESTIONS = [
  'Can I spend ₹2,000 this week without affecting my project budget?',
  'Can I spend ₹1,000 this week?',
  'Where is most of my money going this month?',
  'Can I afford ₹500 on food today?',
  'Can I spend ₹5,000 on shopping this month?',
  'How am I doing on my savings goals?',
]
const HINTS = {
  disabled: 'Set NEBIUS_API_KEY and NEBIUS_MODEL in server/.env and restart the server.',
  http: 'Nebius returned an error: see the [ai:chat] line in the server terminal (wrong model id or key?).',
  timeout: 'Nebius was too slow: raise NEBIUS_TIMEOUT_MS or choose a smaller model.',
  network: 'Server could not reach api.tokenfactory.nebius.com.',
  invalid_json: 'Model did not return JSON: choose an *-Instruct model.',
  invalid_output: 'Model JSON had the wrong shape: set AI_DEBUG=true to see the keys it returned.',
  ungrounded: 'Model quoted ₹ figures not in your data: set AI_DEBUG=true to see them.',
  contradiction: "Model's yes/no disagreed with the calculated verdict.",
  inconsistent: 'Model mixed up the weekly limit and the monthly budget: set AI_DEBUG=true to see the sentence.',
}

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
  const data = await res.json()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data?.error?.message}`)
  return data
}
const rupees = (text) => [...String(text).matchAll(/₹\s*([\d,]+(?:\.\d{1,2})?)/g)].map((m) => m[1])

const { token } = await call('POST', '/auth/login', null, { email: process.env.DEMO_EMAIL ?? 'demo@pockit.app', password: process.env.DEMO_PASSWORD ?? 'Pockit@123' })
const status = await call('GET', '/ai/status', token)
console.log('AI status:', status)
check('Nebius is enabled on the server', status.enabled === true, status.enabled ? `model ${status.model}` : HINTS.disabled)

const history = []
for (const message of QUESTIONS) {
  const t = Date.now()
  const reply = await call('POST', '/ai/chat', token, { message, history: history.slice(-6) })
  console.log(`\nQ: ${message}\n[chat] source=${reply.source} model=${reply.model}${reply.reason ? ` reason=${reply.reason}` : ''} (${Date.now() - t} ms)\n  ${reply.text}${reply.tip ? `\n  Tip: ${reply.tip}` : ''}`)
  check('answered by Nebius', reply.source === 'nebius', reply.source === 'nebius' ? '' : HINTS[reply.reason] ?? reply.notice)
  check('answer is non-empty', typeof reply.text === 'string' && reply.text.length > 0, `₹ figures: ${rupees(reply.text).join(', ') || 'none'}`)
  check('advisory, never blocking', !/\b(blocked|forbidden|not allowed)\b/i.test(reply.text))
  check('properly spaced', normalizeText(reply.text) === reply.text && (!reply.tip || normalizeText(reply.tip) === reply.tip))
  const a = reply.analysis
  if (a) {
    const fmt = formatINR
    console.log(`  analysis: ${a.verdict} | weekly limit ${fmt(a.weeklyLimitPaise)} | left this month ${fmt(a.monthlyRemainingPaise)} -> ${fmt(a.monthlyLeftAfterPaise)} after`)
    check('weekly limit never exceeds monthly remaining', a.weeklyLimitPaise <= a.monthlyRemainingPaise)
    check('answer agrees with the calculated verdict', !contradictsVerdict(reply.text, a.verdict))
    const neutral = (p) => p !== a.amountPaise
    const sets = periodSets([a.weeklyLimitPaise].filter(neutral), [a.monthlyRemainingPaise, a.monthlyLeftAfterPaise].filter(neutral))
    const bad = splitSentences(reply.text).filter((sentence) => mislabelsPeriod(sentence, sets))
    check('weekly and monthly figures labelled correctly', bad.length === 0, bad.join(' | '))
    // Regression: a week question that fits must state BOTH the safe weekly limit and the monthly remaining.
    const said = (p, re) => splitSentences(reply.text).some((x) => x.includes(fmt(p)) && re.test(x))
    if (a.window === 'week' && a.verdict !== 'does_not_fit') check('states the safe weekly limit', said(a.weeklyLimitPaise, /\bweek(ly)?\b/i), fmt(a.weeklyLimitPaise))
    check('states what is left for the rest of the month', said(a.monthlyRemainingPaise, /\bmonth(ly)?\b/i), fmt(a.monthlyRemainingPaise))
    if (a.verdict === 'fits_but_tight' && a.window !== 'month') {
      // Expected values come from the server's analysis for THIS data, never hardcoded.
      const ss = splitSentences(reply.text)
      // Compare with the limit for the window asked about (this week, or today).
      const periodRe = a.window === 'week' ? /\bweek(ly)?\b|\bpace\b|\blimit\b/i : /\btoday\b|\bpace\b|\blimit\b/i
      check(`explains the amount exceeds the safe pace for ${a.window === 'week' ? 'this week' : 'today'}`, ss.some((x) => /\b(more than|over|above|exceed\w*|beyond|past|ahead of)\b/i.test(x) && (x.includes(fmt(a.limitPaise)) || periodRe.test(x))), fmt(a.limitPaise))
      check('states what would be left after spending', said(a.monthlyLeftAfterPaise, /./), fmt(a.monthlyLeftAfterPaise))
      check('never implies the amount is safe within that limit', !ss.some((x) => overstatesWindowLimit(x, a)))
    }
    if (reply.notice) console.log(`  notice: ${reply.notice}`)
  }
  history.push({ role: 'user', text: message }, { role: 'assistant', text: reply.text })
}

console.log(failures === 0 ? '\nAll live chat checks passed (source=nebius).' : `\n${failures} check(s) failed.`)
process.exitCode = failures === 0 ? 0 : 1
