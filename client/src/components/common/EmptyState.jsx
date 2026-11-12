import { Construction } from 'lucide-react'

/*
 * Reusable "nothing here" card. Used now as a screen placeholder, and later
 * for real empty states (no transactions yet, no savings goals, no results).
 *
 * Props:
 *   icon        - a Lucide icon component (optional)
 *   title       - main message
 *   description - supporting text (optional)
 *   action      - any JSX, e.g. a button or link (optional)
 */
export default function EmptyState({ icon: Icon = Construction, title, description, action }) {
  return (
    <section className="mt-6 flex flex-col items-center rounded-card bg-surface px-6 py-10 text-center shadow-card">
      <span className="grid size-14 place-items-center rounded-2xl bg-violet-soft text-indigo">
        <Icon className="size-7" />
      </span>
      <h2 className="mt-4 text-xl font-bold text-ink">{title}</h2>
      {description && <p className="mt-1 max-w-64 text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </section>
  )
}