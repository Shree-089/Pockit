import { useState } from 'react'
import { useApp } from '../../hooks/useApp.js'
import { addDays } from '../../utils/calculations.js'
import { GOAL_ICON_CHOICES, cx, renderIcon } from '../../utils/ui.js'
import Button from '../common/Button.jsx'
import FormField from '../common/FormField.jsx'
import Modal from '../common/Modal.jsx'

/** Create a new savings goal. */
export default function GoalFormModal({ open, onClose }) {
  const { createGoal, cycle } = useApp()
  const [form, setForm] = useState({ name: '', target: '', targetDate: '', category: '', icon: 'target' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function handleSubmit() {
    setSaving(true)
    setErrors({})
    try {
      await createGoal(form)
      setForm({ name: '', target: '', targetDate: '', category: '', icon: 'target' })
      onClose()
    } catch (err) {
      setErrors(err.fieldErrors ?? { form: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New savings goal"
      footer={
        <Button full size="lg" loading={saving} onClick={handleSubmit}>
          Create goal
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <FormField label="Goal name" value={form.name} onChange={set('name')} error={errors.name} placeholder="e.g. New headphones" maxLength={40} />
        <FormField label="Target amount" prefix="₹" inputMode="decimal" value={form.target} onChange={set('target')} error={errors.target} placeholder="0" />
        <FormField label="Target date" type="date" min={addDays(cycle.today, 1)} value={form.targetDate} onChange={set('targetDate')} error={errors.targetDate} />
        <FormField label="Category (optional)" value={form.category} onChange={set('category')} placeholder="e.g. Tech, Travel" maxLength={24} />
        <div>
          <p className="mb-1.5 text-sm font-medium">Icon</p>
          <div className="flex flex-wrap gap-2">
            {GOAL_ICON_CHOICES.map((key) => {
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  aria-pressed={form.icon === key}
                  onClick={() => setForm((f) => ({ ...f, icon: key }))}
                  className={cx('grid size-11 place-items-center rounded-2xl border', form.icon === key ? 'border-royal bg-royal/10 text-royal' : 'border-line text-muted')}
                >
                  {renderIcon(key, { className: 'size-5' })}
                </button>
              )
            })}
          </div>
        </div>
        {errors.form && <p className="text-sm text-error">{errors.form}</p>}
      </div>
    </Modal>
  )
}
