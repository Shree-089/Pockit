import { useState } from 'react'
import { AlertTriangle, Plus, Sparkles } from 'lucide-react'
import { useApp } from '../hooks/useApp.js'
import { formatINR } from '../utils/money.js'
import { BUDGET_STATUS, STATUS_META } from '../utils/calculations.js'
import BudgetCard from '../components/budgets/BudgetCard.jsx'
import CategoryDetailModal from '../components/budgets/CategoryDetailModal.jsx'
import CategoryFormModal from '../components/budgets/CategoryFormModal.jsx'
import Button from '../components/common/Button.jsx'
import Card from '../components/common/Card.jsx'
import StatusBadge from '../components/common/StatusBadge.jsx'

export default function Budgets() {
  const { summary, categoriesById } = useApp()
  const [detailId, setDetailId] = useState(null)
  const [form, setForm] = useState(null) // null | { mode: 'add' } | { mode: 'edit', id }

  const counts = Object.values(BUDGET_STATUS).map((s) => [s, summary.spendableCategories.filter((c) => c.status === s).length])
  const overAllocated = summary.unallocated < 0

  return (
    <div className="pb-2">
      <div className="mb-4 flex items-end justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold text-ink">My Budgets</h1>
          <p className="text-sm text-muted">{summary.categories.length} categories this month</p>
        </div>
        <Button size="sm" icon={Plus} onClick={() => setForm({ mode: 'add' })}>
          Category
        </Button>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Allocated" value={formatINR(summary.totalAllocated)} sub={`of ${formatINR(summary.allowance)} allowance`} />
          <Stat label="Unallocated" value={formatINR(summary.unallocated)} sub={overAllocated ? 'over-allocated' : 'ready to assign'} warn={overAllocated} />
          <Stat label="Spent" value={formatINR(summary.totalSpent)} sub={`${summary.spentPct}% of spending budget`} />
          <Stat label="Left to spend" value={formatINR(summary.spendableRemaining)} sub={`${formatINR(summary.safeDailyLimit)}/day safe`} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
          {counts
            .filter(([, n]) => n > 0)
            .map(([status, n]) => (
              <StatusBadge key={status} status={status} label={`${n} ${STATUS_META[status].label}`} />
            ))}
        </div>
      </Card>

      {overAllocated && (
        <p className="mt-3 flex gap-2 rounded-2xl bg-warning/12 px-4 py-3 text-sm text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          Your categories add up to {formatINR(-summary.unallocated)} more than your allowance. Consider lowering an allocation.
        </p>
      )}

      <p className="mt-4 mb-2 px-1 text-xs text-muted">The thin line on each bar marks how much of the month has passed ({summary.progress.elapsedPct}%).</p>
      <div className="space-y-3">
        {summary.categories.map((stats) => (
          <BudgetCard key={stats.id} stats={stats} elapsedPct={summary.progress.elapsedPct} onClick={() => setDetailId(stats.id)} />
        ))}
      </div>

      <Card className="mt-4 flex items-center gap-3 bg-violet-soft/70">
        <Sparkles className="size-5 shrink-0 text-indigo" />
        <p className="flex-1 text-sm text-indigo">Want a fresh split? Let Pockit AI suggest allocations from your lifestyle.</p>
        <Button size="sm" variant="secondary" to="/onboarding">
          Try
        </Button>
      </Card>

      {detailId && (
        <CategoryDetailModal
          categoryId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setForm({ mode: 'edit', id: detailId })
            setDetailId(null)
          }}
        />
      )}
      {form && (
        <CategoryFormModal
          key={form.mode === 'edit' ? form.id : 'new'}
          open
          category={form.mode === 'edit' ? categoriesById[form.id] : null}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}

function Stat({ label, value, sub, warn }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`font-heading text-xl font-bold ${warn ? 'text-error' : 'text-ink'}`}>{value}</p>
      <p className="text-[11px] text-muted">{sub}</p>
    </div>
  )
}
