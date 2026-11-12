import { STATUS_META } from '../../utils/calculations.js'
import { cx, toneFor } from '../../utils/ui.js'

/** Pill showing a budget status (Safe / On Track / Fast Pace / Over Budget), or a custom label + tone. */
export default function StatusBadge({ status, label, tone, className }) {
  const meta = status ? STATUS_META[status] : null
  const t = toneFor(tone ?? meta?.tone)
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', t.soft, t.text, className)}>
      <span className={cx('size-1.5 rounded-full', t.bar)} aria-hidden="true" />
      {label ?? meta?.label}
    </span>
  )
}
