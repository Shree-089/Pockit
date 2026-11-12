import { cx, toneFor } from '../../utils/ui.js'

/**
 * Horizontal progress bar.
 *   value:  0–100 (values above 100 are clamped visually)
 *   tone:   success | royal | warning | error | lavender | muted
 *   marker: optional 0–100 position for a thin "where you should be" tick (e.g. % of month elapsed)
 */
export default function ProgressBar({ value, tone = 'royal', marker, size = 'md', label, className }) {
  const width = Math.min(100, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      aria-label={label}
      className={cx('relative w-full overflow-hidden rounded-full bg-line/70', size === 'sm' ? 'h-1.5' : 'h-2.5', className)}
    >
      <div className={cx('h-full rounded-full transition-[width] duration-500', toneFor(tone).bar)} style={{ width: `${width}%` }} />
      {marker != null && (
        <span
          aria-hidden="true"
          className="absolute top-0 h-full w-0.5 bg-ink/60"
          style={{ left: `calc(${Math.min(100, Math.max(0, marker))}% - 1px)` }}
        />
      )}
    </div>
  )
}
