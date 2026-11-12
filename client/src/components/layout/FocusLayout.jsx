import { Outlet, useLocation, useMatches, useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'

/*
 * Shell for focused, single-task flows (Add Expense, Onboarding, Checkout).
 * No bottom nav, so the user stays on one task, and a back arrow to leave it.
 */
export default function FocusLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const matches = useMatches()

  // The deepest matched route's handle.title, e.g. "Add Expense".
  const title = matches.at(-1)?.handle?.title ?? ''

  const goBack = () => {
    // location.key is 'default' when this is the first page the user opened
    // (e.g. they typed the URL directly). Then there's no history to go back
    // to, so we go Home instead of leaving the app.
    if (location.key === 'default') navigate('/')
    else navigate(-1)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-bg">
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-bg/85 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          className="-ml-2 grid size-11 place-items-center rounded-full text-ink transition hover:bg-line/60 active:scale-95"
        >
          <ArrowLeft className="size-6" />
        </button>
        <h1 className="text-xl font-bold text-indigo">{title}</h1>
      </header>

      <main className="flex-1 px-4 pt-2 pb-8">
        <Outlet />
      </main>
    </div>
  )
}