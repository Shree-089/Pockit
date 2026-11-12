import { NavLink } from 'react-router'
import { CircleUserRound, LayoutGrid, PiggyBank, ReceiptText, Sparkles } from 'lucide-react'

/*
 * Fixed bottom tab bar with the five main sections.
 * The tabs are defined as data, so adding/reordering a tab is a one-line change.
 * `ai: true` gives a tab the lavender AI accent (Stitch shows Insights this way).
 */
const tabs = [
  { to: '/', label: 'Home', icon: LayoutGrid, end: true },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/transactions', label: 'Passbook', icon: ReceiptText },
  { to: '/insights', label: 'Insights', icon: Sparkles, ai: true },
  { to: '/profile', label: 'Profile', icon: CircleUserRound },
]

export default function BottomNavigation() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] border-t border-line bg-surface/95 shadow-nav backdrop-blur-md"
      // Keeps the bar above the iPhone home indicator when installed as a PWA.
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-5">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavItem {...tab} />
          </li>
        ))}
      </ul>
    </nav>
  )
}

function NavItem({ to, label, icon: Icon, end, ai }) {
  return (
    // NavLink knows whether its route is active and passes `isActive` to us.
    // `end` on Home stops "/" from matching every route (all paths start with "/").
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium transition-colors ${
          isActive ? 'text-indigo' : 'text-muted hover:text-ink'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`relative grid h-8 w-14 place-items-center rounded-full transition-colors ${
              isActive ? 'bg-violet-soft' : ''
            }`}
          >
            <Icon className={`size-[22px] ${ai && !isActive ? 'text-lavender' : ''}`} strokeWidth={isActive ? 2.25 : 1.75} />
            {ai && <span className="absolute top-1 right-3.5 size-1.5 rounded-full bg-lavender" />}
          </span>
          <span className={isActive ? 'font-semibold' : ''}>{label}</span>
        </>
      )}
    </NavLink>
  )
}