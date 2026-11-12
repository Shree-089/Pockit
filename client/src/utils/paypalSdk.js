/*
 * Loads the official PayPal JavaScript SDK (https://www.paypal.com/sdk/js) once per
 * client ID + currency. Only the PUBLIC client ID is used here; the secret stays on the server.
 * The currency must match the currency the server uses for PayPal orders.
 */

const SDK_URL = 'https://www.paypal.com/sdk/js'
let current = { key: null, promise: null }

export function loadPayPalSdk({ clientId, currency }) {
  const key = `${clientId}|${currency}`
  if (current.key === key && current.promise) return current.promise

  // A different client ID or currency needs a fresh SDK instance.
  document.querySelectorAll('script[data-pockit-paypal-sdk]').forEach((s) => s.remove())
  if (window.paypal) delete window.paypal

  const params = new URLSearchParams({ 'client-id': clientId, currency, intent: 'capture', components: 'buttons' })
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${SDK_URL}?${params}`
    script.async = true
    script.dataset.pockitPaypalSdk = 'true'
    script.onload = () => {
      // Safe diagnostics: currency and the last characters of the PUBLIC client id only.
      console.info(`[pockit:paypal] SDK loaded currency=${currency} client-id=…${clientId.slice(-6)}`)
      return window.paypal?.Buttons ? resolve(window.paypal) : reject(new Error('PayPal loaded without its buttons component'))
    }
    script.onerror = () => {
      current = { key: null, promise: null }
      reject(new Error('Could not load PayPal. Check your internet connection or ad blocker.'))
    }
    document.head.appendChild(script)
  })
  current = { key, promise }
  return promise
}
