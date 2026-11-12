/*
 * MOCK SERVICE LAYER
 * Pretends to be the Phase 2 backend. Every function is async and returns plain data,
 * exactly like a fetch() to the REST API will. The "database" lives in localStorage
 * (demo data only, never secrets) so changes survive a page refresh.
 *
 * To switch to the real backend later, create services/apiServices.js exporting the
 * SAME function names, and change the single line in services/index.js.
 */

import {
  AI_CATEGORY_RULES,
  ASSISTANT_WELCOME,
  MOCK_DB_VERSION,
  PAYMENT_METHODS,
  SAVINGS_CATEGORY_TEMPLATE,
  VAULT_METHOD,
  createSeedDatabase,
} from '../data/mockData.js'
import {
  BUDGET_STATUS,
  GUARD_LEVEL,
  assessPurchaseImpact,
  buildBudgetSummary,
  formatDateLabel,
  validateCategory,
  validateExpense,
} from '../utils/calculations.js'
import { allocateByWeights, formatINR, parseRupeeInput } from '../utils/money.js'

const STORAGE_KEY = 'pockit.mockdb.v1'
const LATENCY_MS = { fast: 150, normal: 350, ai: 1100 }

/* ------------------------------------------------------------------ */
/* Internal helpers                                                    */
/* ------------------------------------------------------------------ */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clone = (value) => structuredClone(value)

/** Error type the UI can inspect: error.fieldErrors maps form fields to messages. */
export class ServiceError extends Error {
  constructor(message, { code = 'BAD_REQUEST', fieldErrors = null } = {}) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

function createId(prefix) {
  const random =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}${random}`
}

let memoryDb = null // fallback when localStorage is unavailable (private mode, etc.)

function readDb() {
  if (memoryDb) return memoryDb
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.version === MOCK_DB_VERSION) {
        memoryDb = parsed
        return memoryDb
      }
    }
  } catch {
    // Corrupt or inaccessible storage: fall through to a fresh seed.
  }
  memoryDb = createSeedDatabase()
  writeDb(memoryDb)
  return memoryDb
}

function writeDb(db) {
  memoryDb = db
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    // Storage full or blocked: keep working in memory for this session.
  }
}

/** Runs a mutation against the db, saves it, and returns a deep copy of the result. */
async function mutate(ms, fn) {
  await wait(ms)
  const db = readDb()
  const result = fn(db)
  writeDb(db)
  return clone(result)
}

function currentSummary(db) {
  return buildBudgetSummary({
    allowance: db.settings.monthlyAllowance,
    categories: db.categories,
    transactions: db.transactions,
    cycle: db.cycle,
  })
}

function requireCategory(db, id) {
  const category = db.categories.find((c) => c.id === id)
  if (!category) throw new ServiceError('Category not found', { code: 'NOT_FOUND' })
  return category
}

function requireAmount(amount) {
  const paise = typeof amount === 'number' && Number.isSafeInteger(amount) ? amount : parseRupeeInput(String(amount ?? ''))
  if (!paise || paise <= 0) throw new ServiceError('Enter a valid amount', { fieldErrors: { amount: 'Enter a valid amount' } })
  return paise
}

function slugify(text) {
  return text.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)
}

function uniqueCategoryId(db, name) {
  const base = slugify(name) || 'category'
  let id = base
  let n = 2
  while (db.categories.some((c) => c.id === id)) id = `${base}-${n++}`
  return id
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

/** GET /api/bootstrap: everything the app needs on launch. */
export async function getBootstrap() {
  await wait(LATENCY_MS.normal)
  const db = readDb()
  return clone({
    user: db.user,
    settings: db.settings,
    cycle: db.cycle,
    categories: db.categories,
    transactions: db.transactions,
    goals: db.goals,
    notifications: db.notifications,
    paymentMethods: PAYMENT_METHODS,
  })
}

/** Restores the original demo data (useful before a hackathon demo). */
export async function resetDemoData() {
  await wait(LATENCY_MS.fast)
  writeDb(createSeedDatabase())
  return getBootstrap()
}

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */

/** POST /api/transactions: records a manual expense. */
export async function createTransaction(input) {
  return mutate(LATENCY_MS.normal, (db) => {
    const { valid, errors, value } = validateExpense(input, {
      categories: db.categories,
      cycle: db.cycle,
      paymentMethods: PAYMENT_METHODS,
    })
    if (!valid) throw new ServiceError('Please fix the highlighted fields', { code: 'VALIDATION', fieldErrors: errors })

    const transaction = {
      id: createId('txn'),
      type: 'expense',
      ...value,
      status: 'success',
      source: 'manual',
      createdAt: new Date().toISOString(),
    }
    db.transactions.unshift(transaction)
    return transaction
  })
}

/* ------------------------------------------------------------------ */
/* Categories & budget plan                                            */
/* ------------------------------------------------------------------ */

/** POST /api/categories */
export async function createCategory(input) {
  return mutate(LATENCY_MS.fast, (db) => {
    const { valid, errors, value } = validateCategory(input, db.categories)
    if (!valid) throw new ServiceError('Please fix the highlighted fields', { code: 'VALIDATION', fieldErrors: errors })
    const category = {
      id: uniqueCategoryId(db, value.name),
      name: value.name,
      allocated: value.allocated,
      icon: input.icon ?? 'wallet',
      color: input.color ?? '#4169E1',
      kind: 'spending',
    }
    db.categories.push(category)
    return category
  })
}

/** PATCH /api/categories/:id  (patch: { name?, allocated?, icon?, color? }) */
export async function updateCategory(id, patch) {
  return mutate(LATENCY_MS.fast, (db) => {
    const category = requireCategory(db, id)
    const { valid, errors, value } = validateCategory(
      { name: patch.name ?? category.name, allocated: patch.allocated ?? category.allocated },
      db.categories,
      { excludeId: id },
    )
    if (!valid) throw new ServiceError('Please fix the highlighted fields', { code: 'VALIDATION', fieldErrors: errors })
    Object.assign(category, value, patch.icon ? { icon: patch.icon } : {}, patch.color ? { color: patch.color } : {})
    return category
  })
}

/**
 * DELETE /api/categories/:id
 * A category that has transactions needs options.reassignTo (another category id),
 * so no spending ever disappears from the totals.
 * Returns { categories, transactions } because both lists can change.
 */
export async function deleteCategory(id, { reassignTo } = {}) {
  return mutate(LATENCY_MS.fast, (db) => {
    const category = requireCategory(db, id)
    if (category.kind === 'savings') {
      throw new ServiceError('The Savings category cannot be deleted. Set its amount to ₹0 instead.', { code: 'FORBIDDEN' })
    }

    const affected = db.transactions.filter((t) => t.categoryId === id)
    if (affected.length > 0) {
      if (!reassignTo) {
        throw new ServiceError(`${category.name} has ${affected.length} transactions. Choose a category to move them to.`, {
          code: 'NEEDS_REASSIGNMENT',
        })
      }
      const target = requireCategory(db, reassignTo)
      if (target.id === id || target.kind === 'savings') {
        throw new ServiceError('Choose a different spending category to move transactions to.')
      }
      for (const t of affected) t.categoryId = target.id
    }

    db.categories = db.categories.filter((c) => c.id !== id)
    return { categories: db.categories, transactions: db.transactions }
  })
}

/**
 * PUT /api/budget-plan: saves the confirmed onboarding plan.
 * plan: { allowance (paise), categories: [{ id?, name, allocated, icon?, color?, kind? }] }
 * Existing categories keep their id (matched by id, then by name) so history stays linked.
 * Transactions in categories that were removed move to an "Other" category.
 * Returns { settings, categories, transactions }.
 */
export async function saveBudgetPlan(plan) {
  return mutate(LATENCY_MS.normal, (db) => {
    const allowance = requireAmount(plan.allowance)
    if (!Array.isArray(plan.categories) || plan.categories.length === 0) {
      throw new ServiceError('Add at least one category')
    }

    const seenNames = new Set()
    const next = plan.categories.map((item) => {
      const { valid, errors, value } = validateCategory(item, [])
      if (!valid) throw new ServiceError(errors.name ?? errors.allocated, { code: 'VALIDATION' })
      const lower = value.name.toLowerCase()
      if (seenNames.has(lower)) throw new ServiceError(`"${value.name}" appears twice`, { code: 'VALIDATION' })
      seenNames.add(lower)

      const existing =
        db.categories.find((c) => c.id === item.id) ??
        db.categories.find((c) => c.name.toLowerCase() === lower)
      const isSavings = item.kind === 'savings' || existing?.kind === 'savings'
      return {
        id: existing?.id ?? null,
        name: value.name,
        allocated: value.allocated,
        icon: item.icon ?? existing?.icon ?? 'wallet',
        color: item.color ?? existing?.color ?? '#4169E1',
        kind: isSavings ? 'savings' : 'spending',
      }
    })

    const total = next.reduce((sum, c) => sum + c.allocated, 0)
    if (total > allowance) {
      throw new ServiceError(`Allocations (${formatINR(total)}) exceed your monthly funds (${formatINR(allowance)})`, {
        code: 'VALIDATION',
      })
    }

    // Assign ids to new categories without colliding with existing ones.
    const tempDb = { categories: [...db.categories] }
    for (const c of next) {
      if (!c.id) {
        c.id = uniqueCategoryId(tempDb, c.name)
        tempDb.categories.push(c)
      }
    }

    // Keep history: re-home transactions whose category no longer exists.
    const keptIds = new Set(next.map((c) => c.id))
    const orphans = db.transactions.filter((t) => !keptIds.has(t.categoryId))
    if (orphans.length > 0) {
      let other = next.find((c) => c.name.toLowerCase() === 'other')
      if (!other) {
        other = { id: uniqueCategoryId(tempDb, 'Other'), name: 'Other', allocated: 0, icon: 'wallet', color: '#73788C', kind: 'spending' }
        next.push(other)
      }
      for (const t of orphans) t.categoryId = other.id
    }

    db.settings.monthlyAllowance = allowance
    db.categories = next
    return { settings: db.settings, categories: db.categories, transactions: db.transactions }
  })
}

/* ------------------------------------------------------------------ */
/* AI: budget allocation (simulated)                                   */
/* ------------------------------------------------------------------ */

function seededJitter(text, variant) {
  let hash = 2166136261
  for (const ch of `${text}:${variant}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619)
  return 1 + ((Math.abs(hash) % 21) - 10) / 100 // 0.90 – 1.10
}

/**
 * POST /api/ai/budget-allocation
 * input: { monthlyAmount, savingsAmount, description, variant }
 *   amounts may be paise numbers or rupee strings; `variant` changes on "Regenerate".
 * Returns { categories: [{ tempId, name, icon, color, kind, allocated, reason }], summary, model }
 */
export async function generateBudgetAllocation({ monthlyAmount, savingsAmount = 0, description = '', variant = 0 }) {
  await wait(LATENCY_MS.ai)

  const total = requireAmount(monthlyAmount)
  const savings = typeof savingsAmount === 'number' ? savingsAmount : parseRupeeInput(String(savingsAmount || '0'))
  if (savings === null || savings < 0) throw new ServiceError('Enter a valid savings amount', { fieldErrors: { savingsAmount: 'Enter a valid savings amount' } })
  if (savings >= total) throw new ServiceError('Savings must be less than your monthly funds', { fieldErrors: { savingsAmount: 'Savings must be less than your monthly funds' } })

  const text = description.toLowerCase()
  const chosen = AI_CATEGORY_RULES.map((rule) => {
    const matches = rule.keywords.filter((k) => text.includes(k))
    return { rule, matches }
  }).filter(({ rule, matches }) => rule.core || matches.length > 0)

  const weights = chosen.map(({ rule, matches }) => rule.weight * (matches.length > 0 ? 1.4 : 1) * seededJitter(rule.key, variant))
  const amounts = allocateByWeights(total - savings, weights, 5000)

  const categories = chosen.map(({ rule, matches }, i) => ({
    tempId: `${rule.key}-${variant}`,
    name: rule.name,
    icon: rule.icon,
    color: rule.color,
    kind: 'spending',
    allocated: amounts[i],
    reason: matches.length > 0 ? `${rule.reason} You mentioned: ${matches.slice(0, 3).join(', ')}.` : rule.reason,
  }))

  if (savings > 0) {
    categories.push({
      tempId: `savings-${variant}`,
      name: SAVINGS_CATEGORY_TEMPLATE.name,
      icon: SAVINGS_CATEGORY_TEMPLATE.icon,
      color: SAVINGS_CATEGORY_TEMPLATE.color,
      kind: 'savings',
      allocated: savings,
      reason: SAVINGS_CATEGORY_TEMPLATE.reason,
    })
  }

  const biggest = categories.filter((c) => c.kind === 'spending').sort((a, b) => b.allocated - a.allocated)[0]
  return {
    categories,
    summary: `I've split ${formatINR(total)} into ${categories.length} categories, setting aside ${formatINR(savings)} for savings first. ${biggest.name} gets the most (${formatINR(biggest.allocated)}) based on your description. Adjust anything you like.`,
    model: 'pockit-mock-allocator',
  }
}

/* ------------------------------------------------------------------ */
/* Pre-Payment Budget Guard                                            */
/* ------------------------------------------------------------------ */

function guardRecommendation(assessment, categoryKey) {
  const { level, remainingAfter, dailyLimitAfter, daysRemaining, shortfall } = assessment
  const isFood = categoryKey === 'food'
  if (level === GUARD_LEVEL.OVER) {
    return `This would put ${assessment.categoryName} ${formatINR(shortfall)} over budget. If you go ahead, consider moving money from a category with room to spare.`
  }
  if (level === GUARD_LEVEL.WARNING) {
    return isFood
      ? `You'd have ${formatINR(remainingAfter)} left for ${daysRemaining} days (about ${formatINR(dailyLimitAfter)}/day). A canteen meal or splitting this order with friends would keep more in reserve.`
      : `You'd have ${formatINR(remainingAfter)} left for ${daysRemaining} days. If this can wait until next month, your budget stays comfortable.`
  }
  if (level === GUARD_LEVEL.CAUTION) {
    return `This is affordable, but ${assessment.categoryName} is running ahead of the month. Try to keep it near ${formatINR(dailyLimitAfter)}/day afterwards.`
  }
  return `Looks fine. You'll still have ${formatINR(remainingAfter)} in ${assessment.categoryName}.`
}

/**
 * POST /api/purchases/assess: evaluates a purchase BEFORE payment.
 * input: { categoryId, amount, description }
 * Returns { assessment, recommendation, title }. Never blocks: assessment.canProceed is always true.
 */
export async function evaluatePurchase({ categoryId, amount, description = '' }) {
  await wait(LATENCY_MS.normal)
  const db = readDb()
  const paise = requireAmount(amount)
  const summary = currentSummary(db)
  const stats = summary.categories.find((c) => c.id === categoryId)
  if (!stats) throw new ServiceError('Choose a budget category', { fieldErrors: { categoryId: 'Choose a budget category' } })

  const assessment = assessPurchaseImpact({
    stats,
    amount: paise,
    progress: summary.progress,
    cycle: db.cycle,
    warnThreshold: db.settings.guardThreshold,
  })

  const title = assessment.shouldWarn
    ? 'Hold on a second!'
    : assessment.level === GUARD_LEVEL.CAUTION
      ? 'Quick check before you pay'
      : 'You’re good to go'

  return clone({
    description,
    assessment,
    title,
    message: assessment.shouldWarn
      ? `This purchase might affect your remaining ${stats.name.toLowerCase()} budget. You've already used ${assessment.consumedBefore}% of it.`
      : `This fits within your ${stats.name} budget.`,
    recommendation: guardRecommendation(assessment, categoryId),
    forecast: assessment.depletionDateAfter
      ? `At your current pace (${formatINR(assessment.dailyPace)}/day), ${stats.name} would run out around ${formatDateLabel(assessment.depletionDateAfter)}.`
      : `At your current pace, ${stats.name} should last the rest of the month.`,
  })
}

/* ------------------------------------------------------------------ */
/* Payments (simulated PayPal; no network requests)                    */
/* ------------------------------------------------------------------ */

const pendingOrders = new Map()

/**
 * POST /api/payments/orders: in Phase 4 the backend creates a PayPal order.
 * input: { description, merchant?, amount, categoryId }
 */
export async function createPaymentOrder({ description, merchant, amount, categoryId }) {
  await wait(LATENCY_MS.normal)
  const db = readDb()
  const paise = requireAmount(amount)
  requireCategory(db, categoryId)
  if (!description?.trim()) throw new ServiceError('Add a purchase description', { fieldErrors: { description: 'Add a purchase description' } })

  const order = {
    orderId: `MOCK-${createId('ord').slice(4).toUpperCase()}`,
    status: 'CREATED',
    amount: paise,
    currency: 'INR',
    description: description.trim(),
    merchant: merchant?.trim() || description.trim(),
    categoryId,
    createdAt: new Date().toISOString(),
  }
  pendingOrders.set(order.orderId, order)
  return clone(order)
}

/**
 * POST /api/payments/orders/:id/capture: in Phase 4 the backend verifies with PayPal.
 * options.simulateFailure records a failed payment (shown in Passbook, not counted).
 * Returns { status: 'COMPLETED' | 'FAILED', transaction }
 */
export async function capturePaymentOrder(orderId, { simulateFailure = false } = {}) {
  return mutate(LATENCY_MS.ai, (db) => {
    const order = pendingOrders.get(orderId)
    if (!order) throw new ServiceError('Payment session expired. Please start again.', { code: 'NOT_FOUND' })
    pendingOrders.delete(orderId)

    const transaction = {
      id: createId('txn'),
      type: 'expense',
      description: order.description,
      merchant: order.merchant,
      categoryId: order.categoryId,
      amount: order.amount,
      date: db.cycle.today,
      time: new Date().toTimeString().slice(0, 5),
      paymentMethod: 'paypal',
      status: simulateFailure ? 'failed' : 'success',
      source: 'paypal',
      paymentReference: order.orderId,
      note: simulateFailure ? 'Payment declined in PayPal sandbox (simulated)' : '',
      createdAt: new Date().toISOString(),
    }
    db.transactions.unshift(transaction)
    return { status: simulateFailure ? 'FAILED' : 'COMPLETED', transaction }
  })
}

/* ------------------------------------------------------------------ */
/* Savings goals                                                       */
/* ------------------------------------------------------------------ */

/** POST /api/goals  input: { name, target, targetDate, category?, icon? } */
export async function createGoal(input) {
  return mutate(LATENCY_MS.fast, (db) => {
    const name = (input.name ?? '').trim()
    const target = typeof input.target === 'number' ? input.target : parseRupeeInput(String(input.target ?? ''))
    const fieldErrors = {}
    if (name.length < 2) fieldErrors.name = 'Give your goal a name'
    if (!target || target <= 0) fieldErrors.target = 'Enter a target amount'
    if (!input.targetDate || input.targetDate <= db.cycle.today) fieldErrors.targetDate = 'Choose a future date'
    if (Object.keys(fieldErrors).length) throw new ServiceError('Please fix the highlighted fields', { code: 'VALIDATION', fieldErrors })

    const goal = {
      id: createId('goal'),
      name,
      category: input.category?.trim() || 'Personal',
      icon: input.icon ?? 'target',
      target,
      saved: 0,
      targetDate: input.targetDate,
      createdAt: db.cycle.today,
    }
    db.goals.push(goal)
    return goal
  })
}

/** DELETE /api/goals/:id */
export async function deleteGoal(goalId) {
  return mutate(LATENCY_MS.fast, (db) => {
    if (!db.goals.some((g) => g.id === goalId)) throw new ServiceError('Goal not found', { code: 'NOT_FOUND' })
    db.goals = db.goals.filter((g) => g.id !== goalId)
    return { goals: db.goals }
  })
}

/**
 * POST /api/goals/:id/contributions: moves money from this month's Savings bucket into a goal.
 * Recorded as a 'savings' transaction so the Savings bucket and the wallet stay reconciled.
 * Returns { goal, transaction }
 */
export async function contributeToGoal(goalId, amount) {
  return mutate(LATENCY_MS.normal, (db) => {
    const goal = db.goals.find((g) => g.id === goalId)
    if (!goal) throw new ServiceError('Goal not found', { code: 'NOT_FOUND' })
    const paise = requireAmount(amount)

    const savingsCategory = db.categories.find((c) => c.kind === 'savings')
    if (!savingsCategory) throw new ServiceError('Add a Savings category to your budget first')

    const summary = currentSummary(db)
    const available = summary.savingsRemaining
    if (paise > available) {
      throw new ServiceError(`Only ${formatINR(Math.max(0, available))} is left in this month's Savings bucket`, {
        code: 'VALIDATION',
        fieldErrors: { amount: `Maximum ${formatINR(Math.max(0, available))}` },
      })
    }

    const transaction = {
      id: createId('txn'),
      type: 'savings',
      description: `Saved towards ${goal.name}`,
      merchant: VAULT_METHOD.label,
      categoryId: savingsCategory.id,
      amount: paise,
      date: db.cycle.today,
      time: new Date().toTimeString().slice(0, 5),
      paymentMethod: VAULT_METHOD.id,
      status: 'success',
      source: 'manual',
      goalId,
      note: '',
      createdAt: new Date().toISOString(),
    }
    db.transactions.unshift(transaction)
    goal.saved += paise
    return { goal, transaction }
  })
}

/* ------------------------------------------------------------------ */
/* Profile, settings, notifications                                    */
/* ------------------------------------------------------------------ */

/** PATCH /api/settings */
export async function updateSettings(patch) {
  return mutate(LATENCY_MS.fast, (db) => {
    const next = { ...patch }
    if ('monthlyAllowance' in next) next.monthlyAllowance = requireAmount(next.monthlyAllowance)
    if ('guardThreshold' in next) {
      const t = Number(next.guardThreshold)
      if (!Number.isInteger(t) || t < 50 || t > 100) throw new ServiceError('Warning threshold must be between 50% and 100%')
      next.guardThreshold = t
    }
    delete next.currency // currency is locked to INR in Phase 1
    Object.assign(db.settings, next)
    return db.settings
  })
}

/** PATCH /api/profile */
export async function updateProfile(patch) {
  return mutate(LATENCY_MS.fast, (db) => {
    const allowed = ['name', 'firstName', 'college', 'program', 'residence', 'avatarUrl']
    for (const key of allowed) if (key in patch) db.user[key] = typeof patch[key] === 'string' ? patch[key].trim() : patch[key]
    if (!db.user.name) throw new ServiceError('Name cannot be empty')
    return db.user
  })
}

/** POST /api/notifications/read-all */
export async function markNotificationsRead() {
  return mutate(LATENCY_MS.fast, (db) => {
    for (const n of db.notifications) n.read = true
    return db.notifications
  })
}

/* ------------------------------------------------------------------ */
/* AI assistant (simulated)                                            */
/* ------------------------------------------------------------------ */

export function getAssistantWelcome() {
  return clone(ASSISTANT_WELCOME)
}

function detectCategory(text, categories) {
  const rule = AI_CATEGORY_RULES.find((r) => r.keywords.some((k) => text.includes(k)))
  if (rule) {
    const match = categories.find((c) => c.id === rule.key) ?? categories.find((c) => c.name === rule.name)
    if (match) return match
  }
  return categories.find((c) => text.includes(c.name.toLowerCase().split(' ')[0])) ?? null
}

/**
 * POST /api/ai/chat: answers using the student's REAL current numbers.
 * Returns { id, role: 'assistant', text, tip?, createdAt }
 */
export async function askAssistant(message) {
  await wait(LATENCY_MS.ai)
  const db = readDb()
  const summary = currentSummary(db)
  const text = (message ?? '').toLowerCase()
  const amountMatch = /(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)/i.exec(message ?? '')
  const amount = amountMatch ? parseRupeeInput(amountMatch[1]) : null
  const reply = (body, tip) => ({ id: createId('msg'), role: 'assistant', text: body, tip: tip ?? null, createdAt: new Date().toISOString() })

  // "Can I afford ₹X ...?"
  if (amount && amount > 0) {
    const category = detectCategory(text, summary.spendableCategories)
    if (category) {
      const a = assessPurchaseImpact({ stats: category, amount, progress: summary.progress, cycle: db.cycle, warnThreshold: db.settings.guardThreshold })
      if (a.level === GUARD_LEVEL.OVER) {
        return reply(
          `Not comfortably. ${formatINR(amount)} is more than the ${formatINR(Math.max(0, a.remainingBefore))} left in ${category.name}, so it would go ${formatINR(a.shortfall)} over budget.`,
          'Consider waiting until your next allowance, or moving money from a category with room to spare.',
        )
      }
      return reply(
        `You can, but it will use ${a.shareOfRemaining}% of what's left in ${category.name}. You'd have ${formatINR(a.remainingAfter)} for the remaining ${a.daysRemaining} days (about ${formatINR(a.dailyLimitAfter)}/day).`,
        a.shouldWarn ? 'Splitting the cost with friends or picking a cheaper option would keep more in reserve.' : null,
      )
    }
    const remaining = summary.spendableRemaining - amount
    const roomiest = [...summary.spendableCategories].sort((x, y) => y.remaining - x.remaining)[0]
    return reply(
      remaining >= 0
        ? `Overall, yes: you have ${formatINR(summary.spendableRemaining)} of spending money left, so you'd keep ${formatINR(remaining)} for the next ${summary.progress.daysRemaining} days (about ${formatINR(Math.floor(remaining / Math.max(1, summary.progress.daysRemaining)))}/day). Tell me which category it's for and I'll check that budget too.`
        : `That's more than the ${formatINR(summary.spendableRemaining)} of spending money you have left this month.`,
      roomiest && roomiest.remaining > 0
        ? `${roomiest.name} has the most room right now (${formatINR(roomiest.remaining)} left).`
        : null,
    )
  }

  // "Where is my money going?"
  if (/(where|most|biggest|spent|spending|going)/.test(text)) {
    const top = [...summary.spendableCategories].sort((a, b) => b.spent - a.spent).slice(0, 3)
    const lines = top.map((c) => `${c.name}: ${formatINR(c.spent)} (${c.consumedPct}% used)`).join('; ')
    return reply(
      `You've spent ${formatINR(summary.totalSpent)} so far this month. Top categories: ${lines}.`,
      top[0]?.status === BUDGET_STATUS.FAST ? `${top[0].name} is moving fastest, so that's the best place to cut back.` : null,
    )
  }

  // "How can I save more?"
  if (/(save|saving|goal)/.test(text)) {
    const nearest = [...db.goals].filter((g) => g.saved < g.target).sort((a, b) => a.targetDate.localeCompare(b.targetDate))[0]
    return reply(
      `You have ${formatINR(summary.savingsRemaining)} in this month's Savings bucket ready to move into a goal.${nearest ? ` ${nearest.name} needs ${formatINR(nearest.target - nearest.saved)} more by ${formatDateLabel(nearest.targetDate)}.` : ''}`,
      summary.projectedSurplus > 0 ? `At your current pace you'll finish the month with about ${formatINR(summary.projectedSurplus)} unspent, which you could add to savings.` : 'Trimming food delivery by a couple of orders a week is the quickest win this month.',
    )
  }

  return reply(
    `Here's your snapshot: ${formatINR(summary.walletBalance)} in your wallet, ${formatINR(summary.totalSpent)} spent, and ${summary.progress.daysRemaining} days left in the month. Your safe daily limit is ${formatINR(summary.safeDailyLimit)}.`,
    'Try asking "Can I afford ₹500 for dinner?" or "Where is my money going?"',
  )
}
