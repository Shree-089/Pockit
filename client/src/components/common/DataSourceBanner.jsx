import { CloudOff, RotateCw } from 'lucide-react'
import { useApp } from '../../hooks/useApp.js'

/** Shown only when the API was unreachable and the app fell back to local mock data. */
export default function DataSourceBanner() {
  const { isFallback } = useApp()
  if (!isFallback) return null
  return (
    <div className="mx-4 mb-2 flex items-center gap-2 rounded-2xl bg-warning/12 px-3 py-2 text-xs text-ink" role="status">
      <CloudOff className="size-4 shrink-0 text-warning" />
      <span className="flex-1">Offline demo data: the Pockit server isn&apos;t reachable. Changes stay on this device.</span>
      <button type="button" onClick={() => window.location.reload()} className="flex items-center gap-1 font-semibold text-royal">
        <RotateCw className="size-3.5" /> Retry
      </button>
    </div>
  )
}
