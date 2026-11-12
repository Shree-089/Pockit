import { Link } from 'react-router'
import { Loader2 } from 'lucide-react'
import { cx } from '../../utils/ui.js'

const VARIANTS = {
  primary: 'bg-indigo text-white hover:bg-indigo/90',
  secondary: 'bg-violet-soft text-indigo hover:bg-lavender/30',
  outline: 'border border-line bg-surface text-ink hover:bg-bg',
  ghost: 'text-royal hover:bg-royal/10',
  danger: 'bg-error/10 text-error hover:bg-error/15',
  interactive: 'bg-royal text-white hover:bg-royal/90',
}

const SIZES = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-14 px-6 text-base gap-2',
}

/**
 * One button for the whole app.
 * - `to` renders a router Link instead of a <button>.
 * - `loading` shows a spinner and disables the button.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  full = false,
  loading = false,
  icon: Icon,
  to,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}) {
  const classes = cx(
    'inline-flex items-center justify-center rounded-full font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    full && 'w-full',
    className,
  )
  const content = (
    <>
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon && <Icon className="size-4" />}
      {children}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {content}
      </Link>
    )
  }
  return (
    <button type={type} className={classes} disabled={disabled || loading} {...props}>
      {content}
    </button>
  )
}
