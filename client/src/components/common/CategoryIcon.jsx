import { cx, renderIcon } from '../../utils/ui.js'

/** Rounded square icon tinted with the category's colour. */
export default function CategoryIcon({ icon, color = '#4169E1', size = 'md', className }) {
  const box = size === 'sm' ? 'size-9 rounded-xl' : size === 'lg' ? 'size-14 rounded-2xl' : 'size-11 rounded-2xl'
  const glyph = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-7' : 'size-5'
  return (
    <span
      className={cx('grid shrink-0 place-items-center', box, className)}
      style={{ backgroundColor: `${color}1A`, color }}
      aria-hidden="true"
    >
      {renderIcon(icon, { className: glyph })}
    </span>
  )
}
