import { useState } from 'react'
import { Link } from 'react-router'
import { CreditCard, PiggyBank, Plus, Sparkles } from 'lucide-react'
import { useApp } from '../hooks/useApp.js'
import { sortTransactions } from '../utils/calculations.js'
import WalletSummaryCard from '../components/dashboard/WalletSummaryCard.jsx'
import BudgetHealthCard from '../components/dashboard/BudgetHealthCard.jsx'
import InsightCard from '../components/ai/InsightCard.jsx'
import AiAnalysisCard from '../components/ai/AiAnalysisCard.jsx'
import BudgetCard from '../components/budgets/BudgetCard.jsx'
import CategoryDetailModal from '../components/budgets/CategoryDetailModal.jsx'
import CategoryFormModal from '../components/budgets/CategoryFormModal.jsx'
import TransactionRow from '../components/transactions/TransactionRow.jsx'
import TransactionDetailModal from '../components/transactions/TransactionDetailModal.jsx'
import SectionHeader from '../components/common/SectionHeader.jsx'
import Card from '../components/common/Card.jsx'

const QUICK_ACTIONS = [
  { to: '/expenses/new', label: 'Add expense', icon: Plus },
  { to: '/checkout', label: 'Pay', icon: CreditCard },
  { to: '/goals', label: 'Goals', icon: PiggyBank },
  { to: '/onboarding', label: 'AI budget', icon: Sparkles, ai: true },
]

export default function Home() {
  const { user, summary, insights, transactions, categoriesById, dataSource } = useApp()
  const [detailId, setDetailId] = useState(null)
  const [editId, setEditId] = useState(null)
  const [openTx, setOpenTx] = useState(null)

  // Most-used spending categories first, so the riskiest are previewed.
  const previews = [...summary.spendableCategories].sort((a, b) => b.consumedPct - a.consumedPct).slice(0, 3)
  const recent = sortTransactions(transactions).slice(0, 5)
  const topInsight = insights[0]

  return (
    <div className="pb-2">
      <div className="mb-4 px-1">
        <p className="text-sm text-muted">Hello,</p>
        <h1 className="text-2xl font-bold text-ink">{user.firstName} 👋</h1>
      </div>

      <WalletSummaryCard summary={summary} />

      <nav aria-label="Quick actions" className="mt-4 grid grid-cols-4 gap-2">
        {QUICK_ACTIONS.map(({ to, label, icon: Icon, ai }) => (
          <Link key={to} to={to} className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface py-3 text-xs font-medium text-ink shadow-card active:scale-95">
            <span className={`grid size-10 place-items-center rounded-full ${ai ? 'bg-violet-soft text-indigo' : 'bg-royal/10 text-royal'}`}>
              <Icon className="size-5" />
            </span>
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-4">
        <BudgetHealthCard summary={summary} />
      </div>

      {/* Server AI analysis when connected; in offline demo mode, the browser-calculated insight. */}
      {dataSource === 'api' ? (
        <>
          <SectionHeader title="AI insight" to="/insights" linkLabel="All insights" />
          <AiAnalysisCard compact />
        </>
      ) : (
        topInsight && (
          <>
            <SectionHeader title="AI insight" to="/insights" linkLabel="All insights" />
            <InsightCard insight={topInsight} compact />
          </>
        )
      )}

      <SectionHeader title="Budgets" to="/budgets" />
      <div className="space-y-3">
        {previews.map((stats) => (
          <BudgetCard key={stats.id} stats={stats} compact elapsedPct={summary.progress.elapsedPct} onClick={() => setDetailId(stats.id)} />
        ))}
      </div>

      <SectionHeader title="Recent transactions" to="/transactions" />
      <Card className="py-1">
        <ul className="divide-y divide-line">
          {recent.map((tx) => (
            <li key={tx.id}>
              <TransactionRow transaction={tx} onClick={() => setOpenTx(tx)} />
            </li>
          ))}
        </ul>
      </Card>

      {detailId && (
        <CategoryDetailModal
          categoryId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setEditId(detailId)
            setDetailId(null)
          }}
        />
      )}
      {editId && <CategoryFormModal key={editId} open category={categoriesById[editId]} onClose={() => setEditId(null)} />}
      <TransactionDetailModal transaction={openTx} onClose={() => setOpenTx(null)} />
    </div>
  )
}
