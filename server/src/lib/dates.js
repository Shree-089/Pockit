import { env } from '../config/env.js'

/*
 * All budget dates are ISO 'YYYY-MM-DD' strings computed in UTC arithmetic,
 * with "today" taken in the configured timezone (or APP_TODAY for demos).
 */

const DAY_MS = 86_400_000

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export const toISO = (ms) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (iso, days) => toISO(parseISODate(iso) + days * DAY_MS)
export const daysBetween = (a, b) => Math.round((parseISODate(b) - parseISODate(a)) / DAY_MS)

/** Today's date in the app timezone, e.g. '2026-11-16'. */
export function today() {
  if (env.appToday) return env.appToday
  return new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** Current time in the app timezone, 'HH:MM'. */
export function nowTime() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: env.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
}

/**
 * The budget cycle containing `todayIso`, given the day of month the allowance resets.
 * e.g. resetDay 1, today 2026-11-16 -> { start: 2026-11-01, end: 2026-11-30 }
 */
export function getCycle(resetDay, todayIso = today()) {
  const [y, m, d] = todayIso.split('-').map(Number)
  let startY = y
  let startM = m
  if (d < resetDay) {
    startM -= 1
    if (startM === 0) {
      startM = 12
      startY -= 1
    }
  }
  const start = toISO(Date.UTC(startY, startM - 1, resetDay))
  const nextStart = toISO(Date.UTC(startY, startM, resetDay))
  return { start, end: addDays(nextStart, -1), today: todayIso }
}

export function formatDateLabel(iso) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(parseISODate(iso))
}
