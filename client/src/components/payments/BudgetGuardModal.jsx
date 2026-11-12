import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react'
import { formatINR } from '../../utils/money.js'
import { formatDateLabel } from '../../utils/calculations.js'
import { cx, riskLevelOf } from '../../utils/ui.js'
import AiSourceBadge from '../ai/AiSourceBadge.jsx'
import Button from '../common/Button.jsx'
import Modal from '../common/Modal.jsx'
import ProgressBar from '../common/ProgressBar.jsx'

const RISK = {
  safe: { label: 'Safe', icon: ShieldCheck, badge: 'bg-success/10 text-success', tone: 'success' },
  warning: { label: 'Warning', icon: AlertTriangle, badge: 'bg-warning/12 text-warning', tone: 'warning' },
  high_risk: { label: 'High risk', icon: ShieldAlert, badge: 'bg-error/10 text-error', tone: 'error' },
}

/**
 * Pre-Payment Budget Guard. All numbers come from the server's deterministic assessment.
 * Advisory only: "Proceed anyway" is always available.
 */
export default function BudgetGuardModal({ result, purchase, onCancel, onProceed, proceeding }) {
  if (!result) return null
  const a = result.assessment
  const level = riskLevelOf(result)
  const risk = RISK[level]
  const Icon = risk.icon
  const explanation = result.explanation ?? `${result.message} ${result.recommendation}`
  const rows = [
    ['Allocated budget', formatINR(a.allocated)],
    ['Already spent', formatINR(a.spentBefore)],
    ['Remaining before purchase', formatINR(a.remainingBefore)],
    ['This purchase', `−${formatINR(a.amount)}`],
  ]

  return (
    <Modal
      open
      onClose={onCancel}
      title={result.title}
      footer={
        <div className="space-y-2">
          <Button full size="lg" onClick={onCancel}>
            Cancel &amp; Save Money
          </Button>
          <Button full variant="outline" loading={proceeding} onClick={onProceed}>
            Proceed Anyway
          </Button>
          <p className="text-center text-[11px] text-muted">Pockit never blocks payments. The choice is always yours.</p>
        </div>
      }
    >
      <div className="flex items-center gap-3">
        <span className={cx('grid size-12 shrink-0 place-items-center rounded-2xl', risk.badge)}>
          <Icon className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-heading text-lg font-bold text-ink">{purchase.description}</p>
          <p className="text-sm text-muted">
            {formatINR(a.amount)} from {a.categoryName}
          </p>
        </div>
        <span className={cx('ml-auto shrink-0 rounded-full px-2.5 py-1 text-xs font-bold', risk.badge)}>{risk.label}</span>
      </div>

      <dl className="mt-4 divide-y divide-line rounded-2xl bg-bg px-4 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between py-2.5">
            <dt className="text-muted">{label}</dt>
            <dd className="font-semibold text-ink">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between py-2.5">
          <dt className="font-semibold text-ink">Remaining after purchase</dt>
          <dd className={cx('font-heading font-bold', a.remainingAfter < 0 ? 'text-error' : 'text-ink')}>{formatINR(a.remainingAfter)}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>{a.consumedBefore}% used now</span>
          <span className="font-semibold text-ink">{a.consumedAfter}% after</span>
        </div>
        <ProgressBar value={a.consumedAfter} tone={risk.tone} marker={a.consumedBefore} label="Budget used after purchase" />
      </div>

      <p className="mt-3 text-sm text-muted">
        {a.depletionDateAfter
          ? `Forecast: at ${formatINR(a.dailyPace)}/day, ${a.categoryName} would run out around ${formatDateLabel(a.depletionDateAfter)}.`
          : `Forecast: ${a.categoryName} should last the rest of the month.`}{' '}
        Safe pace afterwards: {formatINR(a.dailyLimitAfter)}/day for {a.daysRemaining} days.
      </p>

      <div className="mt-4 rounded-2xl bg-violet-soft/70 p-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold text-indigo">Recommendation</p>
          <AiSourceBadge source={result.explanationSource} model={result.explanationModel} />
        </div>
        <p className="text-sm text-ink">{explanation}</p>
      </div>
    </Modal>
  )
}
