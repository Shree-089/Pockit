import { CheckCircle2, CircleAlert } from 'lucide-react'
import { useApp } from '../../hooks/useApp.js'
import { formatINR } from '../../utils/money.js'
import { formatDateLabel } from '../../utils/calculations.js'
import { formatTime } from '../../utils/ui.js'
import CategoryIcon from '../common/CategoryIcon.jsx'
import Modal from '../common/Modal.jsx'

/** Read-only details for one transaction. */
export default function TransactionDetailModal({ transaction: tx, onClose }) {
  const { categoriesById, paymentMethods } = useApp()
  if (!tx) return null

  const category = categoriesById[tx.categoryId]
  const method = paymentMethods.find((m) => m.id === tx.paymentMethod)?.label ?? 'Pockit Vault'
  const success = tx.status === 'success'
  const rows = [
    ['Description', tx.description],
    ['Category', category?.name ?? 'Unknown'],
    ['Date', formatDateLabel(tx.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })],
    ['Time', formatTime(tx.time)],
    ['Payment method', method],
    ['Type', tx.type === 'savings' ? 'Savings transfer' : 'Expense'],
    ...(tx.paymentReference ? [['Reference', tx.paymentReference]] : []),
    ['Transaction ID', tx.id],
  ]

  return (
    <Modal open onClose={onClose} title="Transaction details">
      <div className="flex flex-col items-center pb-4 text-center">
        <CategoryIcon icon={category?.icon} color={category?.color} size="lg" />
        <p className="mt-3 font-heading text-3xl font-bold">{formatINR(tx.amount)}</p>
        <p className="text-sm text-muted">{tx.merchant}</p>
        <span
          className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${success ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}
        >
          {success ? <CheckCircle2 className="size-3.5" /> : <CircleAlert className="size-3.5" />}
          {success ? 'Successful' : 'Failed — not counted in your budget'}
        </span>
      </div>
      <dl className="divide-y divide-line rounded-2xl bg-bg px-4 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2.5">
            <dt className="shrink-0 text-muted">{label}</dt>
            <dd className="truncate text-right font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {tx.note && <p className="mt-3 rounded-2xl bg-violet-soft px-4 py-3 text-sm text-indigo">{tx.note}</p>}
    </Modal>
  )
}
