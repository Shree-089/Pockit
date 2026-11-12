import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { useApp } from '../hooks/useApp.js'
import { formatINR, fromPaise, parseRupeeInput, percentOf } from '../utils/money.js'
import { CATEGORY_COLOR_CHOICES, cx } from '../utils/ui.js'
import AiSourceBadge from '../components/ai/AiSourceBadge.jsx'
import Button from '../components/common/Button.jsx'
import CategoryIcon from '../components/common/CategoryIcon.jsx'
import FormField from '../components/common/FormField.jsx'
import ProgressBar from '../components/common/ProgressBar.jsx'

const STEPS = ['Funds', 'Lifestyle', 'Suggestions', 'Customise', 'Confirm']
const EXAMPLES = [
  'I live in a hostel and eat outside 4–5 times a week.',
  'I travel home once a month by train.',
  'I have project work and buy electronics components.',
  'I want to save for a laptop.',
]

/** Editable row model: amounts are typed as rupee text and converted to paise for every calculation. */
const toRows = (categories) =>
  categories.map((c, i) => ({
    key: c.tempId ?? `${c.name}-${i}`,
    name: c.name,
    amountText: String(fromPaise(c.allocated)),
    icon: c.icon ?? 'wallet',
    color: c.color ?? CATEGORY_COLOR_CHOICES[i % CATEGORY_COLOR_CHOICES.length],
    kind: c.kind ?? 'spending',
    reason: c.reason ?? '',
  }))

export default function BudgetAllocation() {
  const { settings, categories, generateBudgetAllocation, saveBudgetPlan } = useApp()
  const navigate = useNavigate()
  const currentSavings = categories.find((c) => c.kind === 'savings')?.allocated ?? 0

  const [step, setStep] = useState(0)
  const [funds, setFunds] = useState({ monthly: settings.monthlyAllowance ? String(fromPaise(settings.monthlyAllowance)) : '', savings: String(fromPaise(currentSavings)) })
  const [description, setDescription] = useState('')
  const [suggestion, setSuggestion] = useState(null) // { summary, source, model, notice }
  const [rows, setRows] = useState([])
  const [variant, setVariant] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const monthly = parseRupeeInput(funds.monthly)
  const savings = parseRupeeInput(funds.savings || '0')
  const parsedRows = rows.map((r) => ({ ...r, allocated: parseRupeeInput(r.amountText) }))
  const total = parsedRows.reduce((sum, r) => sum + (r.allocated ?? 0), 0)
  const remaining = (monthly ?? 0) - total
  const rowProblems = parsedRows.some((r) => r.allocated === null || r.name.trim().length < 2)
  const duplicateName = useMemo(() => {
    const names = parsedRows.map((r) => r.name.trim().toLowerCase())
    return names.find((n, i) => n && names.indexOf(n) !== i)
  }, [parsedRows])
  const canConfirm = parsedRows.length > 0 && !rowProblems && !duplicateName && remaining >= 0

  function validateFunds() {
    const errs = {}
    if (!monthly || monthly <= 0) errs.monthly = 'Enter the amount you receive each month'
    if (savings === null) errs.savings = 'Enter a valid amount'
    else if (monthly && savings >= monthly) errs.savings = 'Savings must be less than your monthly funds'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function generate(nextVariant = variant) {
    setLoading(true)
    setError('')
    setStep(2)
    try {
      const result = await generateBudgetAllocation({ monthlyAmount: monthly, savingsAmount: savings, description, variant: nextVariant })
      setSuggestion({ summary: result.summary, source: result.source, model: result.model, notice: result.notice })
      setRows(toRows(result.categories))
      setVariant(nextVariant)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const updateRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const removeRow = (key) => setRows((rs) => rs.filter((r) => r.key !== key))
  const addRow = () =>
    setRows((rs) => [...rs, { key: `new-${Date.now()}`, name: '', amountText: remaining > 0 ? String(fromPaise(remaining)) : '0', icon: 'wallet', color: CATEGORY_COLOR_CHOICES[rs.length % CATEGORY_COLOR_CHOICES.length], kind: 'spending', reason: 'Added by you' }])

  async function confirm() {
    setSaving(true)
    setError('')
    try {
      await saveBudgetPlan({
        allowance: monthly,
        categories: parsedRows.map((r) => ({ name: r.name.trim(), allocated: r.allocated, icon: r.icon, color: r.color, kind: r.kind })),
      })
      navigate('/budgets', { replace: true })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <StepIndicator step={step} />

      {step === 0 && (
        <section className="space-y-4 rounded-card bg-surface p-5 shadow-card">
          <div>
            <h2 className="text-xl font-bold text-ink">How much do you have this month?</h2>
            <p className="text-sm text-muted">Your allowance, pocket money or stipend.</p>
          </div>
          <FormField label="Monthly funds" prefix="₹" inputMode="decimal" value={funds.monthly} onChange={(e) => setFunds((f) => ({ ...f, monthly: e.target.value }))} error={fieldErrors.monthly} placeholder="10000" />
          <FormField label="I want to save" prefix="₹" inputMode="decimal" value={funds.savings} onChange={(e) => setFunds((f) => ({ ...f, savings: e.target.value }))} error={fieldErrors.savings} hint="Set aside first. Use 0 if you don't want to save this month." />
          <Button full size="lg" icon={ArrowRight} onClick={() => validateFunds() && setStep(1)}>
            Next
          </Button>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4 rounded-card bg-surface p-5 shadow-card">
          <div>
            <h2 className="text-xl font-bold text-ink">Tell Pockit about your month</h2>
            <p className="text-sm text-muted">Where you live, how often you eat out, travel, projects, anything regular.</p>
          </div>
          <FormField
            as="textarea"
            label="Your lifestyle and expected expenses"
            rows={6}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="I'm in a hostel. I spend around ₹100–150 when I eat outside. I need money for projects, stationery and travelling home…"
            inputClassName="resize-none"
            hint={`${description.length}/1000`}
          />
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setDescription((d) => (d ? `${d} ${ex}` : ex))} className="rounded-full bg-violet-soft px-3 py-1.5 text-xs font-medium text-indigo">
                + {ex}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" icon={ArrowLeft} onClick={() => setStep(0)}>
              Back
            </Button>
            <Button full size="lg" icon={Sparkles} disabled={description.trim().length < 10} onClick={() => generate(0)}>
              Generate my budget
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          {loading ? (
            <div className="rounded-card bg-violet-soft/70 p-6 text-center shadow-card" aria-busy="true">
              <Sparkles className="mx-auto size-8 animate-pulse text-indigo" />
              <p className="mt-2 font-semibold text-indigo">Pockit AI is planning your budget…</p>
              <p className="text-sm text-muted">This usually takes a few seconds.</p>
            </div>
          ) : error ? (
            <div className="rounded-card bg-surface p-5 shadow-card">
              <p className="flex items-center gap-2 text-sm text-error">
                <AlertTriangle className="size-4" /> {error}
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Edit description
                </Button>
                <Button icon={RefreshCw} onClick={() => generate(variant)}>
                  Try again
                </Button>
              </div>
            </div>
          ) : (
            suggestion && (
              <>
                <div className="rounded-card bg-violet-soft/70 p-4 shadow-card">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-semibold tracking-wider text-indigo uppercase">Suggested split</p>
                    <AiSourceBadge source={suggestion.source} model={suggestion.model} />
                  </div>
                  <p className="text-sm text-ink">{suggestion.summary}</p>
                  {suggestion.notice && <p className="mt-1 text-xs text-muted">{suggestion.notice}</p>}
                </div>
                <ul className="space-y-2">
                  {parsedRows.map((r) => (
                    <li key={r.key} className="flex gap-3 rounded-card bg-surface p-3 shadow-card">
                      <CategoryIcon icon={r.icon} color={r.color} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between gap-2">
                          <p className="truncate font-semibold text-ink">{r.name}</p>
                          <p className="shrink-0 font-heading font-bold text-ink">{formatINR(r.allocated ?? 0)}</p>
                        </div>
                        <p className="text-xs text-muted">{r.reason}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <TotalBar total={total} monthly={monthly} />
                <div className="flex gap-3">
                  <Button variant="outline" icon={RefreshCw} onClick={() => generate(variant + 1)}>
                    Regenerate
                  </Button>
                  <Button full size="lg" icon={ArrowRight} onClick={() => setStep(3)}>
                    Customise
                  </Button>
                </div>
              </>
            )
          )}
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3">
          <p className="px-1 text-sm text-muted">Rename, change amounts, add or remove categories. You are in control: the AI only suggests.</p>
          {rows.map((r) => {
            const paise = parseRupeeInput(r.amountText)
            return (
              <div key={r.key} className="rounded-card bg-surface p-3 shadow-card">
                <div className="flex items-center gap-2">
                  <CategoryIcon icon={r.icon} color={r.color} size="sm" />
                  <input
                    aria-label="Category name"
                    value={r.name}
                    onChange={(e) => updateRow(r.key, { name: e.target.value })}
                    disabled={r.kind === 'savings'}
                    maxLength={30}
                    placeholder="Category name"
                    className={cx('min-h-10 min-w-0 flex-1 rounded-xl border bg-bg px-3 text-sm font-semibold outline-none focus:border-royal', r.name.trim().length < 2 ? 'border-error' : 'border-line')}
                  />
                  <div className={cx('flex w-28 items-center rounded-xl border bg-bg px-2', paise === null ? 'border-error' : 'border-line')}>
                    <span className="text-sm text-muted">₹</span>
                    <input
                      aria-label={`${r.name} amount`}
                      inputMode="decimal"
                      value={r.amountText}
                      onChange={(e) => updateRow(r.key, { amountText: e.target.value })}
                      className="min-h-10 w-full bg-transparent px-1 text-right text-sm font-semibold outline-none"
                    />
                  </div>
                  {r.kind !== 'savings' && (
                    <button type="button" onClick={() => removeRow(r.key)} aria-label={`Remove ${r.name}`} className="grid size-10 place-items-center rounded-full text-muted hover:bg-error/10 hover:text-error">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                {monthly > 0 && paise !== null && <p className="mt-1 pl-11 text-[11px] text-muted">{percentOf(paise, monthly, 0)}% of your funds</p>}
              </div>
            )
          })}
          <Button variant="secondary" full icon={Plus} onClick={addRow} disabled={rows.length >= 20}>
            Add category
          </Button>
          <TotalBar total={total} monthly={monthly} />
          {duplicateName && <p className="text-sm text-error">Two categories are named “{duplicateName}”. Rename one.</p>}
          <div className="flex gap-3">
            <Button variant="outline" icon={ArrowLeft} onClick={() => setStep(2)}>
              Back
            </Button>
            <Button full size="lg" icon={ArrowRight} disabled={!canConfirm} onClick={() => setStep(4)}>
              Review
            </Button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4">
          <div className="rounded-card bg-surface p-5 shadow-card">
            <h2 className="text-xl font-bold text-ink">Confirm your budget</h2>
            <dl className="mt-3 divide-y divide-line text-sm">
              {parsedRows.map((r) => (
                <div key={r.key} className="flex justify-between py-2">
                  <dt className="text-ink">{r.name}</dt>
                  <dd className="font-semibold">{formatINR(r.allocated)}</dd>
                </div>
              ))}
              <div className="flex justify-between py-2 font-bold">
                <dt>Total allocated</dt>
                <dd>{formatINR(total)}</dd>
              </div>
              <div className="flex justify-between py-2 text-muted">
                <dt>Unallocated</dt>
                <dd>{formatINR(remaining)}</dd>
              </div>
            </dl>
          </div>
          <p className="px-1 text-xs text-muted">
            This replaces your current categories. Existing transactions stay linked to categories with the same name; history from removed categories moves to “Other”.
          </p>
          {error && <p className="rounded-2xl bg-error/10 px-4 py-3 text-sm text-error">{error}</p>}
          <div className="flex gap-3">
            <Button variant="outline" icon={ArrowLeft} onClick={() => setStep(3)}>
              Back
            </Button>
            <Button full size="lg" icon={Check} loading={saving} disabled={!canConfirm} onClick={confirm}>
              Confirm budget
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

function StepIndicator({ step }) {
  return (
    <ol className="flex gap-1.5" aria-label="Progress">
      {STEPS.map((label, i) => (
        <li key={label} className="flex-1">
          <div className={cx('h-1.5 rounded-full', i <= step ? 'bg-indigo' : 'bg-line')} />
          <p className={cx('mt-1 text-center text-[10px]', i === step ? 'font-semibold text-indigo' : 'text-muted')}>{label}</p>
        </li>
      ))}
    </ol>
  )
}

function TotalBar({ total, monthly }) {
  const over = total > monthly
  return (
    <div className={cx('rounded-card p-4 shadow-card', over ? 'bg-error/10' : 'bg-surface')}>
      <div className="flex justify-between text-sm">
        <span className="font-medium text-ink">Allocated</span>
        <span className={cx('font-heading font-bold', over ? 'text-error' : 'text-ink')}>
          {formatINR(total)} / {formatINR(monthly ?? 0)}
        </span>
      </div>
      <ProgressBar className="mt-2" value={monthly ? percentOf(total, monthly) : 0} tone={over ? 'error' : 'royal'} />
      <p className={cx('mt-1.5 text-xs', over ? 'font-semibold text-error' : 'text-muted')}>
        {over ? `Over by ${formatINR(total - monthly)}. Reduce some amounts to continue.` : `${formatINR(monthly - total)} unallocated`}
      </p>
    </div>
  )
}
