import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { useApp } from '../hooks/useApp.js'
import { formatINR, fromPaise, parseRupeeInput, rupees } from '../utils/money.js'
import { GUARD_LEVEL, assessPurchaseImpact } from '../utils/calculations.js'
import { cx } from '../utils/ui.js'
import Button from '../components/common/Button.jsx'
import CategoryIcon from '../components/common/CategoryIcon.jsx'
import FormField from '../components/common/FormField.jsx'

const QUICK_ADD = [rupees(50), rupees(100), rupees(200), rupees(500)]

export default function AddExpense() {
  const { summary, transactions, paymentMethods, cycle, settings, addExpense } = useApp()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const spendable = summary.spendableCategories
  const presetCategory = spendable.some((c) => c.id === searchParams.get('category')) ? searchParams.get('category') : ''

  // Lazy initializer: runs once, so the current time is read only on first render.
  const [form, setForm] = useState(() => ({
    amount: '',
    merchant: '',
    categoryId: presetCategory,
    date: cycle.today,
    time: new Date().toTimeString().slice(0, 5),
    paymentMethod: 'upi-gpay',
    note: '',
  }))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const amountPaise = parseRupeeInput(form.amount)
  const selected = spendable.find((c) => c.id === form.categoryId)

  // Live "AI guardrail" preview: the same calculation the Budget Guard uses. Advisory only.
  const preview = useMemo(() => {
    if (!selected || !amountPaise) return null
    return assessPurchaseImpact({ stats: selected, amount: amountPaise, progress: summary.progress, cycle, warnThreshold: settings.guardThreshold })
  }, [selected, amountPaise, summary.progress, cycle, settings.guardThreshold])

  // Frequent merchants, derived from the user's own history.
  const frequent = useMemo(() => {
    const counts = {}
    for (const t of transactions) if (t.type === 'expense') counts[t.merchant] = (counts[t.merchant] ?? 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m]) => m)
  }, [transactions])

  function quickAdd(paise) {
    const current = parseRupeeInput(form.amount) ?? 0
    set('amount', String(fromPaise(current + paise)))
  }

  async function handleSave() {
    setSaving(true)
    setErrors({})
    try {
      const tx = await addExpense({ ...form, description: form.merchant })
      navigate('/transactions', { state: { savedId: tx.id } })
    } catch (err) {
      setErrors(err.fieldErrors ?? { form: err.message })
      setSaving(false)
    }
  }

  const tone =
    preview?.level === GUARD_LEVEL.OVER ? 'border-error/30 bg-error/10' : preview?.shouldWarn ? 'border-warning/30 bg-warning/12' : 'border-lavender/30 bg-violet-soft'

  return (
    <div className="space-y-4">
      <section className="rounded-card bg-surface p-5 text-center shadow-card">
        <label htmlFor="amount" className="text-xs font-semibold tracking-wider text-muted uppercase">
          Spending amount
        </label>
        <div className="mt-1 flex items-center justify-center gap-2">
          <span className="font-heading text-3xl text-muted">₹</span>
          <input
            id="amount"
            inputMode="decimal"
            autoFocus
            placeholder="0"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            aria-invalid={Boolean(errors.amount)}
            className="w-40 bg-transparent text-center font-heading text-5xl font-bold text-indigo outline-none placeholder:text-line"
          />
        </div>
        {errors.amount && <p className="mt-1 text-xs font-medium text-error">{errors.amount}</p>}
        <div className="mt-3 flex justify-center gap-2">
          {QUICK_ADD.map((p) => (
            <button key={p} type="button" onClick={() => quickAdd(p)} className="rounded-full bg-bg px-3.5 py-2 text-sm font-semibold text-ink active:scale-95">
              +{formatINR(p)}
            </button>
          ))}
        </div>
      </section>

      {preview && (
        <section className={cx('flex gap-3 rounded-card border p-4', tone)} aria-live="polite">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-indigo text-white">
            <Sparkles className="size-5" />
          </span>
          <div className="text-sm">
            <p className="text-xs font-semibold tracking-wider text-indigo uppercase">AI guardrails</p>
            <p className="text-ink">
              {preview.remainingAfter >= 0
                ? `Logging ${formatINR(preview.amount)} leaves ${formatINR(preview.remainingAfter)} in ${preview.categoryName} for ${preview.daysRemaining} days (about ${formatINR(preview.dailyLimitAfter)}/day).`
                : `This puts ${preview.categoryName} ${formatINR(preview.shortfall)} over budget.`}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {preview.consumedAfter}% of this category used after logging. You can always save it.
            </p>
          </div>
        </section>
      )}

      <section className="rounded-card bg-surface p-4 shadow-card">
        <FormField label="Merchant / description" value={form.merchant} onChange={(e) => set('merchant', e.target.value)} error={errors.description} placeholder="e.g. Campus Canteen" maxLength={60} />
        <div className="-mx-4 mt-2 flex items-center gap-2 overflow-x-auto px-4">
          <span className="shrink-0 text-xs text-muted">Frequent:</span>
          {frequent.map((m) => (
            <button key={m} type="button" onClick={() => set('merchant', m)} className="shrink-0 rounded-full bg-violet-soft px-3 py-1.5 text-xs font-medium text-indigo">
              {m}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-card bg-surface p-4 shadow-card">
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Select category</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Budget category">
          {spendable.map((c) => {
            const active = form.categoryId === c.id
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => set('categoryId', c.id)}
                className={cx('relative flex flex-col items-start gap-2 rounded-2xl p-3 text-left transition', active ? 'bg-indigo text-white' : 'bg-bg text-ink')}
              >
                <CategoryIcon icon={c.icon} color={active ? '#FFFFFF' : c.color} size="sm" />
                <span className="text-sm leading-tight font-semibold">{c.name}</span>
                <span className={cx('text-xs', active ? 'text-white/75' : c.remaining < 0 ? 'text-error' : 'text-muted')}>
                  {c.remaining < 0 ? `${formatINR(-c.remaining)} over` : `${formatINR(c.remaining)} left`}
                </span>
                {active && <CheckCircle2 className="absolute top-3 right-3 size-4" />}
              </button>
            )
          })}
        </div>
        {errors.categoryId && <p className="mt-2 text-xs font-medium text-error">{errors.categoryId}</p>}
      </section>

      <section className="space-y-4 rounded-card bg-surface p-4 shadow-card">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Date" type="date" min={cycle.start} max={cycle.today} value={form.date} onChange={(e) => set('date', e.target.value)} error={errors.date} />
          <FormField label="Time" type="time" value={form.time} onChange={(e) => set('time', e.target.value)} error={errors.time} />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">Payment method</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Payment method">
            {paymentMethods.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={form.paymentMethod === m.id}
                onClick={() => set('paymentMethod', m.id)}
                className={cx('shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium whitespace-nowrap', form.paymentMethod === m.id ? 'bg-royal text-white' : 'bg-bg text-ink')}
              >
                {m.label}
              </button>
            ))}
          </div>
          {errors.paymentMethod && <p className="mt-1 text-xs font-medium text-error">{errors.paymentMethod}</p>}
        </div>
        <FormField label="Note (optional)" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="e.g. Split with roommates" maxLength={120} />
      </section>

      {errors.form && <p className="text-sm text-error">{errors.form}</p>}

      <Button full size="lg" icon={CheckCircle2} loading={saving} onClick={handleSave}>
        Save &amp; log expense
      </Button>
    </div>
  )
}
