/*
 * API SERVICE LAYER
 * Same function names, inputs and return shapes as mockServices.js, backed by the
 * Express API. Money crosses the wire as integer paise (or rupee strings typed by the user).
 */

import { ApiError, apiRequest, checkHealth, tokenStore } from './apiClient.js'
import { buildBudgetSummary } from '../utils/calculations.js'

export { checkHealth }

let cachedFirstName = ''

/* ---------------- Session ---------------- */

export const hasSession = () => Boolean(tokenStore.get())

export async function login(credentials) {
  const { token, user } = await apiRequest('/auth/login', { method: 'POST', body: credentials, auth: false })
  tokenStore.set(token)
  return user
}

export async function register(details) {
  const { token, user } = await apiRequest('/auth/register', { method: 'POST', body: details, auth: false })
  tokenStore.set(token)
  return user
}

export async function logout() {
  tokenStore.clear()
}

/* ---------------- Bootstrap ---------------- */

/** In development, warns if the client-side maths ever disagrees with the server's figures. */
function checkConsistency(data) {
  if (!import.meta.env.DEV || !data.summary) return
  const client = buildBudgetSummary({
    allowance: data.settings.monthlyAllowance,
    categories: data.categories,
    transactions: data.transactions,
    cycle: data.cycle,
  })
  for (const key of ['totalSpent', 'walletBalance', 'spendableRemaining', 'totalAllocated']) {
    if (client[key] !== data.summary[key]) {
      console.warn(`[pockit] ${key} mismatch: client ${client[key]} vs server ${data.summary[key]}`)
    }
  }
}

function normalizeBootstrap(data) {
  checkConsistency(data)
  cachedFirstName = data.user?.firstName ?? ''
  const { summary: _serverSummary, ...rest } = data // the app derives its summary from the same data
  return rest
}

export async function getBootstrap() {
  if (!hasSession()) throw new ApiError('Please sign in', { status: 401, code: 'UNAUTHENTICATED' })
  return normalizeBootstrap(await apiRequest('/bootstrap'))
}

export async function resetDemoData() {
  return normalizeBootstrap(await apiRequest('/demo/reset', { method: 'POST' }))
}

/* ---------------- Transactions ---------------- */

export const createTransaction = (input) => apiRequest('/transactions', { method: 'POST', body: input })

/** Server-side filtering (category, date range, status, search) for history beyond the current cycle. */
export const listTransactions = (filters = {}) => apiRequest('/transactions', { query: filters })

/* ---------------- Budgets ---------------- */

export const createCategory = (input) => apiRequest('/budgets', { method: 'POST', body: input })
export const updateCategory = (id, patch) => apiRequest(`/budgets/${id}`, { method: 'PUT', body: patch })

/** Both lists can change, so return fresh categories + transactions like the mock does. */
export async function deleteCategory(id, { reassignTo } = {}) {
  await apiRequest(`/budgets/${id}`, { method: 'DELETE', query: { reassignTo } })
  const data = await apiRequest('/bootstrap')
  return { categories: data.categories, transactions: data.transactions }
}

export async function saveBudgetPlan(plan) {
  await apiRequest('/budgets', { method: 'PUT', body: plan })
  const data = await apiRequest('/bootstrap')
  return { settings: data.settings, categories: data.categories, transactions: data.transactions }
}

/* ---------------- AI (Nebius on the server; key never reaches the browser) ---------------- */

const AI_TIMEOUT = 45_000 // the server's own Nebius timeout is shorter; this covers retries
export const getAiStatus = () => apiRequest('/ai/status')
export const generateBudgetAllocation = (input) => apiRequest('/ai/budget-allocation', { method: 'POST', body: input, timeoutMs: AI_TIMEOUT })
export const getAiInsights = () => apiRequest('/ai/insights', { timeoutMs: AI_TIMEOUT })
export const askAssistant = (message, history = []) =>
  apiRequest('/ai/chat', { method: 'POST', body: { message, history: history.slice(-6) }, timeoutMs: AI_TIMEOUT })

export function getAssistantWelcome() {
  return {
    id: 'msg_welcome',
    role: 'assistant',
    text: `Hi${cachedFirstName ? ` ${cachedFirstName}` : ''}! I'm Pockit AI. Ask me whether you can afford something, where your money is going, or how to save more.`,
    createdAt: new Date().toISOString(),
  }
}

/* ---------------- Budget Guard & payments ---------------- */

export const evaluatePurchase = (input) => apiRequest('/purchases/assess', { method: 'POST', body: input, timeoutMs: AI_TIMEOUT })
// PayPal checkout. The server creates and captures PayPal orders; the browser only renders
// PayPal's buttons and never sends amounts or currency at capture time.
const PAYPAL_TIMEOUT = 45_000 // the server talks to PayPal inside these requests
export const getPaymentConfig = () => apiRequest('/payments/config')
export const createPaymentOrder = (input) => apiRequest('/payments/orders', { method: 'POST', body: input, timeoutMs: PAYPAL_TIMEOUT })
export const capturePaymentOrder = (orderId, { paypalOrderId }) =>
  apiRequest(`/payments/orders/${orderId}/capture`, { method: 'POST', body: { paypalOrderId }, timeoutMs: PAYPAL_TIMEOUT })
export const cancelPaymentOrder = (orderId) => apiRequest(`/payments/orders/${orderId}/cancel`, { method: 'POST' })

/* ---------------- Goals ---------------- */

export const createGoal = (input) => apiRequest('/goals', { method: 'POST', body: input })
export const deleteGoal = (goalId) => apiRequest(`/goals/${goalId}`, { method: 'DELETE' })
export const contributeToGoal = (goalId, amount) => apiRequest(`/goals/${goalId}/contributions`, { method: 'POST', body: { amount } })

/* ---------------- Settings, profile, notifications ---------------- */

export const updateSettings = (patch) => apiRequest('/settings', { method: 'PATCH', body: patch })

export async function updateProfile(patch) {
  const user = await apiRequest('/profile', { method: 'PATCH', body: patch })
  cachedFirstName = user.firstName
  return user
}

export const markNotificationsRead = () => apiRequest('/notifications/read-all', { method: 'POST' })
