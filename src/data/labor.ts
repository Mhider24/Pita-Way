// UC-12 Calculate labor hours and UC-8 View SPLH.
import { HOURS, NOW_SLOT, OPEN_HOUR, TODAY, closedSlots, isFuture } from './calendar'
import { RULES } from './policies'
import { headcountOf, STATIONS } from './staffing'
import type { LaborRecord, RecShift } from './types'

export interface LaborIssue {
  record: LaborRecord
  issue: string
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

/**
 * Hours per hourly slot for the given records, net of unpaid breaks (RULES.breaks).
 * Records without a clock-out are excluded and reported, except open shifts today, which
 * count up to now.
 */
export function laborHours(records: LaborRecord[]) {
  const bySlot = HOURS.map(() => 0)
  const issues: LaborIssue[] = []
  const nowHour = OPEN_HOUR + NOW_SLOT
  const { unpaid, requiredFromHours } = RULES.breaks

  for (const r of records) {
    let end = r.end
    if (end === null) {
      if (r.basis === 'actual' && r.date === TODAY) end = nowHour
      else {
        issues.push({ record: r, issue: 'No clock-out recorded; excluded until reviewed' })
        continue
      }
    }
    if (end <= r.start) {
      issues.push({ record: r, issue: 'End is before start; excluded' })
      continue
    }
    if (r.basis === 'actual' && r.end !== null && end - r.start >= requiredFromHours && r.breaks.length === 0) {
      issues.push({ record: r, issue: `No break recorded for a ${requiredFromHours}h+ shift; counted without a break` })
    }
    const sameEmployee = records.find((o) => o !== r && o.employeeId === r.employeeId && o.basis === r.basis && o.start < end! && (o.end ?? nowHour) > r.start)
    if (sameEmployee && r.id < sameEmployee.id) issues.push({ record: r, issue: 'Overlaps another record for the same employee' })

    HOURS.forEach((_, i) => {
      const s0 = OPEN_HOUR + i
      let h = overlap(r.start, end!, s0, s0 + 1)
      if (unpaid) for (const b of r.breaks) if (!b.paid) h -= overlap(b.start, b.end, s0, s0 + 1)
      bySlot[i] += Math.max(0, h)
    })
  }
  return { bySlot, total: bySlot.reduce((a, b) => a + b, 0), issues }
}

export type SplhBasis = 'actual' | 'scheduled' | 'projected'

export const BASIS_LABEL: Record<SplhBasis, { sales: string; hours: string }> = {
  actual: { sales: 'Actual sales (Toast)', hours: 'Actual hours (Toast time clock)' },
  scheduled: { sales: 'Actual sales (Toast)', hours: 'Scheduled hours (7shifts)' },
  projected: { sales: 'Forecast sales', hours: 'Recommended hours' },
}

export const ratio = (sales: number, hours: number) => (hours > 0 ? sales / hours : null)

/**
 * Scheduled (7shifts) vs actual (Toast time clock) hours per slot for the first `slots` hours.
 * Pass the number of closed hours so both cover the same period.
 */
export function scheduledVsActual(records: LaborRecord[], slots: number) {
  const scheduled = laborHours(records.filter((r) => r.basis === 'scheduled')).bySlot.slice(0, slots)
  const actual = laborHours(records.filter((r) => r.basis === 'actual')).bySlot.slice(0, slots)
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
  return { scheduled, actual, scheduledTotal: sum(scheduled), actualTotal: sum(actual) }
}

/** Hours per slot of a recommendation's role slots. */
export function recommendationHours(shifts: RecShift[]) {
  const h = headcountOf(shifts)
  return HOURS.map((_, i) => STATIONS.reduce((n, s) => n + h[s][i], 0))
}

/**
 * SPLH for one store and date on an explicit basis. Sales and hours always cover the same
 * slots: actual/scheduled use only slots with actual sales, projected uses the whole day.
 */
export function splhReport(opts: {
  basis: SplhBasis
  date: string
  actual: (number | null)[]
  predicted?: number[]
  labor: LaborRecord[]
  shifts?: RecShift[]
}) {
  const { basis, date } = opts
  const fail = (reason: string) => ({ basis, available: false as const, reason, rows: [], sales: 0, hours: 0, value: null, issues: [] as LaborIssue[], period: '' })

  let salesBySlot: (number | null)[]
  let hoursBySlot: number[]
  let issues: LaborIssue[] = []
  let slots: number

  if (basis === 'projected') {
    if (!opts.predicted || !opts.shifts) return fail('No forecast or recommendation for this date.')
    salesBySlot = opts.predicted
    hoursBySlot = recommendationHours(opts.shifts)
    slots = HOURS.length
  } else {
    if (isFuture(date)) return fail('No actual sales yet for a future date.')
    // Only slots that have actual sales; a stale data source shortens the period.
    slots = opts.actual.findIndex((v) => v === null)
    if (slots === -1) slots = HOURS.length
    slots = Math.min(slots, closedSlots(date))
    if (slots === 0) return fail('No actual sales recorded for this date yet.')
    const result = laborHours(opts.labor.filter((r) => r.basis === basis))
    salesBySlot = opts.actual
    hoursBySlot = result.bySlot
    issues = result.issues
  }

  const rows = HOURS.slice(0, slots).map((hour, i) => {
    const sales = salesBySlot[i] ?? 0
    const hours = hoursBySlot[i]
    return { hour, sales, hours, value: ratio(sales, hours) }
  })
  const sales = rows.reduce((n, r) => n + r.sales, 0)
  const hours = rows.reduce((n, r) => n + r.hours, 0)
  const value = ratio(sales, hours)
  return {
    basis,
    available: value !== null,
    reason: value === null ? 'Labor-hour total is zero for this period.' : '',
    rows,
    sales,
    hours,
    value,
    issues,
    period: slots === HOURS.length ? 'Full day (8 AM–9 PM)' : `8 AM–${HOURS[slots] ?? '9 PM'} (hours with actual sales)`,
  }
}
