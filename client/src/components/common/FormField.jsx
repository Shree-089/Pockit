import { useId } from 'react'
import { cx } from '../../utils/ui.js'

/**
 * Label + input + error message. Pass any <input> props through.
 * Use `prefix` for a leading symbol such as "₹".
 */
export default function FormField({ label, error, hint, prefix, className, inputClassName, as = 'input', ...props }) {
  const id = useId()
  const Tag = as
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <div
        className={cx(
          'flex items-center gap-2 rounded-2xl border bg-bg px-3.5 transition focus-within:border-royal focus-within:ring-2 focus-within:ring-royal/15',
          error ? 'border-error' : 'border-line',
        )}
      >
        {prefix && <span className="text-muted">{prefix}</span>}
        <Tag
          id={id}
          aria-invalid={Boolean(error)}
          className={cx('min-h-12 w-full bg-transparent py-3 text-ink outline-none placeholder:text-muted/70', inputClassName)}
          {...props}
        />
      </div>
      {error ? (
        <p className="mt-1 text-xs font-medium text-error">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-muted">{hint}</p>
      )}
    </div>
  )
}
