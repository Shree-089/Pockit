import { Gauge } from 'lucide-react'
import { formatINR } from '../../utils/money.js'
import { toneFor } from '../../utils/ui.js'
import Card from '../common/Card.jsx'

/** Score ring + plain-language health summary. */
export default function BudgetHealthCard({ summary }) {
  const { health } = summary
  const tone = toneFor(health.tone)
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const flagged = health.fastCount + health.overCount

  return (
    <Card className="flex items-center gap-4">
      <div className="relative size-16 shrink-0">
        <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden="true">
          <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="6" className="stroke-line" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            stroke="currentColor"
            className={tone.text}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - health.score / 100)}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center font-heading text-lg font-bold">{health.score}</span>
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
          <Gauge className="size-3.5" /> Budget health
        </p>
        <p className={`font-heading text-lg font-bold ${tone.text}`}>{health.label}</p>
        <p className="text-xs text-muted">
          {flagged === 0 ? 'All categories on pace.' : `${flagged} ${flagged === 1 ? 'category needs' : 'categories need'} attention.`} Safe limit {formatINR(summary.safeDailyLimit)}/day.
        </p>
      </div>
    </Card>
  )
}
