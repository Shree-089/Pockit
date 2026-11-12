/*
 * CENTRALISED API CLIENT
 * Every request to the Pockit backend goes through apiRequest():
 *  - adds the JSON headers and the bearer token
 *  - applies a timeout
 *  - turns server errors into ApiError { message, code, status, fieldErrors },
 *    the same shape the mock services throw, so forms show field errors unchanged
 *  - on 401 clears the token and tells the app to show the sign-in screen
 */

const BASE_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')
const TOKEN_KEY = 'pockit.token'

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN', fieldErrors = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

// The token is the only thing stored; it is not a password or a payment secret.
export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      // storage unavailable: the session lasts until the tab closes
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      // ignore
    }
  },
}

export const UNAUTHORIZED_EVENT = 'pockit:unauthorized'

export async function apiRequest(path, { method = 'GET', body, query, auth = true, timeoutMs = 15_000 } = {}) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
    }
  }

  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = tokenStore.get()
  if (auth && token) headers.Authorization = `Bearer ${token}`
  if (auth && !token) throw new ApiError('Please sign in', { status: 401, code: 'UNAUTHENTICATED' })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal })
  } catch (error) {
    throw new ApiError(
      error.name === 'AbortError' ? 'The server took too long to respond. Please try again.' : "Can't reach the Pockit server. Check your connection.",
      { code: 'NETWORK' },
    )
  } finally {
    clearTimeout(timer)
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const err = data?.error ?? {}
    if (response.status === 401 && auth) {
      tokenStore.clear()
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }
    throw new ApiError(err.message ?? `Request failed (${response.status})`, {
      status: response.status,
      code: err.code ?? 'HTTP_ERROR',
      fieldErrors: err.fieldErrors ?? null,
    })
  }
  return data
}

/** Quick reachability check used to decide between the API and the mock fallback. */
export async function checkHealth(timeoutMs = 2500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: controller.signal })
    if (!res.ok) return false
    const data = await res.json().catch(() => null)
    return data?.status === 'ok'
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
