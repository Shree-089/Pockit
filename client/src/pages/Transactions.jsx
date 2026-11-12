import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { CheckCircle2, Plus, Search, SearchX, Sparkles, X } from 'lucide-react'
import { useApp } from '../hooks/useApp.js'
import { formatINR } from '../utils/money.js'
import { addDays, countByCategory, filterTransactions, groupTransactionsByDate } from '../utils/calculations.js'
import { cx, formatGroupDate } from '../utils/ui.js'
import TransactionRow from '../components/transactions/TransactionRow.jsx'
import TransactionDetailModal from '../components/transactions/TransactionDetailModal.jsx'
import EmptyState from '../components/common/EmptyState.jsx'
import Button from '../components/common/Button.jsx'

const DATE_PRESETS = [
  { id: 'all', label: 'All dates' },
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: 'custom', label: 'Custom' },
]
const STATUS_FILTERS = [
  { id: 'all', label: 'Any status' },
  { id: 'success', label: 'Successful' },
  { id: 'failed', label: 'Failed' },
]

export default function Transactions() {
  const { transactions, summary, categoriesById, cycle } = useApp()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const searchRef = useRef(null)

  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [datePreset, setDatePreset] = useState('all')
  const [range, setRange] = useState({ from: cycle.start, to: cycle.today })
  const [status, setStatus] = useState('all')
  const [openTx, setOpenTx] = useState(null)
  const [highlightId, setHighlightId] = useState(location.state?.savedId ?? null)

  // TopBar search icon links here with ?search=1
  useEffect(() => {
    if (searchParams.get('search')) searchRef.current?.focus()
  }, [searchParams])

  // Clear the "saved" highlight after a few seconds and drop it from history state.
  useEffect(() => {
    if (!highlightId) return undefined
    navigate(location.pathname, { replace: true, state: null })
    const timer = setTimeout(() => setHighlightId(null), 4000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId])

  const dateRange = useMemo(() => {
    if (datePreset === 'today') return { from: cycle.today, to: cycle.today }
    if (datePreset === '7d') return { from: addDays(cycle.today, -6), to: cycle.today }
    if (datePreset === 'custom') return range
    return {}
  }, [datePreset, range, cycle.today])

  const filtered = useMemo(
    () => filterTransactions(transactions, { query, categoryId, status, ...dateRange }, categoriesById),
    [transactions, query, categoryId, status, dateRange, categoriesById],
  )
  const groups = useMemo(() => groupTransactionsByDate(filtered), [filtered])
  const counts = useMemo(() => countByCategory(transactions), [transactions])
  const chips = [{ id: 'all', name: 'All', count: transactions.length }, ...summary.categories.filter((c) => counts[c.id]).map((c) => ({ id: c.id, name: c.name.split(' ')[0], count: counts[c.id] }))]

  const isFiltered = query || categoryId !== 'all' || datePreset !== 'all' || status !== 'all'
  const resetFilters = () => {
    setQuery('')
    setCategoryId('all')
    setDatePreset('all')
    setStatus('all')
  }

  return (
    <div className="pb-20">
      {highlightId && (
        <p className="mb-3 flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-3 text-sm font-medium text-success" role="status">
          <CheckCircle2 className="size-4" /> Expense saved. Your budgets are updated.
        </p>
      )}

      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 shadow-card focus-within:border-royal">
        <Search className="size-5 text-muted" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search merchants, notes, categories…"
          aria-label="Search transactions"
          className="min-h-12 flex-1 bg-transparent text-sm outline-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-muted">
            <X className="size-4" />
          </button>
        )}
      </div>

      <section className="mt-4 rounded-card bg-surface p-4 shadow-card">
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">Spent this month</p>
        <p className="font-heading text-3xl font-bold text-ink">
          {formatINR(summary.totalSpent)} <span className="text-sm font-medium text-muted">/ {summary.transactionCount} entries</span>
        </p>
        <p className="mt-2 flex items-center gap-2 rounded-xl bg-violet-soft px-3 py-2 text-xs font-medium text-indigo">
          <Sparkles className="size-3.5" />
          Avg {formatINR(summary.dailyAverage)}/day · safe limit {formatINR(summary.safeDailyLimit)}/day
        </p>
      </section>

      <FilterRow label="Category">
        {chips.map((c) => (
          <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>
            {c.name} ({c.count})
          </Chip>
        ))}
      </FilterRow>
      <FilterRow label="Date">
        {DATE_PRESETS.map((p) => (
          <Chip key={p.id} active={datePreset === p.id} onClick={() => setDatePreset(p.id)}>
            {p.label}
          </Chip>
        ))}
        {STATUS_FILTERS.map((s) => (
          <Chip key={s.id} active={status === s.id} onClick={() => setStatus(s.id)}>
            {s.label}
          </Chip>
        ))}
      </FilterRow>

      {datePreset === 'custom' && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {['from', 'to'].map((key) => (
            <label key={key} className="text-xs text-muted">
              {key === 'from' ? 'From' : 'To'}
              <input
                type="date"
                min={cycle.start}
                max={cycle.today}
                value={range[key]}
                onChange={(e) => setRange((r) => ({ ...r, [key]: e.target.value }))}
                className="mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
              />
            </label>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No transactions found"
          description="Try a different search or clear the filters."
          action={isFiltered && <Button variant="secondary" onClick={resetFilters}>Clear filters</Button>}
        />
      ) : (
        groups.map((group) => (
          <section key={group.date} className="mt-5">
            <div className="mb-1.5 flex justify-between px-1 text-xs font-semibold tracking-wide text-muted">
              <span>{formatGroupDate(group.date, cycle.today)}</span>
              <span>
                {group.count} {group.count === 1 ? 'spend' : 'spends'} · {formatINR(group.total)}
              </span>
            </div>
            <ul className="divide-y divide-line rounded-card bg-surface px-4 shadow-card">
              {group.items.map((tx) => (
                <li key={tx.id}>
                  <TransactionRow transaction={tx} onClick={() => setOpenTx(tx)} highlight={tx.id === highlightId} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 mx-auto flex max-w-[430px] justify-center">
        <Button to="/expenses/new" size="lg" icon={Plus} className="pointer-events-auto shadow-card">
          Add Expense
        </Button>
      </div>

      <TransactionDetailModal transaction={openTx} onClose={() => setOpenTx(null)} />
    </div>
  )
}

function FilterRow({ label, children }) {
  return (
    <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={label}>
      {children}
    </div>
  )
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition',
        active ? 'bg-indigo text-white' : 'border border-line bg-surface text-ink',
      )}
    >
      {children}
    </button>
  )
}
