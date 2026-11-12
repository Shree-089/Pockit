import { useApp } from '../../hooks/useApp.js'
import { formatINR } from '../../utils/money.js'
import { cx, formatTime } from '../../utils/ui.js'
import CategoryIcon from '../common/CategoryIcon.jsx'

/** One line in a transaction list. Clickable when `onClick` is given. */
export default function TransactionRow({ transaction: tx, onClick, showCategory = true, highlight = false }) {
  const { categoriesById, paymentMethods } = useApp()
  const category = categoriesById[tx.categoryId]
  const method = paymentMethods.find((m) => m.id === tx.paymentMethod)?.short ?? 'Pockit Vault'
  const failed = tx.status !== 'success'
  const isSavings = tx.type === 'savings'
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-3 py-3 text-left transition-colors',
        onClick && 'active:bg-bg',
        highlight && 'rounded-2xl bg-success/10 px-2',
      )}
    >
      <CategoryIcon icon={category?.icon} color={category?.color} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{tx.merchant}</p>
        <p className="truncate text-xs text-muted">
          {formatTime(tx.time)} · {method}
          {tx.description !== tx.merchant && ` · ${tx.description}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cx('font-heading font-semibold', failed ? 'text-muted line-through' : isSavings ? 'text-success' : 'text-ink')}>
          {isSavings ? '' : '−'}
          {formatINR(tx.amount)}
        </p>
        {failed ? (
          <span className="text-[11px] font-semibold text-error">Failed</span>
        ) : isSavings ? (
          <span className="text-[11px] font-semibold text-success">Saved</span>
        ) : (
          showCategory && category && <span className="text-[11px] text-muted">{category.name}</span>
        )}
      </div>
    </Tag>
  )
}
