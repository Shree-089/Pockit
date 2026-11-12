import { AlertTriangle, Info, Sparkles, TrendingUp } from 'lucide-react'
import { cx } from '../../utils/ui.js'
import Button from '../common/Button.jsx'

const KIND_ICON = { depletion: AlertTriangle, velocity: TrendingUp, projection: TrendingUp, rebalance: Sparkles }
const SEVERITY = {
  warning: { box: 'bg-warning/12 text-warning', label: 'Needs attention' },
  error: { box: 'bg-error/10 text-error', label: 'Over budget' },
  info: { box: 'bg-violet-soft text-indigo', label: 'Insight' },
}

/**
 * One insight from buildInsights(). Lavender = AI content; orange/red only for real warnings.
 *   onAction: called for actionable insights (e.g. rebalance)
 *   onDismiss: hides the card
 */
export default function InsightCard({ insight, onAction, onDismiss, actionLoading, compact = false }) {
  const Icon = KIND_ICON[insight.kind] ?? Info
  const sev = SEVERITY[insight.severity] ?? SEVERITY.info

  return (
    <article className={cx('rounded-card p-4 shadow-card', insight.kind === 'rebalance' || compact ? 'bg-violet-soft/70' : 'bg-surface')}>
      <div className="flex gap-3">
        <span className={cx('grid size-10 shrink-0 place-items-center rounded-2xl', sev.box)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">{compact ? 'Pockit AI insight' : sev.label}</p>
          <h3 className="font-heading font-semibold text-ink">{insight.title}</h3>
          <p className="mt-1 text-sm text-muted">{insight.body}</p>
        </div>
      </div>
      {(onAction || onDismiss) && (
        <div className="mt-3 flex justify-end gap-2">
          {onDismiss && (
            <Button variant="ghost" size="sm" onClick={() => onDismiss(insight.id)}>
              Dismiss
            </Button>
          )}
          {onAction && insight.action && (
            <Button size="sm" loading={actionLoading} onClick={() => onAction(insight)}>
              Apply
            </Button>
          )}
        </div>
      )}
    </article>
  )
}
