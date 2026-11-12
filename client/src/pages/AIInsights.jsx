import { useMemo, useState } from 'react'
import { Activity, CalendarClock, Sparkles } from 'lucide-react'
import { useApp } from '../hooks/useApp.js'
import { formatINR } from '../utils/money.js'
import { STATUS_META, buildSpendSeries, cycleDayToDate, formatDateLabel } from '../utils/calculations.js'
import SpendForecastChart from '../components/ai/SpendForecastChart.jsx'
import CategoryBreakdownChart from '../components/ai/CategoryBreakdownChart.jsx'
import InsightCard from '../components/ai/InsightCard.jsx'
import ChatPanel from '../components/ai/ChatPanel.jsx'
import AiAnalysisCard from '../components/ai/AiAnalysisCard.jsx'
import Card from '../components/common/Card.jsx'
import ProgressBar from '../components/common/ProgressBar.jsx'
import StatusBadge from '../components/common/StatusBadge.jsx'
import SectionHeader from '../components/common/SectionHeader.jsx'

export default function AIInsights() {
  const { summary, insights, transactions, cycle, categoriesById, settings, updateCategory, dataSource } = useApp()
  const [dismissed, setDismissed] = useState(() => new Set())
  const [applying, setApplying] = useState(null)
  const [notice, setNotice] = useState('')

  const series = useMemo(
    () => buildSpendSeries({ transactions, cycle, spendableAllocated: summary.spendableAllocated }),
    [transactions, cycle, summary.spendableAllocated],
  )
  // Rebalance suggestions respect the "Smart rebalancing" setting in Profile.
  const visible = insights.filter((i) => !dismissed.has(i.id) && (settings.smartRebalancing || i.kind !== 'rebalance'))
  const surplus = summary.projectedSurplus
  const { progress } = summary

  // Rebalance = move allocation between two categories. Total allocated stays the same.
  async function applyInsight(insight) {
    const { fromCategoryId, toCategoryId, amount } = insight.action
    const from = categoriesById[fromCategoryId]
    const to = categoriesById[toCategoryId]
    setApplying(insight.id)
    try {
      await updateCategory(from.id, { allocated: from.allocated - amount })
      await updateCategory(to.id, { allocated: to.allocated + amount })
      setNotice(`Moved ${formatINR(amount)} from ${from.name} to ${to.name}.`)
    } catch (err) {
      setNotice(err.message)
    } finally {
      setApplying(null)
    }
  }

  return (
    <div className="space-y-4 pb-2">
      <div className="px-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-ink">AI Financial Intelligence</h1>
          <span className="rounded-full bg-violet-soft px-2.5 py-1 text-[11px] font-semibold text-indigo">{dataSource === 'api' ? 'Live data' : 'Offline demo'}</span>
        </div>
        <p className="text-sm text-muted">
          Based on {summary.transactionCount} expenses over {progress.daysElapsed} days
        </p>
      </div>

      <AiAnalysisCard />

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-heading font-bold text-ink">Month-end forecast</h2>
            <p className="text-xs text-muted">Straight-line projection from your daily average</p>
          </div>
          <StatusBadge label={surplus >= 0 ? 'Within budget' : 'Over pace'} tone={surplus >= 0 ? 'success' : 'warning'} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-bg p-3">
          <div>
            <p className="text-xs text-muted">Projected spend</p>
            <p className="font-heading text-2xl font-bold text-ink">{formatINR(summary.projectedSpend)}</p>
            <p className="text-[11px] text-muted">of {formatINR(summary.spendableAllocated)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{surplus >= 0 ? 'Estimated surplus' : 'Estimated shortfall'}</p>
            <p className={`font-heading text-2xl font-bold ${surplus >= 0 ? 'text-success' : 'text-error'}`}>{formatINR(Math.abs(surplus))}</p>
            <p className="text-[11px] text-muted">by {formatDateLabel(cycle.end)}</p>
          </div>
        </div>
        <div className="mt-3">
          <SpendForecastChart series={series} todayDay={progress.daysElapsed} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <Activity className="size-5 text-royal" />
          <p className="mt-2 text-xs text-muted">Current velocity</p>
          <p className="font-heading text-xl font-bold">{formatINR(summary.dailyAverage)}/day</p>
        </Card>
        <Card>
          <CalendarClock className="size-5 text-royal" />
          <p className="mt-2 text-xs text-muted">Safe from now on</p>
          <p className="font-heading text-xl font-bold">{formatINR(summary.safeDailyLimit)}/day</p>
        </Card>
      </div>

      <section>
        <SectionHeader title="Budget depletion" right={<span className="text-xs text-muted">{progress.elapsedPct}% of month gone</span>} />
        <Card className="space-y-4">
          {summary.spendableCategories.map((c) => (
            <div key={c.id}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium text-ink">{c.name}</span>
                <StatusBadge status={c.status} />
              </div>
              <ProgressBar value={c.consumedPct} tone={STATUS_META[c.status].tone} marker={progress.elapsedPct} label={`${c.name} ${c.consumedPct}% used`} />
              <p className="mt-1 text-xs text-muted">
                {c.consumedPct}% used · {formatINR(c.dailyPace)}/day
                {c.depletionDay ? ` · runs out ~${formatDateLabel(cycleDayToDate(cycle, c.depletionDay))}` : ' · lasts the month'}
              </p>
            </div>
          ))}
        </Card>
      </section>

      <section>
        <SectionHeader title="Where your money went" />
        <Card>
          <CategoryBreakdownChart categories={summary.spendableCategories} totalSpent={summary.totalSpent} />
        </Card>
      </section>

      <section>
        <SectionHeader title="Quick actions" right={<span className="flex items-center gap-1 text-xs text-muted"><Sparkles className="size-3.5" /> {visible.length} active</span>} />
        {notice && <p className="mb-3 rounded-2xl bg-success/10 px-4 py-3 text-sm font-medium text-success" role="status">{notice}</p>}
        <div className="space-y-3">
          {visible.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              actionLoading={applying === insight.id}
              onAction={insight.action ? applyInsight : undefined}
              onDismiss={(id) => setDismissed((s) => new Set(s).add(id))}
            />
          ))}
          {visible.length === 0 && <p className="px-1 text-sm text-muted">All caught up. No recommendations right now.</p>}
        </div>
      </section>

      <ChatPanel />
    </div>
  )
}
