import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useApp } from '../../hooks/useApp.js'
import { formatINR, fromPaise } from '../../utils/money.js'
import { CATEGORY_COLOR_CHOICES, CATEGORY_ICON_CHOICES, cx, renderIcon } from '../../utils/ui.js'
import Button from '../common/Button.jsx'
import FormField from '../common/FormField.jsx'
import Modal from '../common/Modal.jsx'

/**
 * Add a category (category = null) or edit / delete an existing one.
 * Deleting a category that has transactions requires choosing where to move them.
 * Parent should render with a `key` so the form resets for each category.
 */
export default function CategoryFormModal({ open, onClose, category }) {
  const { addCategory, updateCategory, deleteCategory, categories, transactions, summary } = useApp()
  const isEdit = Boolean(category)
  const isSavings = category?.kind === 'savings'

  const [name, setName] = useState(category?.name ?? '')
  const [amount, setAmount] = useState(category ? String(fromPaise(category.allocated)) : '')
  const [icon, setIcon] = useState(category?.icon ?? 'wallet')
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLOR_CHOICES[categories.length % CATEGORY_COLOR_CHOICES.length])
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reassignTo, setReassignTo] = useState('')

  const txCount = isEdit ? transactions.filter((t) => t.categoryId === category.id).length : 0
  const reassignOptions = categories.filter((c) => c.id !== category?.id && c.kind !== 'savings')

  async function handleSave() {
    setSaving(true)
    setErrors({})
    try {
      if (isEdit) await updateCategory(category.id, { name, allocated: amount, icon, color })
      else await addCategory({ name, allocated: amount, icon, color })
      onClose()
    } catch (error) {
      setErrors(error.fieldErrors ?? { form: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deleteCategory(category.id, txCount > 0 ? { reassignTo } : {})
      onClose()
    } catch (error) {
      setErrors({ form: error.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit category' : 'New category'}
      footer={
        confirmDelete ? (
          <div className="flex gap-3">
            <Button variant="outline" full onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button variant="danger" full loading={saving} disabled={txCount > 0 && !reassignTo} onClick={handleDelete}>
              Delete
            </Button>
          </div>
        ) : (
          <Button full size="lg" loading={saving} onClick={handleSave}>
            {isEdit ? 'Save changes' : 'Add category'}
          </Button>
        )
      }
    >
      {confirmDelete ? (
        <div className="space-y-3 pb-2">
          <p className="text-sm text-ink">
            Delete <strong>{category.name}</strong>? Its {formatINR(category.allocated)} allocation will become unallocated.
          </p>
          {txCount > 0 && (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Move its {txCount} transactions to</span>
              <select
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                className="min-h-12 w-full rounded-2xl border border-line bg-bg px-3"
              >
                <option value="">Choose a category…</option>
                {reassignOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {errors.form && <p className="text-sm text-error">{errors.form}</p>}
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          <FormField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="e.g. Gym & Fitness" maxLength={30} />
          <FormField
            label="Monthly allocation"
            prefix="₹"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={errors.allocated}
            placeholder="0"
            hint={`Unallocated right now: ${formatINR(summary.unallocated)}`}
          />

          {!isSavings && (
            <>
              <div>
                <p className="mb-1.5 text-sm font-medium">Icon</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_ICON_CHOICES.map((key) => {
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-label={key}
                        aria-pressed={icon === key}
                        onClick={() => setIcon(key)}
                        className={cx('grid size-11 place-items-center rounded-2xl border', icon === key ? 'border-royal bg-royal/10 text-royal' : 'border-line text-muted')}
                      >
                        {renderIcon(key, { className: 'size-5' })}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium">Colour</p>
                <div className="flex gap-3">
                  {CATEGORY_COLOR_CHOICES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Colour ${c}`}
                      aria-pressed={color === c}
                      onClick={() => setColor(c)}
                      className={cx('size-9 rounded-full ring-offset-2', color === c && 'ring-2 ring-ink')}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {errors.form && <p className="text-sm text-error">{errors.form}</p>}

          {isEdit && !isSavings && (
            <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-2 text-sm font-semibold text-error">
              <Trash2 className="size-4" /> Delete category
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}
