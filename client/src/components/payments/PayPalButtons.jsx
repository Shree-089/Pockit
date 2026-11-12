import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { loadPayPalSdk } from '../../utils/paypalSdk.js'
import { cx } from '../../utils/ui.js'

/**
 * Renders PayPal's official Smart Payment Buttons.
 * The callbacks are kept in a ref, so re-renders of the parent never re-create the buttons.
 *   createOrder(): Promise<paypalOrderId>   (the server creates the order)
 *   onApprove(data, actions)                (the server captures and verifies)
 *   onCancel(data), onError(error)
 * `busy` blocks clicks while a capture is being confirmed.
 */
export default function PayPalButtons({ clientId, currency, createOrder, onApprove, onCancel, onError, busy = false }) {
  const containerRef = useRef(null)
  const handlers = useRef({ createOrder, onApprove, onCancel, onError })
  const [state, setState] = useState({ key: null, status: 'loading', error: null })
  const key = `${clientId}|${currency}`

  useLayoutEffect(() => {
    handlers.current = { createOrder, onApprove, onCancel, onError }
  })

  useEffect(() => {
    let cancelled = false
    let buttons = null
    loadPayPalSdk({ clientId, currency })
      .then((paypal) => {
        if (cancelled || !containerRef.current) return
        buttons = paypal.Buttons({
          style: { layout: 'vertical', shape: 'pill', label: 'pay', height: 45 },
          createOrder: () => handlers.current.createOrder(),
          onApprove: (data, actions) => handlers.current.onApprove(data, actions),
          onCancel: (data) => handlers.current.onCancel(data),
          onError: (error) => handlers.current.onError(error),
        })
        if (buttons.isEligible && !buttons.isEligible()) {
          setState({ key, status: 'error', error: 'PayPal is not available for this browser or currency.' })
          return
        }
        return buttons.render(containerRef.current).then(() => {
          if (!cancelled) setState({ key, status: 'ready', error: null })
        })
      })
      .catch((error) => {
        if (!cancelled) setState({ key, status: 'error', error: error.message })
      })
    return () => {
      cancelled = true
      buttons?.close?.()?.catch?.(() => {})
    }
  }, [clientId, currency, key])

  const status = state.key === key ? state.status : 'loading'
  return (
    <div className="relative">
      {status === 'loading' && (
        <p className="flex items-center justify-center gap-2 py-3 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Loading PayPal…
        </p>
      )}
      {status === 'error' && (
        <p className="flex items-center gap-2 rounded-2xl bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          <AlertTriangle className="size-4 shrink-0" /> {state.error}
        </p>
      )}
      <div ref={containerRef} className={cx(busy && 'pointer-events-none opacity-50')} aria-busy={busy} />
    </div>
  )
}
