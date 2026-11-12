import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, CheckCircle2, CircleAlert, Clock, Loader2, RotateCw, ShieldCheck } from 'lucide-react'
import { useApp } from '../hooks/useApp.js'
import { formatINR, parseRupeeInput } from '../utils/money.js'
import { cx, riskLevelOf } from '../utils/ui.js'
import BudgetGuardModal from '../components/payments/BudgetGuardModal.jsx'
import PayPalButtons from '../components/payments/PayPalButtons.jsx'
import Button from '../components/common/Button.jsx'
import CategoryIcon from '../components/common/CategoryIcon.jsx'
import FormField from '../components/common/FormField.jsx'

/*
 * Checkout with the Pre-Payment Budget Guard and PayPal (Sandbox) Checkout.
 *   form -> Budget Guard (if risky; advisory, never blocks) -> pay (PayPal buttons) -> done
 * The server creates the PayPal order from its own stored order, and captures and verifies it.
 * Nothing is recorded from the browser: the expense exists only after the server's verified capture.
 */

const formatCharge = (charge) => (charge.currency === 'INR' ? formatINR(charge.amount) : `${charge.currency} ${charge.value}`)

export default function PaymentCheckout() {
  const { summary, settings, evaluatePurchase, getPaymentConfig, createPaymentOrder, capturePaymentOrder, cancelPaymentOrder, categoriesById } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const spendable = summary.spendableCategories

  const [form, setForm] = useState({
    description: params.get('desc') ?? '',
    merchant: '',
    amount: params.get('amount') ?? '',
    categoryId: spendable.some((c) => c.id === params.get('category')) ? params.get('category') : '',
  })
  const [step, setStep] = useState('form') // form | pay | done
  const [guard, setGuard] = useState(null)
  const [showGuard, setShowGuard] = useState(false)
  const [config, setConfig] = useState({ status: 'loading', data: null, error: null })
  const [order, setOrder] = useState(null) // last order created for PayPal
  const [approval, setApproval] = useState(null) // { order, paypalOrderId } awaiting a successful capture
  const [outcome, setOutcome] = useState(null)
  const [capturing, setCapturing] = useState(false)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const orderRef = useRef(null)
  const createErrorRef = useRef('')
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const amount = parseRupeeInput(form.amount)
  const category = categoriesById[form.categoryId]

  useEffect(() => {
    let active = true
    getPaymentConfig()
      .then((data) => active && setConfig({ status: data.enabled ? 'ready' : 'disabled', data, error: null }))
      .catch((err) => active && setConfig({ status: err.code === 'UNSUPPORTED' ? 'offline' : 'error', data: null, error: err.message }))
    return () => {
      active = false
    }
  }, [getPaymentConfig])

  /* ---------- Step 1: Budget Guard (unchanged behaviour) ---------- */
  async function check() {
    const fieldErrors = {}
    if (!amount || amount <= 0) fieldErrors.amount = 'Enter a valid amount'
    if (form.description.trim().length < 2) fieldErrors.description = 'Add a short description'
    if (!form.categoryId) fieldErrors.categoryId = 'Choose a budget category'
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length) return
    setBusy(true)
    setNote('')
    try {
      const result = await evaluatePurchase({ categoryId: form.categoryId, amount, description: form.description.trim(), explain: true })
      setGuard(result)
      if (settings.guardEnabled && riskLevelOf(result) !== 'safe') setShowGuard(true)
      else goToPay()
    } catch (err) {
      setErrors(err.fieldErrors ?? { form: err.message })
    } finally {
      setBusy(false)
    }
  }

  function goToPay() {
    setShowGuard(false)
    setErrors({})
    setNote('')
    setStep('pay')
  }

  function cancelFromGuard() {
    setShowGuard(false)
    setNote(`Good call. You kept ${formatINR(amount)} in ${guard.assessment.categoryName}.`)
  }

  /* ---------- Step 2: PayPal ---------- */

  // Called by PayPal's button: the SERVER creates the local order and then the PayPal order.
  async function handleCreateOrder() {
    setErrors({})
    setNote('')
    createErrorRef.current = ''
    try {
      const created = await createPaymentOrder({ categoryId: form.categoryId, amount, description: form.description.trim(), merchant: form.merchant.trim() || undefined })
      // The PayPal SDK on this page was loaded for cfg.chargeCurrency. If the server's order uses another
      // currency (e.g. the server setting changed after this page loaded), PayPal approval would fail,
      // so cancel the order here instead of sending the buyer to PayPal's error page.
      const sdkCurrency = config.data.chargeCurrency
      const orderCurrency = created.paypal?.currency ?? created.charge?.currency
      console.info(`[pockit:paypal] order ${created.paypalOrderId} ref=${created.orderId} order_currency=${orderCurrency} sdk_currency=${sdkCurrency} payee_merchant_id=${created.paypal?.payeeMerchantId ?? 'not returned'}`)
      if (orderCurrency !== sdkCurrency) {
        await cancelPaymentOrder(created.orderId).catch(() => {})
        throw new Error(`Checkout settings changed: the order is in ${orderCurrency} but PayPal was loaded for ${sdkCurrency}. Reload the page and try again. Nothing was deducted.`)
      }
      orderRef.current = created
      setOrder(created)
      return created.paypalOrderId
    } catch (err) {
      createErrorRef.current = err.message
      throw err // PayPal then calls onError
    }
  }

  async function confirmCapture(current, paypalOrderId, actions) {
    setCapturing(true)
    setErrors({})
    try {
      const result = await capturePaymentOrder(current.orderId, { paypalOrderId })
      orderRef.current = null
      setApproval(null)
      setOutcome(result)
      setStep('done')
    } catch (err) {
      if (err.code === 'INSTRUMENT_DECLINED' && actions?.restart) {
        setNote('PayPal declined that payment method. Please choose another one.')
        return actions.restart()
      }
      // The order stays open on the server; confirming again is safe (idempotent).
      setApproval({ order: current, paypalOrderId })
      setErrors({ form: `${err.message} Nothing was deducted.` })
    } finally {
      setCapturing(false)
    }
  }

  // Buyer approved in PayPal: the SERVER captures and verifies before anything is recorded.
  function handleApprove(data, actions) {
    const current = orderRef.current
    if (!current || data.orderID !== current.paypalOrderId) {
      setErrors({ form: 'This PayPal approval does not match the current payment. Nothing was deducted.' })
      return undefined
    }
    return confirmCapture(current, data.orderID, actions)
  }

  async function handleCancel() {
    const current = orderRef.current
    orderRef.current = null
    if (current) await cancelPaymentOrder(current.orderId).catch(() => {})
    setNote('Payment cancelled in PayPal. Nothing was deducted.')
  }

  function handleError() {
    const current = orderRef.current
    orderRef.current = null
    if (current) cancelPaymentOrder(current.orderId).catch(() => {})
    setErrors({ form: createErrorRef.current || 'PayPal could not complete the payment. Nothing was deducted.' })
  }

  /* ---------- Done ---------- */
  if (step === 'done') return <Outcome outcome={outcome} categoriesById={categoriesById} navigate={navigate} />

  /* ---------- Pay ---------- */
  if (step === 'pay') {
    const a = guard.assessment
    const cfg = config.data
    return (
      <div className="space-y-4">
        <section className="rounded-card bg-surface p-5 shadow-card">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">Payment summary</p>
          <div className="mt-3 flex items-center gap-3">
            <CategoryIcon icon={category?.icon} color={category?.color} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{form.description.trim()}</p>
              <p className="text-xs text-muted">{a.categoryName}</p>
            </div>
            <p className="font-heading text-2xl font-bold text-indigo">{formatINR(amount)}</p>
          </div>
          <dl className="mt-4 divide-y divide-line rounded-2xl bg-bg px-4 text-sm">
            <Row label="Merchant" value={form.merchant.trim() || form.description.trim()} />
            <Row label="Budget category" value={a.categoryName} />
            <Row label="Left in category after" value={formatINR(a.remainingAfter)} strong={a.remainingAfter < 0} />
            {order?.charge && <Row label="PayPal charge" value={formatCharge(order.charge)} />}
          </dl>
          {cfg && cfg.chargeCurrency !== 'INR' && (
            <p className="mt-3 rounded-2xl bg-warning/12 px-4 py-3 text-xs text-ink">
              PayPal charges in {cfg.chargeCurrency} at the configured test rate of ₹{cfg.fxRate} per 1 {cfg.chargeCurrency}. Your {a.categoryName} budget is charged {formatINR(amount)}.
            </p>
          )}
        </section>

        {note && <p className="rounded-2xl bg-success/10 px-4 py-3 text-sm font-medium text-success" role="status">{note}</p>}
        {errors.form && <p className="rounded-2xl bg-error/10 px-4 py-3 text-sm text-error" role="alert">{errors.form}</p>}

        <section className="rounded-card bg-surface p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-ink">Pay with PayPal</p>
            {cfg && cfg.environment !== 'live' && (
              <span className="rounded-full bg-violet-soft px-2 py-0.5 text-[10px] font-semibold text-indigo">
                {cfg.environment === 'sandbox' ? 'Sandbox: test money only' : 'Test environment'}
              </span>
            )}
          </div>
          {config.status === 'loading' && (
            <p className="flex items-center justify-center gap-2 py-3 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" /> Preparing checkout…
            </p>
          )}
          {config.status === 'offline' && <p className="text-sm text-muted">PayPal checkout needs the Pockit server. You&apos;re using offline demo data, so payments are unavailable.</p>}
          {config.status === 'disabled' && <p className="text-sm text-muted">PayPal isn&apos;t configured on the server yet (PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET).</p>}
          {config.status === 'error' && <p className="text-sm text-error">Couldn&apos;t load checkout settings. {config.error}</p>}
          {config.status === 'ready' && (
            <>
              {capturing && (
                <p className="mb-3 flex items-center gap-2 rounded-2xl bg-royal/10 px-4 py-3 text-sm font-medium text-royal" role="status">
                  <Loader2 className="size-4 animate-spin" /> Confirming your payment with PayPal…
                </p>
              )}
              {approval && !capturing && (
                <Button full className="mb-3" icon={RotateCw} onClick={() => confirmCapture(approval.order, approval.paypalOrderId)}>
                  Try confirming again
                </Button>
              )}
              <PayPalButtons
                clientId={cfg.clientId}
                currency={cfg.chargeCurrency}
                createOrder={handleCreateOrder}
                onApprove={handleApprove}
                onCancel={handleCancel}
                onError={handleError}
                busy={capturing || Boolean(approval)}
              />
            </>
          )}
        </section>

        <Button variant="ghost" size="sm" icon={ArrowLeft} disabled={capturing} onClick={() => setStep('form')}>
          Edit purchase
        </Button>
      </div>
    )
  }

  /* ---------- Form ---------- */
  return (
    <div className="space-y-4">
      {note && <p className="rounded-2xl bg-success/10 px-4 py-3 text-sm font-medium text-success">{note}</p>}

      <section className="rounded-card bg-surface p-5 text-center shadow-card">
        <label htmlFor="pay-amount" className="text-xs font-semibold tracking-wider text-muted uppercase">
          Purchase amount
        </label>
        <div className="mt-1 flex items-center justify-center gap-2">
          <span className="font-heading text-3xl text-muted">₹</span>
          <input
            id="pay-amount"
            inputMode="decimal"
            placeholder="0"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
            className="w-40 bg-transparent text-center font-heading text-5xl font-bold text-indigo outline-none placeholder:text-line"
          />
        </div>
        {errors.amount && <p className="mt-1 text-xs font-medium text-error">{errors.amount}</p>}
      </section>

      <section className="space-y-3 rounded-card bg-surface p-4 shadow-card">
        <FormField label="What are you buying?" value={form.description} onChange={(e) => set('description', e.target.value)} error={errors.description} placeholder="e.g. Dinner order" maxLength={60} />
        <FormField label="Merchant (optional)" value={form.merchant} onChange={(e) => set('merchant', e.target.value)} placeholder="e.g. Swiggy" maxLength={60} />
      </section>

      <section className="rounded-card bg-surface p-4 shadow-card">
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Pay from budget</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Budget category">
          {spendable.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={form.categoryId === c.id}
              onClick={() => set('categoryId', c.id)}
              className={cx('flex flex-col items-start gap-1.5 rounded-2xl p-3 text-left', form.categoryId === c.id ? 'bg-indigo text-white' : 'bg-bg text-ink')}
            >
              <CategoryIcon icon={c.icon} color={form.categoryId === c.id ? '#FFFFFF' : c.color} size="sm" />
              <span className="text-sm leading-tight font-semibold">{c.name}</span>
              <span className={cx('text-xs', form.categoryId === c.id ? 'text-white/75' : 'text-muted')}>{formatINR(c.remaining)} left</span>
            </button>
          ))}
        </div>
        {errors.categoryId && <p className="mt-2 text-xs font-medium text-error">{errors.categoryId}</p>}
      </section>

      {errors.form && <p className="rounded-2xl bg-error/10 px-4 py-3 text-sm text-error">{errors.form}</p>}

      <Button full size="lg" icon={busy ? Loader2 : ShieldCheck} loading={busy} onClick={check}>
        {busy ? 'Checking your budget…' : 'Continue to payment'}
      </Button>
      <p className="text-center text-xs text-muted">
        {settings.guardEnabled ? 'Pockit checks your budget first. You can always proceed.' : 'Budget Guard is off (turn it on in Profile).'}{' '}
        <Link to="/profile" className="text-royal">
          Settings
        </Link>
      </p>

      {showGuard && guard && (
        <BudgetGuardModal result={guard} purchase={{ description: form.description.trim() }} onCancel={cancelFromGuard} onProceed={goToPay} proceeding={false} />
      )}
    </div>
  )
}

/** Final state after the server's capture: completed, declined, pending or unverified. */
function Outcome({ outcome, categoriesById, navigate }) {
  const tx = outcome.transaction
  const category = tx ? categoriesById[tx.categoryId] : null
  const view = {
    COMPLETED: { icon: CheckCircle2, tone: 'bg-success/10 text-success', title: 'Payment successful', body: tx ? `${formatINR(tx.amount)} paid to ${tx.merchant}. ${formatINR(category?.remaining ?? 0)} left in ${category?.name}.` : 'Your payment was confirmed.' },
    FAILED: { icon: CircleAlert, tone: 'bg-error/10 text-error', title: 'Payment failed', body: 'PayPal declined the payment. Nothing was deducted from your budget.' },
    PENDING: { icon: Clock, tone: 'bg-warning/12 text-warning', title: 'Payment pending', body: outcome.message ?? 'PayPal is still processing this payment. Nothing has been deducted yet.' },
    NEEDS_REVIEW: { icon: CircleAlert, tone: 'bg-warning/12 text-warning', title: 'Payment needs review', body: outcome.message ?? 'We could not verify this payment, so nothing was deducted.' },
  }[outcome.status] ?? { icon: CircleAlert, tone: 'bg-error/10 text-error', title: 'Payment not completed', body: 'Nothing was deducted from your budget.' }
  const Icon = view.icon
  const charge = outcome.order?.charge
  return (
    <div className="flex flex-col items-center pt-8 text-center">
      <span className={cx('grid size-20 place-items-center rounded-full', view.tone)}>
        <Icon className="size-10" />
      </span>
      <h2 className="mt-4 text-2xl font-bold text-ink">{view.title}</h2>
      <p className="mt-1 text-sm text-muted">{view.body}</p>
      {outcome.status === 'COMPLETED' && charge && charge.currency !== 'INR' && (
        <p className="mt-2 text-xs text-muted">
          PayPal charged {formatCharge(charge)} (test rate ₹{charge.fxRate}/{charge.currency}).
        </p>
      )}
      <p className="mt-2 text-xs text-muted">
        Reference {outcome.order?.orderId}
        {outcome.order?.paypalOrderId ? ` · PayPal order ${outcome.order.paypalOrderId}` : ''}
      </p>
      <div className="mt-6 flex w-full flex-col gap-2">
        {tx && (
          <Button full size="lg" onClick={() => navigate('/transactions', { state: { savedId: tx.id } })}>
            View in Passbook
          </Button>
        )}
        <Button full variant="outline" to="/">
          Back to Home
        </Button>
      </div>
    </div>
  )
}

function Row({ label, value, strong }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className={cx('truncate text-right font-medium', strong ? 'text-error' : 'text-ink')}>{value}</dd>
    </div>
  )
}
