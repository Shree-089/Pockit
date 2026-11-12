import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { AppContext } from './appContext.js'
import * as api from '../services/index.js'
import { UNAUTHORIZED_EVENT } from '../services/apiClient.js'
import { buildBudgetSummary, buildInsights } from '../utils/calculations.js'

/*
 * GLOBAL APP STATE
 * - Raw data (user, categories, transactions, goals...) lives in a reducer.
 * - Derived numbers (summary, insights) are recomputed with useMemo whenever raw data changes,
 *   so no component ever stores a total that can go stale.
 * - Every change goes through the service layer first (the real API or the mock),
 *   then the reducer applies the saved result.
 * - status 'unauthenticated' means the API needs a sign-in (App shows the Auth screen).
 */

const initialState = {
  status: 'loading', // 'loading' | 'ready' | 'error' | 'unauthenticated'
  error: null,
  dataSource: null, // 'api' | 'mock'
  isFallback: false, // true when the API was unreachable and mock data is shown
  user: null,
  settings: null,
  cycle: null,
  categories: [],
  transactions: [],
  goals: [],
  notifications: [],
  paymentMethods: [],
}

function upsertById(list, item) {
  const index = list.findIndex((x) => x.id === item.id)
  if (index === -1) return [...list, item]
  const next = [...list]
  next[index] = item
  return next
}

function reducer(state, action) {
  switch (action.type) {
    case 'boot/start':
      return { ...state, status: 'loading', error: null }
    case 'boot/success':
      return { ...state, ...action.data, status: 'ready', error: null, dataSource: api.getDataSource(), isFallback: api.isFallback() }
    case 'auth/required':
      return { ...initialState, status: 'unauthenticated', dataSource: api.getDataSource() }
    case 'boot/error':
      return { ...state, status: 'error', error: action.error }
    case 'transaction/added':
      return { ...state, transactions: [action.transaction, ...state.transactions] }
    case 'category/upserted':
      return { ...state, categories: upsertById(state.categories, action.category) }
    case 'goal/upserted':
      return { ...state, goals: upsertById(state.goals, action.goal) }
    case 'patch':
      // Used when a service returns several updated lists at once.
      return { ...state, ...action.data }
    default:
      throw new Error(`Unknown action: ${action.type}`)
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const load = useCallback(async () => {
    dispatch({ type: 'boot/start' })
    try {
      const data = await api.getBootstrap()
      dispatch({ type: 'boot/success', data })
    } catch (error) {
      if (error.code === 'UNAUTHENTICATED') dispatch({ type: 'auth/required' })
      else dispatch({ type: 'boot/error', error: error.message ?? 'Could not load your data' })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // The API client fires this when the server rejects the token (expired or revoked).
  useEffect(() => {
    const onUnauthorized = () => dispatch({ type: 'auth/required' })
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  /*
   * Actions: each one calls the service, updates state with the saved result,
   * and returns it. Errors (e.g. validation) are re-thrown so forms can show them.
   * `dispatch` never changes, so this object is created only once.
   */
  const actions = useMemo(
    () => ({
      reload: load,

      async login(credentials) {
        await api.login(credentials)
        await load()
      },

      async register(details) {
        await api.register(details)
        await load()
      },

      logout() {
        api.logout()
        dispatch({ type: 'auth/required' })
      },

      async addExpense(input) {
        const transaction = await api.createTransaction(input)
        dispatch({ type: 'transaction/added', transaction })
        return transaction
      },

      async addCategory(input) {
        const category = await api.createCategory(input)
        dispatch({ type: 'category/upserted', category })
        return category
      },

      async updateCategory(id, patch) {
        const category = await api.updateCategory(id, patch)
        dispatch({ type: 'category/upserted', category })
        return category
      },

      async deleteCategory(id, options) {
        const data = await api.deleteCategory(id, options)
        dispatch({ type: 'patch', data })
        return data
      },

      async saveBudgetPlan(plan) {
        const data = await api.saveBudgetPlan(plan)
        dispatch({ type: 'patch', data })
        return data
      },

      // Read-only AI/guard calls: no state change, just pass the result through.
      generateBudgetAllocation: (input) => api.generateBudgetAllocation(input),
      evaluatePurchase: (input) => api.evaluatePurchase(input),
      askAssistant: (message, history) => api.askAssistant(message, history),
      getAiInsights: () => api.getAiInsights(),
      getAiStatus: () => api.getAiStatus(),
      getAssistantWelcome: () => api.getAssistantWelcome(),

      getPaymentConfig: () => api.getPaymentConfig(),
      createPaymentOrder: (input) => api.createPaymentOrder(input),
      cancelPaymentOrder: (orderId) => api.cancelPaymentOrder(orderId),

      // Server-side capture. Only a transaction the server recorded is added (successful or failed);
      // a repeated capture returns the existing transaction, which is already in state.
      async capturePaymentOrder(orderId, options) {
        const result = await api.capturePaymentOrder(orderId, options)
        if (result.transaction && !result.alreadyCaptured) dispatch({ type: 'transaction/added', transaction: result.transaction })
        return result
      },

      async createGoal(input) {
        const goal = await api.createGoal(input)
        dispatch({ type: 'goal/upserted', goal })
        return goal
      },

      async deleteGoal(goalId) {
        const data = await api.deleteGoal(goalId)
        dispatch({ type: 'patch', data })
        return data
      },

      async contributeToGoal(goalId, amount) {
        const result = await api.contributeToGoal(goalId, amount)
        dispatch({ type: 'goal/upserted', goal: result.goal })
        dispatch({ type: 'transaction/added', transaction: result.transaction })
        return result
      },

      async updateSettings(patch) {
        const settings = await api.updateSettings(patch)
        dispatch({ type: 'patch', data: { settings } })
        return settings
      },

      async updateProfile(patch) {
        const user = await api.updateProfile(patch)
        dispatch({ type: 'patch', data: { user } })
        return user
      },

      async markNotificationsRead() {
        const notifications = await api.markNotificationsRead()
        dispatch({ type: 'patch', data: { notifications } })
        return notifications
      },

      async resetDemoData() {
        const data = await api.resetDemoData()
        dispatch({ type: 'boot/success', data })
        return data
      },
    }),
    [load],
  )

  const isReady = state.status === 'ready'

  const summary = useMemo(
    () =>
      isReady
        ? buildBudgetSummary({
            allowance: state.settings.monthlyAllowance,
            categories: state.categories,
            transactions: state.transactions,
            cycle: state.cycle,
          })
        : null,
    [isReady, state.settings, state.categories, state.transactions, state.cycle],
  )

  const insights = useMemo(() => (summary ? buildInsights(summary, state.cycle) : []), [summary, state.cycle])

  const categoriesById = useMemo(
    () => Object.fromEntries((summary?.categories ?? []).map((c) => [c.id, c])),
    [summary],
  )

  const unreadCount = useMemo(() => state.notifications.filter((n) => !n.read).length, [state.notifications])

  const value = useMemo(
    () => ({ ...state, ...actions, summary, insights, categoriesById, unreadCount }),
    [state, actions, summary, insights, categoriesById, unreadCount],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
