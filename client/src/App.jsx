import { createBrowserRouter, RouterProvider, Link } from 'react-router'
import { AlertTriangle, Loader2 } from 'lucide-react'
import AppLayout from './components/layout/AppLayout.jsx'
import FocusLayout from './components/layout/FocusLayout.jsx'
import EmptyState from './components/common/EmptyState.jsx'
import { AppProvider } from './context/AppContext.jsx'
import { useApp } from './hooks/useApp.js'
import Home from './pages/Home.jsx'
import Budgets from './pages/Budgets.jsx'
import Transactions from './pages/Transactions.jsx'
import AIInsights from './pages/AIInsights.jsx'
import Profile from './pages/Profile.jsx'
import SavingsGoals from './pages/SavingsGoals.jsx'
import AddExpense from './pages/AddExpense.jsx'
import Auth from './pages/Auth.jsx'
import BudgetAllocation from './pages/BudgetAllocation.jsx'
import PaymentCheckout from './pages/PaymentCheckout.jsx'

/*
 * ROUTE MAP
 * - Routes nested under AppLayout get the TopBar + BottomNavigation.
 * - Routes nested under FocusLayout get a back-arrow header and no nav.
 * - `handle.title` is read by the layouts to show the screen title.
 */

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Home />, handle: { title: 'Dashboard' } },
      { path: '/budgets', element: <Budgets />, handle: { title: 'Budgets' } },
      { path: '/transactions', element: <Transactions />, handle: { title: 'Passbook' } },
      { path: '/insights', element: <AIInsights />, handle: { title: 'AI Insights' } },
      { path: '/profile', element: <Profile />, handle: { title: 'Profile' } },
      { path: '/goals', element: <SavingsGoals />, handle: { title: 'Savings Goals' } },
    ],
  },
  {
    element: <FocusLayout />,
    children: [
      { path: '/onboarding', element: <BudgetAllocation />, handle: { title: 'AI Budget Allocation' } },
      { path: '/expenses/new', element: <AddExpense />, handle: { title: 'Add Expense' } },
      { path: '/checkout', element: <PaymentCheckout />, handle: { title: 'Checkout' } },
    ],
  },
  {
    path: '*',
    element: (
      <EmptyState
        title="Page not found"
        description="That page doesn't exist."
        action={<Link to="/" className="font-semibold text-royal">Go to Home</Link>}
      />
    ),
  },
])

/** Splash while loading, sign-in when the API needs it, an error screen if loading fails, otherwise the app. */
function AppRouter() {
  const { status, error, reload } = useApp()

  if (status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg">
        <div className="flex flex-col items-center gap-3 text-muted">
          <Loader2 className="size-8 animate-spin text-indigo" />
          <p className="text-sm">Loading your budget…</p>
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') return <Auth />

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-[430px] px-4">
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load Pockit"
          description={error}
          action={
            <button type="button" onClick={reload} className="rounded-full bg-indigo px-5 py-2.5 font-semibold text-white">
              Try again
            </button>
          }
        />
      </div>
    )
  }

  return <RouterProvider router={router} />
}

export default function App() {
  return (
    <AppProvider>
      <AppRouter />
    </AppProvider>
  )
}
