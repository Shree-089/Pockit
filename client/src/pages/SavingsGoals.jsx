import { useState } from 'react'
import { Lightbulb, PiggyBank, Plus } from 'lucide-react'
import { useApp } from '../hooks/useApp.js'
import { formatINR, sumPaise } from '../utils/money.js'
import { formatDateLabel } from '../utils/calculations.js'
import { monthsBetween } from '../utils/ui.js'
import GoalCard from '../components/goals/GoalCard.jsx'
import ContributeModal from '../components/goals/ContributeModal.jsx'
import GoalFormModal from '../components/goals/GoalFormModal.jsx'
import Button from '../components/common/Button.jsx'
import Modal from '../components/common/Modal.jsx'
import EmptyState from '../components/common/EmptyState.jsx'

export default function SavingsGoals() {
  const { goals, summary, cycle, deleteGoal } = useApp()
  const [depositGoal, setDepositGoal] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [creating, setCreating] = useState(false)

  const totalSaved = sumPaise(goals.map((g) => g.saved))
  const active = goals.filter((g) => g.saved < g.target)
  const available = summary.savingsRemaining

  // Suggestion: the active goal with the nearest deadline and what it needs per month.
  const nearest = [...active].sort((a, b) => a.targetDate.localeCompare(b.targetDate))[0]
  const monthsLeft = nearest ? Math.max(1, monthsBetween(cycle.today, nearest.targetDate)) : 0
  const perMonth = nearest ? Math.ceil((nearest.target - nearest.saved) / monthsLeft / 100) * 100 : 0

  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-end justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold text-ink">Savings Goals</h1>
          <p className="text-sm text-muted">{active.length} active {active.length === 1 ? 'goal' : 'goals'}</p>
        </div>
        <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>
          New goal
        </Button>
      </div>

      <section className="rounded-card bg-gradient-to-br from-indigo to-[#34397f] p-5 text-white shadow-card">
        <p className="text-xs font-semibold tracking-wider text-white/70 uppercase">Total saved in goals</p>
        <p className="mt-1 font-heading text-4xl font-bold">{formatINR(totalSaved)}</p>
        <div className="mt-3 flex items-center gap-2 border-t border-white/15 pt-3 text-sm text-white/80">
          <PiggyBank className="size-4" />
          {formatINR(available)} of this month's {formatINR(summary.savingsAllocated)} savings is ready to move into a goal
        </div>
      </section>

      {nearest && (
        <section className="flex gap-3 rounded-card bg-violet-soft/70 p-4">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-indigo" />
          <p className="text-sm text-indigo">
            <strong>{nearest.name}</strong> needs {formatINR(nearest.target - nearest.saved)} by {formatDateLabel(nearest.targetDate)}. Saving about{' '}
            <strong>{formatINR(perMonth)}/month</strong> gets you there.
          </p>
        </section>
      )}

      {goals.length === 0 ? (
        <EmptyState icon={PiggyBank} title="No goals yet" description="Create a goal and move money into it from your monthly savings." action={<Button onClick={() => setCreating(true)}>Create a goal</Button>} />
      ) : (
        <div className="space-y-3">
          {[...goals]
            .sort((a, b) => Number(a.saved >= a.target) - Number(b.saved >= b.target))
            .map((goal) => (
              <GoalCard key={goal.id} goal={goal} today={cycle.today} canDeposit={available > 0} onDeposit={setDepositGoal} onDelete={setDeleting} />
            ))}
        </div>
      )}
      {available <= 0 && active.length > 0 && (
        <p className="px-1 text-xs text-muted">This month's savings bucket is fully used. Increase your Savings category in Budgets to save more.</p>
      )}

      {depositGoal && <ContributeModal key={depositGoal.id} goal={depositGoal} onClose={() => setDepositGoal(null)} />}
      <GoalFormModal open={creating} onClose={() => setCreating(false)} />
      {deleting && (
        <Modal
          open
          onClose={() => setDeleting(null)}
          title="Delete goal?"
          footer={
            <div className="flex gap-3">
              <Button variant="outline" full onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" full onClick={() => deleteGoal(deleting.id).then(() => setDeleting(null))}>
                Delete
              </Button>
            </div>
          }
        >
          <p className="pb-2 text-sm text-ink">
            Delete <strong>{deleting.name}</strong>? Its {formatINR(deleting.saved)} progress record will be removed from Pockit.
          </p>
        </Modal>
      )}
    </div>
  )
}
