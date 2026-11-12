import { Pencil, Plus } from 'lucide-react'
import { useApp } from '../../hooks/useApp.js'
import { formatINR } from '../../utils/money.js'
import { STATUS_META, cycleDayToDate, formatDateLabel, sortTransactions } from '../../utils/calculations.js'
import Button from '../common/Button.jsx'
import CategoryIcon from '../common/CategoryIcon.jsx'
import Modal from '../common/Modal.jsx'
import ProgressBar from '../common/ProgressBar.jsx'
import StatusBadge from '../common/StatusBadge.jsx'
import TransactionRow from '../transactions/TransactionRow.jsx'

/** Full stats + recent transactions for one category. */
export default function CategoryDetailModal({ categoryId, onClose, onEdit }) {
  const { categoriesById, transactions, summary, cycle } = useApp()
  const stats = categoriesById[categoryId]
  if (!stats) return null

  const isSavings = stats.kind === 'savings'
  const recent = sortTransactions(transactions.filter((t) => t.categoryId === stats.id)).slice(0, 5)
  const rows = [
    ['Allocated', formatINR(stats.allocated)],
    [isSavings ? 'Moved to goals' : 'Spent', formatINR(stats.spent)],
    ['Remaining', formatINR(stats.remaining)],
    ...(isSavings
      ? []
      : [
          ['Daily pace', `${formatINR(stats.dailyPace)}/day`],
          ['Safe daily limit', `${formatINR(stats.safeDailyLimit)}/day`],
          ['Projected month-end', formatINR(stats.projected)],
          ['Runs out', stats.depletionDay ? formatDateLabel(cycleDayToDate(cycle, stats.depletionDay)) : 'Lasts the month'],
        ]),
  ]

  return (
    <Modal
      open
      onClose={onClose}
      title={stats.name}
      footer={
        <div className="flex gap-3">
          <Button variant="outline" full icon={Pencil} onClick={onEdit}>
            Edit
          </Button>
          {!isSavings && (
            <Button full icon={Plus} to={`/expenses/new?category=${stats.id}`}>
              Add expense
            </Button>
          )}
        </div>
      }
    >
      <div className="flex items-center gap-3">
        <CategoryIcon icon={stats.icon} color={stats.color} size="lg" />
        <div>
          <p className="font-heading text-2xl font-bold">{formatINR(stats.remaining)}</p>
          <p className="text-sm text-muted">left of {formatINR(stats.allocated)}</p>
        </div>
        <div className="ml-auto">{isSavings ? <StatusBadge label="Set aside" tone="lavender" /> : <StatusBadge status={stats.status} />}</div>
      </div>

      <ProgressBar className="mt-4" value={stats.consumedPct} tone={isSavings ? 'muted' : STATUS_META[stats.status].tone} marker={isSavings ? undefined : summary.progress.elapsedPct} />
      {!isSavings && (
        <p className="mt-1.5 text-xs text-muted">
          {stats.consumedPct}% used · {summary.progress.elapsedPct}% of the month gone (marker)
        </p>
      )}

      <dl className="mt-4 divide-y divide-line rounded-2xl bg-bg px-4 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between py-2.5">
            <dt className="text-muted">{label}</dt>
            <dd className="font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-5 mb-1 text-sm font-bold">Recent activity</h3>
      {recent.length === 0 ? (
        <p className="py-3 text-sm text-muted">No transactions yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {recent.map((tx) => (
            <li key={tx.id}>
              <TransactionRow transaction={tx} showCategory={false} />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
