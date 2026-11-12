import { useState } from 'react'
import { Link, useMatches, useNavigate } from 'react-router'
import { AlertTriangle, Bell, CheckCircle2, Info, Search, User, Wallet } from 'lucide-react'
import { useApp } from '../../hooks/useApp.js'
import { formatDateLabel } from '../../utils/calculations.js'
import Modal from '../common/Modal.jsx'

const NOTIFICATION_ICON = { warning: AlertTriangle, success: CheckCircle2, info: Info }
const NOTIFICATION_TONE = { warning: 'bg-warning/12 text-warning', success: 'bg-success/10 text-success', info: 'bg-violet-soft text-indigo' }

/*
 * Compact top bar from the Stitch designs:
 * [logo] Pockit / <screen title>          [search] [bell] [avatar]
 *
 * It's `sticky`, so it stays visible while the page scrolls underneath.
 * The semi-transparent background + backdrop-blur gives the frosted look.
 */
export default function TopBar() {
  const matches = useMatches()
  const navigate = useNavigate()
  const title = matches.at(-1)?.handle?.title ?? ''
  const { notifications, unreadCount, markNotificationsRead } = useApp()
  const [showNotifications, setShowNotifications] = useState(false)

  function openNotifications() {
    setShowNotifications(true)
    if (unreadCount > 0) markNotificationsRead()
  }

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 bg-bg/85 px-4 py-3 backdrop-blur-md">
      <Link to="/" className="flex items-center gap-2.5" aria-label="Pockit home">
        <span className="grid size-11 place-items-center rounded-2xl bg-indigo text-white shadow-card">
          <Wallet className="size-5" />
        </span>
        <span className="leading-tight">
          <span className="block font-heading text-lg font-bold text-ink">Pockit</span>
          <span className="block text-xs text-muted">{title}</span>
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-1">
        <IconButton label="Open search" onClick={() => navigate('/transactions?search=1')}>
          <Search className="size-5" />
        </IconButton>

        <IconButton label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'} onClick={openNotifications}>
          <Bell className="size-5" />
          {unreadCount > 0 && <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-error ring-2 ring-bg" />}
        </IconButton>

        <Link
          to="/profile"
          aria-label="Your profile"
          className="ml-1 grid size-10 place-items-center rounded-full bg-indigo text-white active:scale-95"
        >
          <User className="size-5" />
        </Link>
      </div>

      <Modal open={showNotifications} onClose={() => setShowNotifications(false)} title="Notifications">
        <ul className="space-y-2 pb-2">
          {notifications.map((n) => {
            const Icon = NOTIFICATION_ICON[n.kind] ?? Info
            return (
              <li key={n.id} className="flex gap-3 rounded-2xl bg-bg p-3">
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${NOTIFICATION_TONE[n.kind] ?? NOTIFICATION_TONE.info}`}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{n.title}</p>
                  <p className="text-xs text-muted">{n.body}</p>
                </div>
                <span className="shrink-0 text-[11px] text-muted">{formatDateLabel(n.date)}</span>
              </li>
            )
          })}
        </ul>
      </Modal>
    </header>
  )
}

// Small local helper: a round, 44px touch target (Apple/Google minimum).
function IconButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="relative grid size-11 place-items-center rounded-full text-ink transition hover:bg-line/60 active:scale-95"
    >
      {children}
    </button>
  )
}
