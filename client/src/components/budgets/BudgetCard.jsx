import { formatINR } from '../../utils/money.js'
import { STATUS_META } from '../../utils/calculations.js'
import CategoryIcon from '../common/CategoryIcon.jsx'
import ProgressBar from '../common/ProgressBar.jsx'
import StatusBadge from '../common/StatusBadge.jsx'

/**
 * Shows one category's stats (from summary.categories).
 *   compact: smaller version for the Home preview
 *   elapsedPct: draws the "% of month gone" marker on the bar
 */
export default function BudgetCard({ stats, onClick, compact = false, elapsedPct }) {
  const isSavings = stats.kind === 'savings'
  const tone = isSavings ? 'muted' : STATUS_META[stats.status].tone
  const over = stats.remaining < 0

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-card bg-surface p-4 text-left shadow-card transition active:scale-[0.99]"
    >
      <div className="flex items-start gap-3">
        <CategoryIcon icon={stats.icon} color={stats.color} size={compact ? 'sm' : 'md'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-heading font-semibold text-ink">{stats.name}</p>
            {isSavings ? <StatusBadge label="Set aside" tone="lavender" /> : <StatusBadge status={stats.status} />}
          </div>
          <p className="text-xs text-muted">
            {formatINR(stats.spent)} {isSavings ? 'moved to goals' : 'spent'} of {formatINR(stats.allocated)}
          </p>
        </div>
      </div>

      <ProgressBar
        className="mt-3"
        value={stats.consumedPct}
        tone={tone}
        marker={isSavings ? undefined : elapsedPct}
        size={compact ? 'sm' : 'md'}
        label={`${stats.name} ${stats.consumedPct}% used`}
      />

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={over ? 'font-semibold text-error' : 'font-semibold text-ink'}>
          {over ? `${formatINR(-stats.remaining)} over` : `${formatINR(stats.remaining)} left`}
        </span>
        <span className="text-muted">
          {stats.consumedPct}% used
          {!compact && !isSavings && stats.remaining > 0 && ` · ${formatINR(stats.safeDailyLimit)}/day safe`}
        </span>
      </div>
    </button>
  )
}
