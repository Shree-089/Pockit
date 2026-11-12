import { cx } from '../../utils/ui.js'

/** White rounded surface used by almost every section. Pass `as="button"` for tappable cards. */
export default function Card({ as: Tag = 'section', className, children, ...props }) {
  return (
    <Tag className={cx('rounded-card bg-surface p-4 shadow-card', className)} {...props}>
      {children}
    </Tag>
  )
}
