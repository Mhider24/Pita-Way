// UC-11 Employee hour alerts and minor break violations. Thresholds come from RULES
// (minorHours, minorBreaks).
import { NOW_SLOT, OPEN_HOUR, TODAY, clock } from './calendar'
import { laborHours } from './labor'
import { RULES } from './policies'
import type { BreakViolation, Employee, LaborRecord } from './types'

/**
 * Minors who worked longer than the continuous-work limit without the required break,
 * from Toast time-clock punches (actual basis only).
 */
export function detectBreakViolations(employees: Employee[], labor: LaborRecord[]): BreakViolation[] {
  const { ageUnder, maxContinuousHours, breakMinutes } = RULES.minorBreaks
  const minors = new Set(employees.filter((e) => e.age !== null && e.age < ageUnder).map((e) => e.id))
  const out: BreakViolation[] = []
  for (const r of labor) {
    if (r.basis !== 'actual' || !minors.has(r.employeeId)) continue
    const end = r.end ?? (r.date === TODAY ? OPEN_HOUR + NOW_SLOT : null)
    if (end === null) continue
    // Only breaks long enough to count reset the continuous-work clock.
    const qualifying = r.breaks.filter((b) => (b.end - b.start) * 60 >= breakMinutes).sort((a, b) => a.start - b.start)
    let segmentStart = r.start
    let longest = 0
    for (const b of qualifying) {
      longest = Math.max(longest, b.start - segmentStart)
      segmentStart = b.end
    }
    longest = Math.max(longest, end - segmentStart)
    if (longest > maxContinuousHours) {
      const taken = r.breaks.reduce((m, b) => Math.max(m, Math.round((b.end - b.start) * 60)), 0)
      out.push({ id: `bv-${r.id}`, employeeId: r.employeeId, locationId: r.locationId, date: r.date, continuousHours: longest, breakMinutes: taken, sourceRecordId: r.sourceRecordId })
    }
  }
  return out
}

/** Monday (YYYY-MM-DD) of the week containing `date`. */
export function weekOf(date: string) {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/** Violation counts grouped by week or month, with distinct employees. */
export function tallyViolations(violations: BreakViolation[], by: 'week' | 'month') {
  const groups = new Map<string, { period: string; count: number; employees: Set<string>; byLocation: Map<string, number> }>()
  for (const v of violations) {
    const period = by === 'week' ? weekOf(v.date) : v.date.slice(0, 7)
    const g = groups.get(period) ?? { period, count: 0, employees: new Set(), byLocation: new Map() }
    g.count++
    g.employees.add(v.employeeId)
    g.byLocation.set(v.locationId, (g.byLocation.get(v.locationId) ?? 0) + 1)
    groups.set(period, g)
  }
  return [...groups.values()].sort((a, b) => b.period.localeCompare(a.period))
}

export interface HourAlert {
  key: string
  employee: Employee
  locationIds: string[]
  scheduledHours: number
  actualHours: number
  /** over limit: will exceed / has exceeded; warning: will reach a warning point; on track: below both. */
  status: 'over limit' | 'warning' | 'on track' | 'missing age'
  /** Clock time the employee reaches the daily limit, from the schedule (null if they don't). */
  limitAt: string | null
  /** Warnings before the limit, with the clock time each fires and whether it has fired. */
  warnings: { minutes: number; at: string | null; sent: boolean }[]
  /** Share of the daily limit worked so far (0–1+). */
  progress: number
}

/** Clock time at which cumulative hours across `records` reach `hours`, or null if they don't. */
function timeAtHours(records: LaborRecord[], hours: number) {
  let remaining = hours
  for (const r of [...records].sort((a, b) => a.start - b.start)) {
    const length = (r.end ?? r.start) - r.start
    if (length >= remaining) return r.start + remaining
    remaining -= length
  }
  return null
}

/**
 * Under-16 hour tracker for employees with records at any of `locationIds` on `date`.
 * Hours are summed across all stores (floating employees). Warnings fire RULES.minorHours.warningMinutes
 * before the employee's scheduled time reaches the daily limit.
 */
export function hourAlerts(employees: Employee[], labor: LaborRecord[], date: string, locationIds: string[]): HourAlert[] {
  const { ageUnder, limitHours, warningMinutes } = RULES.minorHours
  const dayRecords = labor.filter((r) => r.date === date)
  const nowHour = OPEN_HOUR + NOW_SLOT
  const alerts: HourAlert[] = []

  for (const employee of employees) {
    if (employee.age !== null && employee.age >= ageUnder) continue
    const records = dayRecords.filter((r) => r.employeeId === employee.id)
    if (!records.some((r) => locationIds.includes(r.locationId))) continue
    const scheduled = records.filter((r) => r.basis === 'scheduled')
    const scheduledHours = laborHours(scheduled).total
    const actualHours = laborHours(records.filter((r) => r.basis === 'actual')).total
    const base = { key: `${employee.id}-${date}`, employee, locationIds: [...new Set(records.map((r) => r.locationId))], scheduledHours, actualHours, progress: actualHours / limitHours }

    if (employee.age === null) {
      alerts.push({ ...base, status: 'missing age', limitAt: null, warnings: [] })
      continue
    }
    const peak = Math.max(scheduledHours, actualHours)
    const limitAt = timeAtHours(scheduled, limitHours)
    // A warning has fired once the time has passed (past days: always; today: by now).
    const fired = (at: number | null) => at !== null && (date < TODAY || (date === TODAY && at <= nowHour))
    const warnings = warningMinutes.map((minutes) => {
      const at = timeAtHours(scheduled, limitHours - minutes / 60)
      return { minutes, at: at === null ? null : clock(at), sent: fired(at) }
    })
    alerts.push({
      ...base,
      status: peak > limitHours ? 'over limit' : warnings.some((w) => w.at) ? 'warning' : 'on track',
      limitAt: limitAt === null ? null : clock(limitAt),
      warnings,
    })
  }
  const order = { 'over limit': 0, warning: 1, 'missing age': 2, 'on track': 3 }
  return alerts.sort((a, b) => order[a.status] - order[b.status])
}

/** Alerts that need attention (everything except on-track). */
export const activeAlerts = (alerts: HourAlert[]) => alerts.filter((a) => a.status !== 'on track')
