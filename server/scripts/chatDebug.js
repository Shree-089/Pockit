/*
 * Shows exactly what Nebius returned for a Copilot question and what validation did with it.
 * Runs the chat service directly (no HTTP server needed) for the demo user.
 *   npm run ai:chat-debug
 *   npm run ai:chat-debug -- "Can I spend ₹1,000 this week?"
 * Prints the raw model answer, removed sentences (with the unknown ₹ figures), sentences Pockit
 * added from your data, the server's deterministic analysis, and the final reply.
 * Never prints the API key.
 */
import { pool } from '../src/db/pool.js'
import { env } from '../src/config/env.js'
import { askAssistant } from '../src/services/chatService.js'
import { formatINR } from '../src/lib/money.js'

const question = process.argv.slice(2).join(' ') || 'Can I spend ₹2,000 this week without affecting my project budget?'
try {
  const { rows } = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [env.demoEmail])
  if (!rows[0]) throw new Error(`Demo user ${env.demoEmail} not found: run npm run db:seed`)
  console.log(`Model: ${env.nebius.enabled ? env.nebius.model : '(AI disabled: set NEBIUS_API_KEY and NEBIUS_MODEL)'}\nQ: ${question}\n`)
  const reply = await askAssistant(rows[0].id, question, [], { debug: true })
  const a = reply.analysis
  if (a) {
    console.log('Deterministic analysis:')
    console.log(`  verdict ${a.verdict} | funds: ${a.fundsConsidered}`)
    console.log(`  safe weekly limit ${formatINR(a.weeklyLimitPaise)} | left this month ${formatINR(a.monthlyRemainingPaise)} | left after ${formatINR(a.monthlyLeftAfterPaise)}\n`)
  }
  console.log(`Source: ${reply.source}${reply.reason ? ` (reason: ${reply.reason})` : ''}`)
  console.log('Debug:', JSON.stringify(reply.debug, null, 2))
  console.log(`\nFinal reply:\n  ${reply.text}${reply.tip ? `\n  Tip: ${reply.tip}` : ''}${reply.notice ? `\n  Notice: ${reply.notice}` : ''}`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
