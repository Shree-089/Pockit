import { useEffect, useState } from 'react'
import { useApp } from './useApp.js'

/*
 * Fetches GET /api/ai/insights and shares one in-flight request between screens
 * (Home + Insights). Refetches automatically when spending or allocations change;
 * reload() forces a fresh analysis.
 */
const cache = { key: null, promise: null }

function fetchShared(key, force, fetcher) {
  if (!force && cache.key === key && cache.promise) return cache.promise
  cache.key = key
  cache.promise = fetcher().catch((error) => {
    if (cache.key === key) {
      cache.key = null
      cache.promise = null
    }
    throw error
  })
  return cache.promise
}

export function useAiInsights() {
  const { getAiInsights, summary, transactions, dataSource } = useApp()
  const dataKey = `${transactions.length}|${summary?.totalSpent}|${summary?.totalAllocated}`
  const [nonce, setNonce] = useState(0)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (dataSource === 'mock') return undefined
    let cancelled = false
    fetchShared(dataKey, nonce > 0, getAiInsights)
      .then((data) => {
        if (!cancelled) setResult({ key: dataKey, nonce, status: 'ready', data, error: null })
      })
      .catch((error) => {
        if (!cancelled) setResult({ key: dataKey, nonce, status: error.code === 'UNSUPPORTED' ? 'unsupported' : 'error', data: null, error: error.message })
      })
    return () => {
      cancelled = true
    }
  }, [dataKey, nonce, dataSource, getAiInsights])

  const reload = () => setNonce((n) => n + 1)
  if (dataSource === 'mock') return { status: 'unsupported', data: null, error: null, reload }
  // Until the result for the current data arrives, report loading (derived, not stored).
  const current = result && result.key === dataKey && result.nonce === nonce ? result : { status: 'loading', data: null, error: null }
  return { ...current, reload }
}
