// Demand forecasting (UC-6) and forecast vs actual comparison (UC-15).
// The demo model is a weekday demand curve with run-to-run variation. A trained model replaces
// `predictSales`; everything else works on saved ForecastRun records.
import { HOURS, NOW_ISO, closedSlots, openShare } from './calendar'
import type { ForecastRun, Location, SalesInterval } from './types'

/** Share of a day's sales in each slot (sums to 1). */
/** Share of a full day's demand in each slot (9 AM–9 PM starts), before applying store hours. */
export const DEMAND_CURVE = [0.03, 0.05, 0.11, 0.145, 0.11, 0.055, 0.045, 0.06, 0.115, 0.135, 0.09, 0.035, 0.025]
const WEEKDAY_FACTOR = [1.0, 0.85, 0.85, 0.9, 0.95, 1.15, 1.25] // Sun..Sat
const CHAIN_DAILY_SALES = 6000

/** Mock "true" demand used to seed actual sales. */
export function baseDemand(location: Location, date: string) {
  const weekday = new Date(`${date}T12:00:00`).getDay()
  // Only the part of each hour the store is open to customers sells anything.
  return DEMAND_CURVE.map((share, slot) => share * openShare(date, slot) * CHAIN_DAILY_SALES * location.demandScale * WEEKDAY_FACTOR[weekday])
}

/** Deterministic pseudo-random in [-1, 1]. */
export const noise = (seed: number) => Math.sin(seed * 12.9898) * 0.5 + Math.sin(seed * 78.233) * 0.5

/** Typical average ticket by slot (mock), used to derive order counts. */
export const AVG_TICKET = [11.5, 12, 13.5, 13.5, 13.5, 12.5, 12, 13, 15, 15.5, 15, 14, 14]

/** Demo model: base demand with a run-specific error. */
export function predictSales(location: Location, date: string, runNumber: number) {
  const day = Number(date.slice(-2))
  return baseDemand(location, date).map((v, h) => Math.round(v * (1 + noise(location.storeNumber + day * 13 + h * 7 + runNumber * 31) * 0.1)))
}

const CONDITIONS = ['Sunny', 'Partly cloudy', 'Cloudy', 'Light rain', 'Clear', 'Breezy']

/** Demo weather for a store and date (deterministic). */
export function weatherFor(location: Location, date: string) {
  const day = Number(date.slice(-2))
  const n = noise(location.storeNumber * 0.37 + day * 1.7)
  return { tempF: Math.round(58 + n * 8 - (day < 15 ? 4 : 0)), condition: CONDITIONS[Math.abs(Math.round(n * 10 + day)) % CONDITIONS.length] }
}

export const weatherLabel = (location: Location, date: string) => {
  const w = weatherFor(location, date)
  return `${w.tempF}°F, ${w.condition.toLowerCase()}`
}

export const MODEL_VERSION = {
  id: 'mv-baseline-0.1',
  method: 'Weekday demand model (demo)',
  trainingCutoff: '2026-10-25',
  inputs: 'Historical sales, day of week, weather',
  validationSummary: 'Hourly WAPE tracked on the Compare tab.',
}

export function makeForecastRun(location: Location, date: string, opts: { runNumber: number; createdAt: string; dataCutoff: string }): ForecastRun {
  const predicted = predictSales(location, date, opts.runNumber)
  return {
    id: `fr-${location.id}-${date}-${opts.runNumber}`,
    locationId: location.id,
    date,
    createdAt: opts.createdAt,
    dataCutoff: opts.dataCutoff,
    horizon: '1 day, hourly',
    modelVersionId: MODEL_VERSION.id,
    status: 'completed',
    limitations: [],
    predicted,
    predictedOrders: predicted.map((v, h) => Math.round((v / AVG_TICKET[h]) * (1 + noise(opts.runNumber * 7 + h) * 0.04))),
  }
}

/** Latest completed run for a store and date, optionally only runs created before a time. */
export function latestRun(runs: ForecastRun[], locationId: string, date: string, createdBefore = NOW_ISO) {
  return runs
    .filter((r) => r.locationId === locationId && r.date === date && r.status === 'completed' && r.createdAt <= createdBefore)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

export type Measure = 'sales' | 'orders'

/** Actual sales (or orders) per slot for a store/date; null where no record exists. */
export function actualsFor(sales: SalesInterval[], locationId: string, date: string, measure: Measure = 'sales') {
  const out: (number | null)[] = HOURS.map(() => null)
  for (const s of sales) {
    if (s.locationId === locationId && s.date === date) out[s.slot] = (out[s.slot] ?? 0) + (measure === 'sales' ? s.amount : s.orders)
  }
  // Hours the store is closed have zero sales once they've passed.
  const closed = closedSlots(date)
  return out.map((v, i) => (v === null && i < closed && openShare(date, i) === 0 ? 0 : v))
}

export const predictedFor = (run: ForecastRun, measure: Measure) => (measure === 'sales' ? run.predicted : run.predictedOrders)

/** Chart rows for SalesChart. */
export const salesRows = (predicted: number[] | undefined, actual: (number | null)[]) =>
  HOURS.map((hour, i) => ({ hour, forecast: predicted?.[i] ?? 0, actual: actual[i] }))

/** UC-15: align a saved forecast with actuals and compute the provisional metric. */
export function compareForecast(predicted: number[], actual: (number | null)[], date: string) {
  const expected = closedSlots(date)
  const rows = HOURS.map((hour, i) => {
    const a = actual[i]
    return { hour, predicted: predicted[i], actual: a, diff: a === null ? null : a - predicted[i] }
  })
  const complete = rows.filter((r) => r.actual !== null)
  const actualTotal = complete.reduce((n, r) => n + (r.actual ?? 0), 0)
  const predictedTotal = complete.reduce((n, r) => n + r.predicted, 0)
  const absError = complete.reduce((n, r) => n + Math.abs(r.diff ?? 0), 0)
  const missing = HOURS.slice(0, expected).filter((_, i) => actual[i] === null)
  return {
    rows,
    status: complete.length === 0 ? ('no actuals' as const) : complete.length < HOURS.length ? ('incomplete' as const) : ('complete' as const),
    missing,
    hourlyWape: actualTotal ? absError / actualTotal : null,
    dailyError: actualTotal ? Math.abs(actualTotal - predictedTotal) / actualTotal : null,
    actualTotal,
    predictedTotal,
  }
}
