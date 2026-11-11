// Staffing recommendation (UC-7), named assignment, and manual adjustment helpers (UC-14).
import { HOURS, OPEN_HOUR, hoursFor, openShare, slotLabel, staffedSlots } from './calendar'
import { RULES } from './policies'
import type { Employee, Headcount, RecShift, Station } from './types'

export const STATIONS: Station[] = ['Shift Lead', 'Line Cook', 'Prep Cook']
export const MIN_SHIFT_HOURS = 3
export const MAX_SHIFT_HOURS = 8

const zeros = () => HOURS.map(() => 0)
export const emptyHeadcount = (): Headcount => ({ 'Shift Lead': zeros(), 'Line Cook': zeros(), 'Prep Cook': zeros() })

let seq = 0
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++seq}`

export const isMinor = (e: Pick<Employee, 'age'>) => e.age !== null && e.age < RULES.minorHours.ageUnder

/**
 * Staff needed per role and hour on a date: ceil(forecast ÷ (target SPLH × planning factor)) with the
 * limits in RULES.staffingEquation while the store is open; a lead plus a prep cook for opening prep,
 * a lead plus a line cook for close-down, and nobody outside the staffed window.
 */
export function requiredStaff(predicted: number[], targetSPLH: number, date: string) {
  const { minPerHour, twoLeadsFrom, prepShare, planningFactor } = RULES.staffingEquation
  const required = emptyHeadcount()
  const minimumWins: string[] = []

  const { first, end } = staffedSlots(date)
  const { open } = hoursFor(date)
  predicted.forEach((sales, h) => {
    if (h < first || h >= end) return
    if (openShare(date, h) === 0) {
      // Before opening: prep. After closing: close-down.
      required['Shift Lead'][h] = 1
      required[OPEN_HOUR + h < open ? 'Prep Cook' : 'Line Cook'][h] = 1
      return
    }
    const byTarget = Math.ceil(sales / (targetSPLH * planningFactor))
    if (byTarget < minPerHour && openShare(date, h) === 1) minimumWins.push(HOURS[h])
    const staff = Math.max(minPerHour, byTarget)
    const lead = staff >= twoLeadsFrom ? 2 : 1
    const prep = Math.max(1, Math.round((staff - lead) * prepShare))
    required['Shift Lead'][h] = lead
    required['Prep Cook'][h] = prep
    required['Line Cook'][h] = Math.max(1, staff - lead - prep)
  })

  const conflicts: string[] = []
  if (minimumWins.length) {
    conflicts.push(`Minimum staffing (${minPerHour} per hour) is above what the $${targetSPLH} SPLH target supports at ${minimumWins.join(', ')}.`)
  }
  return { required, conflicts }
}

export function headcountOf(shifts: RecShift[]): Headcount {
  const count = emptyHeadcount()
  for (const s of shifts) for (let h = s.start; h < s.end; h++) count[s.station][h]++
  return count
}

export const totalHours = (shifts: RecShift[]) => shifts.reduce((sum, s) => sum + s.end - s.start, 0)
export const sumHeadcount = (h: Headcount) => STATIONS.reduce((n, r) => n + h[r].reduce((a, b) => a + b, 0), 0)

/**
 * Greedy role-slot builder: open a shift wherever coverage is short and run it until
 * demand drops (3–8h). Shifts in `keep` (manual or override) are kept as-is.
 */
export function buildShifts(required: Headcount, keep: RecShift[] = []): RecShift[] {
  const have = headcountOf(keep)
  const shifts: RecShift[] = [...keep]
  // Keep shifts inside the staffed day (slots with any requirement).
  const needed = HOURS.map((_, h) => STATIONS.some((s) => required[s][h] > 0))
  const first = Math.max(0, needed.indexOf(true))
  const last = needed.lastIndexOf(true) + 1 || HOURS.length
  for (const station of STATIONS) {
    const need = required[station]
    const cover = have[station]
    for (let h = 0; h < HOURS.length; h++) {
      while (cover[h] < need[h]) {
        let end = h + 1
        while (end < last && end - h < MAX_SHIFT_HOURS && (end - h < MIN_SHIFT_HOURS || cover[end] < need[end])) end++
        const start = Math.max(first, Math.min(h, end - MIN_SHIFT_HOURS))
        for (let i = start; i < end; i++) cover[i]++
        shifts.push({ id: newId('s'), station, start, end, source: 'recommended', employeeId: null })
      }
    }
  }
  return shifts
}

/** Hours each employee already works that day (any store), keyed by employee id. */
export type DayLoad = Map<string, { start: number; end: number }[]>

/**
 * Fill unassigned shifts with employees of the same role, longest shifts first. People with
 * no shifts yet are preferred; a second shift is allowed if it doesn't overlap and the day stays
 * within RULES.maxDailyHours (minors: RULES.minorHours.limitHours). `load` covers shifts at other
 * stores that day and is updated.
 */
export function assignEmployees(shifts: RecShift[], employees: Employee[], load: DayLoad): RecShift[] {
  const add = (id: string, s: { start: number; end: number }) => load.set(id, [...(load.get(id) ?? []), s])
  for (const s of shifts) if (s.employeeId) add(s.employeeId, s)
  const hoursOf = (id: string) => (load.get(id) ?? []).reduce((n, x) => n + x.end - x.start, 0)
  const order = [...shifts].filter((s) => !s.employeeId).sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start)
  const picks = new Map<string, string>()
  for (const s of order) {
    const length = s.end - s.start
    const fits = (e: Employee) => {
      const cap = isMinor(e) ? RULES.minorHours.limitHours : RULES.maxDailyHours
      const free = (load.get(e.id) ?? []).every((x) => x.end <= s.start || x.start >= s.end)
      return e.station === s.station && free && hoursOf(e.id) + length <= cap
    }
    const emp = employees.filter(fits).sort((a, b) => hoursOf(a.id) - hoursOf(b.id))[0]
    if (!emp) continue
    add(emp.id, s)
    picks.set(s.id, emp.id)
  }
  return shifts.map((s) => (picks.has(s.id) ? { ...s, employeeId: picks.get(s.id)! } : s))
}

/** +1 staff-hour: extend an adjacent shift, else add a 3h open shift. Changed shifts become 'manual'. */
export function addCoverage(shifts: RecShift[], station: Station, hour: number): RecShift[] {
  const fits = (s: RecShift) => s.station === station && s.end - s.start < MAX_SHIFT_HOURS
  const before = shifts.find((s) => fits(s) && s.end === hour)
  if (before) return shifts.map((s) => (s === before ? { ...s, end: s.end + 1, source: 'manual' } : s))
  const after = shifts.find((s) => fits(s) && s.start === hour + 1)
  if (after) return shifts.map((s) => (s === after ? { ...s, start: s.start - 1, source: 'manual' } : s))
  const start = Math.max(0, Math.min(hour, HOURS.length - MIN_SHIFT_HOURS))
  return [...shifts, { id: newId('s'), station, start, end: start + MIN_SHIFT_HOURS, source: 'manual', employeeId: null }]
}

/** −1 staff-hour: trim a shift that starts or ends at this slot (open shifts first); no-op if none. */
export function removeCoverage(shifts: RecShift[], station: Station, hour: number): RecShift[] {
  const edge = [...shifts]
    .sort((a, b) => Number(a.employeeId !== null) - Number(b.employeeId !== null))
    .find((s) => s.station === station && (s.end - 1 === hour || s.start === hour))
  if (!edge) return shifts
  const trimmed: RecShift = edge.end - 1 === hour ? { ...edge, end: edge.end - 1, source: 'manual' } : { ...edge, start: edge.start + 1, source: 'manual' }
  return trimmed.end <= trimmed.start ? shifts.filter((s) => s !== edge) : shifts.map((s) => (s === edge ? trimmed : s))
}

/** Chart rows for StaffingChart. */
export function staffRows(required: Headcount, shifts: RecShift[]) {
  const have = headcountOf(shifts)
  return HOURS.map((hour, i) => ({
    hour,
    lead: have['Shift Lead'][i],
    cook: have['Line Cook'][i],
    prep: have['Prep Cook'][i],
    required: STATIONS.reduce((n, s) => n + required[s][i], 0),
  }))
}

/** Rule check for one shift's times. */
export function validateShift(s: Pick<RecShift, 'start' | 'end'>) {
  const length = s.end - s.start
  if (length <= 0) return 'End must be after start.'
  if (length > MAX_SHIFT_HOURS) return `Shifts can be at most ${MAX_SHIFT_HOURS} hours.`
  if (s.start < 0 || s.end > HOURS.length) return 'Shift must be within opening hours.'
  return null
}

/** Schedule-wide checks: shift times, double-booking, and the under-16 daily limit. */
export function validateSchedule(shifts: RecShift[], employees: Employee[]) {
  for (const s of shifts) {
    const e = validateShift(s)
    if (e) return e
  }
  const byEmployee = new Map<string, RecShift[]>()
  for (const s of shifts) if (s.employeeId) byEmployee.set(s.employeeId, [...(byEmployee.get(s.employeeId) ?? []), s])
  for (const [id, list] of byEmployee) {
    const emp = employees.find((e) => e.id === id)
    const name = emp?.name ?? id
    const sorted = [...list].sort((a, b) => a.start - b.start)
    if (sorted.some((s, i) => i > 0 && s.start < sorted[i - 1].end)) return `${name} has overlapping shifts.`
    const hours = totalHours(list)
    if (emp && isMinor(emp) && hours > RULES.minorHours.limitHours) {
      return `${name} is under ${RULES.minorHours.ageUnder}: ${hours}h is over the ${RULES.minorHours.limitHours}h daily limit.`
    }
  }
  return null
}

/** Readable differences: headcount changes ("+1 Line Cook, 5 PM–9 PM") and reassignments. */
export function changeSummary(before: RecShift[], after: RecShift[], nameOf: (id: string | null) => string = (id) => id ?? 'Open'): string[] {
  const a = headcountOf(before)
  const b = headcountOf(after)
  const lines: string[] = []
  for (const station of STATIONS) {
    let h = 0
    while (h < HOURS.length) {
      const delta = b[station][h] - a[station][h]
      if (delta === 0) {
        h++
        continue
      }
      let end = h + 1
      while (end < HOURS.length && b[station][end] - a[station][end] === delta) end++
      lines.push(`${delta > 0 ? '+' : '−'}${Math.abs(delta)} ${station}, ${slotLabel(h)}–${slotLabel(end)}`)
      h = end
    }
  }
  for (const s of after) {
    const prev = before.find((p) => p.id === s.id)
    if (prev && prev.employeeId !== s.employeeId) {
      lines.push(`${s.station} ${slotLabel(s.start)}–${slotLabel(s.end)}: ${nameOf(prev.employeeId)} → ${nameOf(s.employeeId)}`)
    } else if (!prev && s.employeeId) {
      lines.push(`${nameOf(s.employeeId)} added as ${s.station}, ${slotLabel(s.start)}–${slotLabel(s.end)}`)
    }
  }
  return lines
}
