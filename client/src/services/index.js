/*
 * SERVICE ENTRY POINT
 * The app imports from here and never from a specific implementation.
 * VITE_DATA_SOURCE (client/.env):
 *   'api'  -> always the Express API
 *   'mock' -> always local mock data (no backend needed)
 *   'auto' -> the API if /api/health answers, otherwise the mock data (default)
 */

import * as api from './apiServices.js'
import * as mock from './mockServices.js'
import { ApiError } from './apiClient.js'

const MODE = String(import.meta.env.VITE_DATA_SOURCE ?? 'auto').toLowerCase()
let resolved = MODE === 'api' ? 'api' : MODE === 'mock' ? 'mock' : null
let pending = null

/** Decides once per page load which implementation to use. */
export async function resolveDataSource() {
  if (resolved) return resolved
  pending ??= api.checkHealth().then((ok) => {
    resolved = ok ? 'api' : 'mock'
    if (!ok) console.info('[pockit] API unreachable, using local mock data')
    return resolved
  })
  return pending
}

/** 'api' | 'mock' | null (not decided yet). */
export const getDataSource = () => resolved
/** True when we wanted the API but fell back to mock data. */
export const isFallback = () => MODE === 'auto' && resolved === 'mock'

const impl = () => (resolved === 'api' ? api : mock)
const delegate = (name) => async (...args) => {
  await resolveDataSource()
  const fn = impl()[name]
  if (!fn) throw new ApiError('This action is not available in offline demo mode', { code: 'UNSUPPORTED' })
  return fn(...args)
}

export const getBootstrap = delegate('getBootstrap')
export const resetDemoData = delegate('resetDemoData')
export const createTransaction = delegate('createTransaction')
export const createCategory = delegate('createCategory')
export const updateCategory = delegate('updateCategory')
export const deleteCategory = delegate('deleteCategory')
export const saveBudgetPlan = delegate('saveBudgetPlan')
export const generateBudgetAllocation = delegate('generateBudgetAllocation')
export const evaluatePurchase = delegate('evaluatePurchase')
export const createPaymentOrder = delegate('createPaymentOrder')
export const capturePaymentOrder = delegate('capturePaymentOrder')
export const cancelPaymentOrder = delegate('cancelPaymentOrder')
// PayPal checkout needs the server (offline demo mode throws UNSUPPORTED).
export const getPaymentConfig = delegate('getPaymentConfig')
export const createGoal = delegate('createGoal')
export const deleteGoal = delegate('deleteGoal')
export const contributeToGoal = delegate('contributeToGoal')
export const updateSettings = delegate('updateSettings')
export const updateProfile = delegate('updateProfile')
export const markNotificationsRead = delegate('markNotificationsRead')
export const askAssistant = delegate('askAssistant')
export const listTransactions = delegate('listTransactions')
// AI analysis exists only on the server (offline demo mode throws UNSUPPORTED).
export const getAiInsights = delegate('getAiInsights')
export const getAiStatus = delegate('getAiStatus')

/** Synchronous: used in a useState initializer. The source is resolved before the app renders. */
export const getAssistantWelcome = () => impl().getAssistantWelcome()

/* Session actions exist only for the API. */
export const login = async (credentials) => {
  await resolveDataSource()
  return api.login(credentials)
}
export const register = async (details) => {
  await resolveDataSource()
  return api.register(details)
}
export const logout = () => api.logout()
