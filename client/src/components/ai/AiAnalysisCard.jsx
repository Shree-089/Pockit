import { AlertTriangle, Brain, Lightbulb, RotateCw, TrendingDown, TrendingUp } from 'lucide-react'
import { useAiInsights } from '../../hooks/useAiInsights.js'
import { formatINR } from '../../utils/money.js'
import { cx } from '../../utils/ui.js'
import AiSourceBadge from './AiSourceBadge.jsx'
import Button from '../common/Button.jsx'

const RISK_STYLE = { high: 'bg-error/10 text-error', medium: 'bg-warning/12 text-warning' }

/**
 * Spending intelligence from the server: deterministic numbers (velocity, risks, forecast)
 * plus a grounded AI narrative. `compact` shows just the headline for the dashboard.
 */
export default function AiAnalysisCard({ compact = false }) {
  const { status, data, error, reload } = useAiInsights()

  if (status === 'unsupported') {
    return compact ? null : (
      <section className="rounded-card bg-surface p-4 text-sm text-muted shadow-card">
        AI analysis needs the Pockit server. You&apos;re viewing offline demo data, so the insights below are calculated in the browser.
      </section>
    )
  }

  if (status === 'loading') {
    return (
      <section className="rounded-card bg-violet-soft/60 p-4 shadow-card" aria-busy="true">
        <div className="flex items-center gap-2 text-sm font-semibold text-indigo">
          <Brain className="size-4 animate-pulse" /> Pockit AI is analysing your spending…
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-3 w-4/5 animate-pulse rounded bg-lavender/30" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-lavender/30" />
        </div>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="rounded-card bg-surface p-4 shadow-card">
        <p className="flex items-center gap-2 text-sm text-error">
          <AlertTriangle className="size-4" /> Couldn&apos;t load AI analysis. {error}
        </p>
        <Button variant="ghost" size="sm" icon={RotateCw} className="mt-2" onClick={reload}>
          Try again
        </Button>
      </section>
    )
  }

  const { ai, intelligence } = data
  const o = intelligence.overview

  if (compact) {
    return (
      <section className="rounded-card bg-violet-soft/70 p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">Pockit AI insight</p>
          <AiSourceBadge source={ai.source} model={ai.model} />
        </div>
        <p className="mt-1 font-heading font-semibold text-ink">{ai.headline}</p>
        {ai.recommendations[0] && <p className="mt-1 text-sm text-muted">{ai.recommendations[0].body}</p>}
      </section>
    )
  }

  const trendUp = o.trendPct != null && o.trendPct > 0
  return (
    <section className="space-y-3 rounded-card bg-surface p-4 shadow-card">
      <header className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-10 place-items-center rounded-2xl bg-indigo text-white">
            <Brain className="size-5" />
          </span>
          <div>
            <h2 className="font-heading font-bold text-ink">AI spending review</h2>
            <p className="text-xs text-muted">From your real transactions · {intelligence.progress.daysRemaining} days left</p>
          </div>
        </div>
        <AiSourceBadge source={ai.source} model={ai.model} />
      </header>

      <p className="rounded-2xl bg-violet-soft/70 px-4 py-3 font-medium text-indigo">{ai.headline}</p>
      {ai.notice && <p className="text-xs text-muted">{ai.notice}</p>}

      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="Velocity" value={`${o.velocityRatio}×`} hint="vs even pace" warn={o.velocityRatio > 1.1} />
        <Metric label="Safe this week" value={formatINR(o.safeThisWeekPaise)} hint={`${o.daysLeftInWeek} days`} />
        <Metric
          label="Last 7 days"
          value={formatINR(o.last7DaysSpentPaise)}
          hint={o.trendPct == null ? 'no prior week' : `${trendUp ? '+' : ''}${o.trendPct}% vs week before`}
          warn={trendUp}
          icon={o.trendPct == null ? null : trendUp ? TrendingUp : TrendingDown}
        />
      </div>

      {intelligence.risks.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">Overspending risks</h3>
          <ul className="space-y-2">
            {intelligence.risks.map((r) => (
              <li key={r.categoryId} className="flex gap-2 text-sm">
                <span className={cx('h-fit shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', RISK_STYLE[r.level])}>{r.level}</span>
                <span className="text-ink">{r.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">Recommendations</h3>
        <ul className="space-y-2">
          {ai.recommendations.map((r) => (
            <li key={r.title} className="flex gap-2 rounded-2xl bg-bg p-3">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-royal" />
              <div>
                <p className="text-sm font-semibold text-ink">{r.title}</p>
                <p className="text-sm text-muted">{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={reload} className="flex items-center gap-1 text-xs font-semibold text-royal">
        <RotateCw className="size-3.5" /> Refresh analysis
      </button>
    </section>
  )
}

function Metric({ label, value, hint, warn, icon: Icon }) {
  return (
    <div className="rounded-2xl bg-bg px-2 py-2.5">
      <p className="text-[10px] text-muted">{label}</p>
      <p className={cx('flex items-center justify-center gap-1 font-heading text-sm font-bold', warn ? 'text-warning' : 'text-ink')}>
        {Icon && <Icon className="size-3.5" />}
        {value}
      </p>
      <p className="text-[10px] text-muted">{hint}</p>
    </div>
  )
}
