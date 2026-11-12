import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'

/** Section title with an optional "See all" link on the right. */
export default function SectionHeader({ title, to, linkLabel = 'See all', right }) {
  return (
    <div className="mt-6 mb-2.5 flex items-center justify-between px-1">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {to ? (
        <Link to={to} className="flex items-center text-sm font-semibold text-royal">
          {linkLabel}
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        right
      )}
    </div>
  )
}
