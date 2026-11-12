import { useState } from 'react'
import { useApp } from '../../hooks/useApp.js'
import { formatINR, parseRupeeInput, rupees } from '../../utils/money.js'
import Button from '../common/Button.jsx'
import FormField from '../common/FormField.jsx'
import Modal from '../common/Modal.jsx'

/** Moves money from this month's Savings bucket into a goal. Render with key={goal.id}. */
export default function ContributeModal({ goal, onClose }) {
  const { contributeToGoal, summary } = useApp()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  if (!goal) return null

  const available = summary.savingsRemaining
  const needed = goal.target - goal.saved
  const quick = [rupees(100), rupees(250), rupees(500)].filter((v) => v <= Math.min(available, needed))
  const preview = parseRupeeInput(amount)

  async function handleSubmit() {
    setSaving(true)
    setError('')
    try {
      await contributeToGoal(goal.id, amount)
      onClose()
    } catch (err) {
      setError(err.fieldErrors?.amount ?? err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add to ${goal.name}`}
      footer={
        <Button full size="lg" loading={saving} disabled={!preview} onClick={handleSubmit}>
          {preview ? `Move ${formatINR(preview)} to goal` : 'Enter an amount'}
        </Button>
      }
    >
      <p className="rounded-2xl bg-violet-soft px-4 py-3 text-sm text-indigo">
        {formatINR(available)} available in this month's Savings bucket · {formatINR(needed)} still needed for this goal.
      </p>
      <FormField
        className="mt-4"
        label="Amount"
        prefix="₹"
        inputMode="decimal"
        autoFocus
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={error}
        placeholder="0"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {quick.map((v) => (
          <button key={v} type="button" onClick={() => setAmount(String(v / 100))} className="rounded-full bg-bg px-3.5 py-2 text-sm font-semibold text-ink">
            {formatINR(v)}
          </button>
        ))}
        {Math.min(available, needed) > 0 && (
          <button type="button" onClick={() => setAmount(String(Math.min(available, needed) / 100))} className="rounded-full bg-bg px-3.5 py-2 text-sm font-semibold text-royal">
            Max {formatINR(Math.min(available, needed))}
          </button>
        )}
      </div>
    </Modal>
  )
}
