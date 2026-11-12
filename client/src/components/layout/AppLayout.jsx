import { Outlet } from 'react-router'
import TopBar from './TopBar.jsx'
import BottomNavigation from './BottomNavigation.jsx'
import DataSourceBanner from '../common/DataSourceBanner.jsx'

/*
 * Shell for the five main tabs (plus Savings Goals).
 * <Outlet /> is where React Router renders the matched child page.
 *
 * The column is capped at 430px and centred, so on a laptop it looks
 * like a phone screen instead of stretching across the whole window.
 */
export default function AppLayout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-bg">
      <TopBar />
      <DataSourceBanner />

      {/* pb-28 leaves room so the fixed bottom nav never covers content */}
      <main className="flex-1 px-4 pt-2 pb-28">
        <Outlet />
      </main>

      <BottomNavigation />
    </div>
  )
}
