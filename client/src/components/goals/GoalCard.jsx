import { Plus, Trash2, Trophy } from 'lucide-react'
import { formatINR, percentOf } from '../../utils/money.js'
import { formatDateLabel } from '../../utils/calculations.js'
import { monthsBetween, renderIcon } from '../../utils/ui.js'
import Button from '../common/Button.jsx'
import ProgressBar from '../common/ProgressBar.jsx'

/** One savings goal with progress and actions. */
export default function GoalCard({ goal, today, onDeposit, onDelete, canDeposit }) {
  const pct = percentOf(goal.saved, goal.target)
  const remaining = Math.max(0, goal.target - goal.saved)
  const achieved = goal.saved >= goal.target
  const months = monthsBetween(today, goal.targetDate)
  const overdue = !achieved && goal.targetDate < today

  return (
    <article className="rounded-card bg-surface p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-violet-soft text-indigo">
          {renderIcon(goal.icon, { className: 'size-6' })}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-heading font-semibold text-ink">{goal.name}</h3>
          <p className="text-xs text-muted">
            {goal.category} · by {formatDateLabel(goal.targetDate, { month: 'short', year: 'numeric' })}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-heading font-bold text-ink">{formatINR(goal.saved)}</p>
          <p className="text-xs text-muted">of {formatINR(goal.target)}</p>
        </div>
      </div>

      <ProgressBar className="mt-3" value={pct} tone={achieved ? 'success' : 'royal'} label={`${goal.name} ${pct}% saved`} />
      <div className="mt-1.5 flex justify-between text-xs">
        <span className="font-semibold text-royal">{pct}% saved</span>
        <span className="text-muted">
          {achieved ? 'Fully funded' : overdue ? `${formatINR(remaining)} to go · past target date` : `${formatINR(remaining)} to go · ${months} ${months === 1 ? 'month' : 'months'} left`}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {achieved ? (
          <p className="flex flex-1 items-center gap-2 text-sm font-semibold text-success">
            <Trophy className="size-4" /> Goal achieved!
          </p>
        ) : (
          <Button variant="interactive" size="sm" icon={Plus} className="flex-1" onClick={() => onDeposit(goal)} disabled={!canDeposit}>
            Add money
          </Button>
        )}
        <button
          type="button"
          onClick={() => onDelete(goal)}
          aria-label={`Delete ${goal.name}`}
          className="grid size-9 place-items-center rounded-full text-muted hover:bg-error/10 hover:text-error"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </article>
  )
}
