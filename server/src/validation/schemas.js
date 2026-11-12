import { z } from 'zod'
import { MAX_AMOUNT_PAISE, parseAmountInput } from '../lib/money.js'

/*
 * Request schemas. Amounts accept integer paise (API contract) or a rupee string
 * typed by a person ("120.50"); both become integer paise after parsing.
 */

const amount = ({ min = 1, label = 'Amount' } = {}) =>
  z.union([z.number(), z.string()]).transform((value, ctx) => {
    const paise = parseAmountInput(value)
    if (paise === null) {
      ctx.addIssue({ code: 'custom', message: `${label}: enter a valid amount, e.g. 120 or 99.50` })
      return z.NEVER
    }
    if (paise < min) {
      ctx.addIssue({ code: 'custom', message: min > 0 ? `${label} must be more than ₹0` : `${label} cannot be negative` })
      return z.NEVER
    }
    if (paise > MAX_AMOUNT_PAISE * 10) {
      ctx.addIssue({ code: 'custom', message: `${label} is too large` })
      return z.NEVER
    }
    return paise
  })

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM format')
const uuid = z.uuid('Invalid id')
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a hex colour like #4169E1')
const icon = z.string().trim().min(1).max(30)

export const PAYMENT_METHODS = ['upi-gpay', 'upi-paytm', 'campus-card', 'debit-card', 'cash', 'paypal']

export const idParam = z.object({ id: uuid })

export const registerBody = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: z.email('Enter a valid email').trim().toLowerCase(),
  password: z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters'),
  monthlyAllowance: amount({ min: 0, label: 'Monthly allowance' }).optional(),
  college: z.string().trim().max(80).optional(),
})

export const loginBody = z.object({
  email: z.email('Enter a valid email').trim().toLowerCase(),
  password: z.string().min(1, 'Enter your password'),
})

export const walletBody = z
  .object({
    monthlyAllowance: amount({ min: 0, label: 'Monthly allowance' }).optional(),
    cycleResetDay: z.number().int().min(1).max(28).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')

export const settingsBody = z
  .object({
    monthlyAllowance: amount({ min: 0, label: 'Monthly allowance' }).optional(),
    cycleResetDay: z.number().int().min(1).max(28).optional(),
    guardEnabled: z.boolean().optional(),
    guardThreshold: z.number().int().min(50).max(100).optional(),
    smartRebalancing: z.boolean().optional(),
    dailyRecap: z.boolean().optional(),
    weekendNudge: z.boolean().optional(),
    paceAlerts: z.boolean().optional(),
    currency: z.literal('INR').optional(),
  })
  .strip()

export const profileBody = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    firstName: z.string().optional(), // derived on the server; accepted and ignored
    college: z.string().trim().max(80).optional(),
    program: z.string().trim().max(80).optional(),
    residence: z.string().trim().max(40).optional(),
  })
  .strip()

export const categoryBody = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(30, 'Keep the name under 30 characters'),
  allocated: amount({ min: 0, label: 'Allocation' }),
  icon: icon.optional(),
  color: color.optional(),
})

export const categoryPatch = categoryBody.partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update')

export const deleteCategoryQuery = z.object({ reassignTo: uuid.optional() })

export const budgetPlanBody = z.object({
  allowance: amount({ min: 1, label: 'Monthly funds' }),
  categories: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(2).max(30),
        allocated: amount({ min: 0, label: 'Allocation' }),
        icon: icon.optional(),
        color: color.optional(),
        kind: z.enum(['spending', 'savings']).optional(),
      }),
    )
    .min(1, 'Add at least one category')
    .max(20),
})

export const transactionBody = z.object({
  amount: amount({ label: 'Amount' }).refine((p) => p <= MAX_AMOUNT_PAISE, 'Amount cannot exceed ₹1,00,000'),
  description: z.string().trim().min(2, 'Add a short description').max(60, 'Keep it under 60 characters'),
  merchant: z.string().trim().max(60).optional(),
  categoryId: z.string({ error: 'Choose a budget category' }).min(1, 'Choose a budget category'),
  date: isoDate,
  time: hhmm.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: 'Choose a payment method' }),
  note: z.string().trim().max(120).optional(),
})

export const transactionQuery = z.object({
  categoryId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  status: z.enum(['success', 'failed', 'cancelled', 'pending']).optional(),
  type: z.enum(['expense', 'savings']).optional(),
  q: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
})

export const goalBody = z.object({
  name: z.string().trim().min(2, 'Give your goal a name').max(40),
  target: amount({ label: 'Target' }),
  targetDate: isoDate,
  category: z.string().trim().max(24).optional(),
  icon: icon.optional(),
})

export const goalPatch = goalBody.partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update')

export const contributionBody = z.object({ amount: amount({ label: 'Amount' }) })

export const purchaseBody = z.object({
  categoryId: uuid,
  amount: amount({ label: 'Amount' }),
  description: z.string().trim().max(60).optional(),
  explain: z.boolean().optional().default(false), // ask Nebius to phrase the explanation
})

export const paymentOrderBody = z.object({
  categoryId: uuid,
  amount: amount({ label: 'Amount' }).refine((p) => p <= MAX_AMOUNT_PAISE, 'Amount cannot exceed ₹1,00,000'),
  description: z.string().trim().min(2, 'Add a purchase description').max(60),
  merchant: z.string().trim().max(60).optional(),
})

// Strict: unknown keys (e.g. the old simulateFailure, or amounts/currency) are rejected, never trusted.
export const captureBody = z.strictObject({
  paypalOrderId: z.string({ error: 'Missing PayPal order id' }).regex(/^[A-Z0-9]{10,36}$/, 'Invalid PayPal order id'),
})

export const allocationBody = z.object({
  // Optional: if omitted, an amount stated in the description may be used (only if it literally appears there).
  monthlyAmount: amount({ label: 'Monthly funds' }).optional(),
  savingsAmount: amount({ min: 0, label: 'Savings' }).optional().default(0),
  description: z.string().max(1000).optional().default(''),
  variant: z.number().int().min(0).max(1000).optional().default(0),
})

export const chatBody = z.object({
  message: z.string().trim().min(1, 'Type a question').max(500, 'Keep it under 500 characters'),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(700) }))
    .max(10)
    .optional()
    .default([]),
})
