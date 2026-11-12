import { Wallet } from 'lucide-react'
import { formatINR } from '../../utils/money.js'

/** The indigo hero card on Home: wallet balance plus allowance / spent / savings. */
export default function WalletSummaryCard({ summary }) {
  const spentWidth = Math.min(100, summary.spentPct)
  const stats = [
    ['Allowance', summary.allowance],
    ['Spent', summary.totalSpent],
    ['Savings', summary.savingsAllocated],
  ]

  return (
    <section className="rounded-card bg-gradient-to-br from-indigo to-[#34397f] p-5 text-white shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wider text-white/70 uppercase">Wallet balance</p>
        <span className="grid size-9 place-items-center rounded-xl bg-white/10">
          <Wallet className="size-4" />
        </span>
      </div>
      <p className="mt-1 font-heading text-4xl font-bold">{formatINR(summary.walletBalance)}</p>
      <p className="text-sm text-white/70">
        {formatINR(summary.spendableRemaining)} left to spend · {formatINR(summary.savingsRemaining)} in savings
      </p>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={summary.spentPct} aria-valuemin={0} aria-valuemax={100} aria-label="Spending budget used">
        <div className="h-full rounded-full bg-lavender" style={{ width: `${spentWidth}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-white/70">
        {summary.spentPct}% of {formatINR(summary.spendableAllocated)} spending budget used · day {summary.progress.daysElapsed} of {summary.progress.daysTotal}
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-4">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] text-white/60">{label}</dt>
            <dd className="font-heading font-semibold">{formatINR(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
