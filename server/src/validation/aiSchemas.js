import { z } from 'zod'

/*
 * Schemas for what we accept FROM THE MODEL. Anything that fails is discarded and
 * the endpoint falls back to deterministic output. Strings are length-capped so a
 * misbehaving model can't flood the UI.
 */

const text = (max) => z.string().trim().min(1).max(max)
const ICONS = ['utensils', 'laptop', 'bus', 'pencil', 'shopping-bag', 'heart-pulse', 'smartphone', 'wallet', 'piggy-bank']

export const allocationOutput = z.object({
  summary: text(400),
  categories: z
    .array(
      z.object({
        name: text(30).refine((n) => n.length >= 2, 'name too short'),
        amount_rupees: z.number().finite().nonnegative().max(10_000_000),
        icon: z.string().optional().transform((v) => (ICONS.includes(v) ? v : 'wallet')),
        reason: text(200),
      }),
    )
    .min(2)
    .max(10),
})

export const insightsOutput = z.object({
  headline: text(160),
  recommendations: z
    .array(
      z.object({
        title: text(80),
        body: text(320),
      }),
    )
    .min(1)
    .max(4),
})

// Lenient on length and tip shape (trimmed server-side) so a slightly long reply isn't lost;
// strict on what matters: there must be an answer string. Figures are checked separately.
export const chatOutput = z.object({
  answer: text(1500),
  tip: z
    .string()
    .trim()
    .max(240)
    .nullish()
    .catch(null)
    .transform((v) => v || null),
})

export const explanationOutput = z.object({
  explanation: text(400),
})
