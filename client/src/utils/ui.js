/*
 * UI HELPERS (no React components here)
 * Tailwind only generates classes it can see written out in full,
 * so tone -> class mappings are spelled out literally below.
 */
import { createElement } from 'react'
import {
  Bot, Bus, HeartPulse, Laptop, PencilLine, PiggyBank, Plane,
  ShieldCheck, ShoppingBag, Smartphone, Target, Utensils, Wallet,
} from 'lucide-react'
import { daysBetween, formatDateLabel } from './calculations.js'

/** Maps the string icon keys stored in data to Lucide components. */
export const ICONS = {
  utensils: Utensils,
  laptop: Laptop,
  bus: Bus,
  pencil: PencilLine,
  'shopping-bag': ShoppingBag,
  'piggy-bank': PiggyBank,
  'heart-pulse': HeartPulse,
  smartphone: Smartphone,
  wallet: Wallet,
  plane: Plane,
  shield: ShieldCheck,
  bot: Bot,
  target: Target,
}

export const getIcon = (key) => ICONS[key] ?? Wallet

/** Renders the icon for a data key, e.g. renderIcon('laptop', { className: 'size-5' }). */
export const renderIcon = (key, props) => createElement(getIcon(key), props)

/** Icon choices offered when creating a category or goal. */
export const CATEGORY_ICON_CHOICES = ['utensils', 'laptop', 'bus', 'pencil', 'shopping-bag', 'heart-pulse', 'smartphone', 'wallet']
export const GOAL_ICON_CHOICES = ['target', 'laptop', 'plane', 'shield', 'bot', 'smartphone']

/** Colours for new categories (validated categorical palette, in fixed order). */
export const CATEGORY_COLOR_CHOICES = ['#4169E1', '#B8941F', '#16A085', '#A78BFA', '#E57EA6']

export const TONE = {
  success: { text: 'text-success', bar: 'bg-success', soft: 'bg-success/10', ring: 'ring-success/20' },
  royal: { text: 'text-royal', bar: 'bg-royal', soft: 'bg-royal/10', ring: 'ring-royal/20' },
  warning: { text: 'text-warning', bar: 'bg-warning', soft: 'bg-warning/12', ring: 'ring-warning/25' },
  error: { text: 'text-error', bar: 'bg-error', soft: 'bg-error/10', ring: 'ring-error/20' },
  lavender: { text: 'text-indigo', bar: 'bg-lavender', soft: 'bg-violet-soft', ring: 'ring-lavender/30' },
  muted: { text: 'text-muted', bar: 'bg-muted', soft: 'bg-line/60', ring: 'ring-line' },
}

export const toneFor = (tone) => TONE[tone] ?? TONE.muted

/** "13:40" -> "1:40 PM" */
export function formatTime(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`
}

/** Passbook group header: "TODAY — 16 NOV", "YESTERDAY — 15 NOV", "12 NOV" */
export function formatGroupDate(iso, todayIso) {
  const diff = daysBetween(iso, todayIso)
  const label = formatDateLabel(iso).toUpperCase()
  if (diff === 0) return `TODAY — ${label}`
  if (diff === 1) return `YESTERDAY — ${label}`
  return label
}

/** Whole months between two ISO dates (at least 0). */
export function monthsBetween(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  const [ty, tm, td] = toIso.split('-').map(Number)
  return Math.max(0, (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0))
}

/**
 * Budget Guard risk level. The server sends `riskLevel`; offline demo results carry only
 * `assessment.level`, so map it with the same fixed rules the server uses.
 */
export function riskLevelOf(result) {
  if (result.riskLevel) return result.riskLevel
  const a = result.assessment
  if (a.remainingAfter <= 0) return 'high_risk'
  return a.level === 'warning' || a.level === 'caution' ? 'warning' : 'safe'
}

/** Joins class names, skipping falsy values. */
export const cx = (...classes) => classes.filter(Boolean).join(' ')
