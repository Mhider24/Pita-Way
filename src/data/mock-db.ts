// MOCK DATA SOURCE. Everything here stands in for Toast, 7shifts, the forecast service and the
// app database. Replace `seedDb()` with API loads; keep the Db shape so the UI is unaffected.
import { DATES, NOW_SLOT, OPEN_HOUR, TODAY, closedSlots, isFuture } from './calendar'
import { AVG_TICKET, MODEL_VERSION, baseDemand, makeForecastRun, noise } from './forecast'
import { RULES } from './policies'
import { assignEmployees, buildShifts, requiredStaff, type DayLoad } from './staffing'
import type {
  BreakViolation, Discrepancy, Employee, EmployeeAssignment, ForecastRun, ImportBatch, LaborRecord, LaborTarget, Location,
  ManualAdjustment, ModelVersion, OverrideRequest, PayrollRecord, RecShift, SalesInterval, ScheduleRecommendation, SourceStatus,
  Station, UserAccount, UserLocationAccess,
} from './types'

export interface Db {
  locations: Location[]
  users: UserAccount[]
  /** userId → password (makeshift auth, see DEMO_PASSWORD). */
  credentials: Record<string, string>
  access: UserLocationAccess[]
  employees: Employee[]
  assignments: EmployeeAssignment[]
  sales: SalesInterval[]
  labor: LaborRecord[]
  targets: LaborTarget[]
  models: ModelVersion[]
  runs: ForecastRun[]
  recommendations: ScheduleRecommendation[]
  overrides: OverrideRequest[]
  adjustments: ManualAdjustment[]
  imports: ImportBatch[]
  sources: SourceStatus[]
  discrepancies: Discrepancy[]
  payroll: PayrollRecord[]
  /** Logged violations from earlier weeks; the current week is detected from Toast punches. */
  breakViolationHistory: BreakViolation[]
}

const LOCATIONS: Location[] = [
  { id: 'pw-101', name: 'Clarkston', storeNumber: 101, district: 'North Oakland', type: 'Drive-Thru', address: '6650 Highland Rd, Clarkston, MI', timezone: 'America/Detroit', sourceStoreIds: { toast: 'TST-101', sevenShifts: '7S-4401' }, demandScale: 1.0 },
  { id: 'pw-104', name: 'Birmingham', storeNumber: 104, district: 'South Oakland', type: 'Inline', address: '175 N Old Woodward Ave, Birmingham, MI', timezone: 'America/Detroit', sourceStoreIds: { toast: 'TST-104', sevenShifts: '7S-4404' }, demandScale: 1.15 },
  { id: 'pw-107', name: 'Troy Big Beaver', storeNumber: 107, district: 'East Oakland', type: 'Flagship', address: '888 W Big Beaver Rd, Troy, MI', timezone: 'America/Detroit', sourceStoreIds: { toast: 'TST-107', sevenShifts: '7S-4407' }, demandScale: 1.45 },
  { id: 'pw-110', name: 'Farmington Hills', storeNumber: 110, district: 'West Oakland', type: 'Drive-Thru', address: '30740 12 Mile Rd, Farmington Hills, MI', timezone: 'America/Detroit', sourceStoreIds: { toast: 'TST-110', sevenShifts: '7S-4410' }, demandScale: 0.96 },
  { id: 'pw-112', name: 'Novi Town Center', storeNumber: 112, district: 'West Oakland', type: 'Inline', address: '43317 Grand River Ave, Novi, MI', timezone: 'America/Detroit', sourceStoreIds: { toast: 'TST-112', sevenShifts: '7S-4412' }, demandScale: 1.08 },
  { id: 'pw-115', name: 'Lake Orion', storeNumber: 115, district: 'North Oakland', type: 'Drive-Thru', address: '1090 S Lapeer Rd, Lake Orion, MI', timezone: 'America/Detroit', sourceStoreIds: { toast: 'TST-115', sevenShifts: '7S-4415' }, demandScale: 0.8 },
]

const TARGET_SPLH: Record<string, number> = { 'pw-101': 72, 'pw-104': 82, 'pw-107': 88, 'pw-110': 76, 'pw-112': 80, 'pw-115': 70 }

const USERS: UserAccount[] = [
  { id: 'u-admin', name: 'Jordan Reyes', signInReference: 'jordan.reyes@pitaway.example', role: 'admin', active: true },
  { id: 'u-dm', name: 'Alexandra Wright', signInReference: 'alexandra.wright@pitaway.example', role: 'district_manager', active: true },
  { id: 'u-sm-101', name: 'Sarah Jenkins', signInReference: 'sarah.jenkins@pitaway.example', role: 'store_manager', active: true },
  { id: 'u-sm-104', name: 'Marcus Vance', signInReference: 'marcus.vance@pitaway.example', role: 'store_manager', active: true },
  { id: 'u-sl-101', name: 'Leo Brooks', signInReference: 'leo.brooks@pitaway.example', role: 'shift_lead', active: true, employeeId: 'pw-101-e1' },
  { id: 'u-crew-101', name: 'Caleb Khalil', signInReference: 'caleb.khalil@pitaway.example', role: 'crew_member', active: true, employeeId: 'pw-101-e7' },
  { id: 'u-sm-110', name: 'Tariq Al-Mansoor', signInReference: 'tariq.almansoor@pitaway.example', role: 'store_manager', active: false },
]

/**
 * MAKESHIFT AUTH: demo passwords in plain text, no 2FA, no hashing. For local demos only.
 * Replace with the real authentication provider (Q3, Q27) before any deployment.
 */
export const DEMO_PASSWORD = 'PitaWay-demo-2026'
const CREDENTIALS: Record<string, string> = Object.fromEntries(USERS.map((u) => [u.id, DEMO_PASSWORD]))

const ALL = LOCATIONS.map((l) => l.id)
const ACCESS: UserLocationAccess[] = [
  ...ALL.map((locationId) => ({ userId: 'u-admin', locationId })),
  ...ALL.map((locationId) => ({ userId: 'u-dm', locationId })),
  { userId: 'u-sm-101', locationId: 'pw-101' },
  { userId: 'u-sm-104', locationId: 'pw-104' },
  { userId: 'u-sm-104', locationId: 'pw-107' },
  { userId: 'u-sl-101', locationId: 'pw-101' },
  { userId: 'u-crew-101', locationId: 'pw-101' },
  { userId: 'u-sm-110', locationId: 'pw-110' },
]

// --- Crew ------------------------------------------------------------------

const FIRST = ['Leo', 'Maya', 'Darius', 'Priya', 'Owen', 'Nadia', 'Caleb', 'Sofia', 'Jalen', 'Hana', 'Mateo', 'Ava', 'Rami', 'Grace', 'Theo', 'Layla', 'Isaac', 'Zoe', 'Omar', 'Ella']
const LAST = ['Brooks', 'Lin', 'Cole', 'Patel', 'Hughes', 'Haddad', 'Moore', 'Reyes', 'Carter', 'Kim', 'Diaz', 'Foster', 'Saleh', 'Turner', 'Park', 'Nasser', 'Ward', 'Bell', 'Khalil', 'Ortiz']
const CREW: [Station, number | null][] = [
  ['Shift Lead', 29], ['Shift Lead', 34], ['Shift Lead', 26],
  ['Line Cook', 22], ['Line Cook', 24], ['Line Cook', 19], ['Line Cook', 15], ['Line Cook', 31], ['Line Cook', null],
  ['Prep Cook', 27], ['Prep Cook', 23], ['Prep Cook', 15],
  ['Shift Lead', 31], ['Line Cook', 21], ['Line Cook', 17], ['Line Cook', 25], ['Prep Cook', 18],
]
/** Floating employees: [home, second store, station, age]. */
const FLOATERS: [string, string, Station, number][] = [
  ['pw-101', 'pw-115', 'Line Cook', 20],
  ['pw-110', 'pw-112', 'Prep Cook', 15],
]

function seedCrew() {
  const employees: Employee[] = []
  const assignments: EmployeeAssignment[] = []
  LOCATIONS.forEach((loc, li) => {
    CREW.forEach(([station, age], i) => {
      const id = `${loc.id}-e${i + 1}`
      employees.push({
        id,
        name: `${FIRST[(i + li * 7) % FIRST.length]} ${LAST[(i * 3 + li * 5) % LAST.length]}`,
        age,
        station,
        sourceIds: { toast: `TST-E-${loc.storeNumber}${i}`, sevenShifts: `7S-E-${loc.storeNumber}${i}` },
      })
      assignments.push({ employeeId: id, locationId: loc.id, effectiveFrom: '2026-01-01' })
    })
  })
  FLOATERS.forEach(([home, second, station, age], i) => {
    const id = `float-${i + 1}`
    employees.push({ id, name: ['Samir Aziz', 'Lena Novak'][i], age, station, sourceIds: { toast: `TST-F-${i}`, sevenShifts: `7S-F-${i}` } })
    assignments.push({ employeeId: id, locationId: home, effectiveFrom: '2026-03-01' }, { employeeId: id, locationId: second, effectiveFrom: '2026-06-01' })
  })
  return { employees, assignments }
}

// --- Labor: scheduled from 7shifts, actual punches from the Toast time clock ---

/** 7shifts scheduled records come from the named schedule; Toast punches drift from them. */
function seedLabor(employees: Employee[], recommendations: ScheduleRecommendation[]) {
  const labor: LaborRecord[] = []
  for (const rec of recommendations) {
    const { date } = rec
    for (const slot of rec.shifts) {
      if (!slot.employeeId) continue // open shifts have no one to schedule
      const length = slot.end - slot.start
      const start = OPEN_HOUR + slot.start
      const end = OPEN_HOUR + slot.end
      const breaks = length >= 6 ? [{ start: start + 3, end: start + 3.5 }] : []
      const n = labor.length
      const base = { employeeId: slot.employeeId, locationId: rec.locationId, date, station: slot.station }
      labor.push({ ...base, id: `lr-${n}`, sourceRecordId: `7S-S-${n}`, start, end, basis: 'scheduled', source: '7shifts', breaks })

      if (isFuture(date)) continue
      const now = OPEN_HOUR + NOW_SLOT
      if (date === TODAY && start >= now) continue // not clocked in yet
      // Actual punches drift from the schedule by up to ±30 min.
      const jitter = Math.round(noise(n) * 2) * 0.25
      const actualEnd = date === TODAY && end > now ? null : end + jitter
      // A few long shifts have no break recorded, so UC-12 can flag them.
      const actualBreaks = length >= 6 && n % 9 === 0 ? [] : breaks
      labor.push({ ...base, id: `lr-${n}a`, sourceRecordId: `TST-TC-${n}`, start: start + (n % 4 === 0 ? 0.25 : 0), end: actualEnd, basis: 'actual', source: 'Toast time clock', breaks: actualBreaks })
    }
  }
  // Missing clock-out on a past day (incomplete record).
  const lost = labor.find((r) => r.locationId === 'pw-104' && r.date === '2026-10-28' && r.basis === 'actual')
  if (lost) lost.end = null
  // A minor at Clarkston stayed 30 min past a 5h shift with no break (break violation).
  const minorIds = new Set(employees.filter((e) => e.age !== null && e.age < 18).map((e) => e.id))
  const late = labor.find((r) => r.locationId === 'pw-101' && r.date === '2026-10-28' && r.basis === 'actual' && minorIds.has(r.employeeId))
  if (late) {
    late.end = late.start + 5.5
    late.breaks = []
  }
  return labor
}

// --- Sales (mock Toast) ---------------------------------------------------

/** Lake Orion's latest Toast update failed: its data stops at noon today. */
const STALE: Record<string, number> = { 'pw-115': 3 }

function seedSales() {
  const sales: SalesInterval[] = []
  for (const loc of LOCATIONS) {
    for (const date of DATES) {
      const closed = date === TODAY && STALE[loc.id] !== undefined ? STALE[loc.id] : closedSlots(date)
      baseDemand(loc, date).forEach((v, slot) => {
        if (slot >= closed) return
        const day = Number(date.slice(-2))
        const amount = Math.round(v * (1 + noise(loc.storeNumber * 3 + day * 17 + slot) * 0.08))
        sales.push({
          id: `si-${loc.id}-${date}-${slot}`,
          sourceRecordId: `TST-O-${loc.storeNumber}-${day}-${slot}`,
          locationId: loc.id,
          date,
          slot,
          amount,
          orders: Math.round((amount / AVG_TICKET[slot]) * (1 + noise(loc.storeNumber + day * 5 + slot * 3) * 0.05)),
          source: 'toast',
        })
      })
    }
  }
  return sales
}

// --- Forecasts and recommendations ----------------------------------------

/** Last date whose schedule is published to the team. */
const PUBLISHED_THROUGH = '2026-11-01'

const dayBefore = (date: string) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function seedForecasts(employees: Employee[], assignments: EmployeeAssignment[]) {
  const runs: ForecastRun[] = []
  const recommendations: ScheduleRecommendation[] = []
  for (const [di, date] of DATES.entries()) {
    const busy: DayLoad = new Map()
    // Alternate store order so floating employees also get shifts at their second store.
    for (const loc of di % 2 ? [...LOCATIONS].reverse() : LOCATIONS) {
      const prev = dayBefore(date)
      const run = makeForecastRun(loc, date, { runNumber: 1, createdAt: `${prev}T06:00:00`, dataCutoff: `${prev < TODAY ? prev : TODAY}T00:00:00` })
      runs.push(run)
      const { required, conflicts } = requiredStaff(run.predicted, TARGET_SPLH[loc.id], date)
      const crew = assignments.filter((a) => a.locationId === loc.id).map((a) => employees.find((e) => e.id === a.employeeId)!)
      recommendations.push({
        id: `rec-${loc.id}-${date}`,
        forecastRunId: run.id,
        locationId: loc.id,
        date,
        version: 1,
        targetSPLH: TARGET_SPLH[loc.id],
        required,
        conflicts,
        shifts: assignEmployees(buildShifts(required), crew, busy),
        // This week is published; next week is still a draft.
        status: date <= PUBLISHED_THROUGH ? 'accepted' : 'draft',
        updatedAt: `${prev}T06:05:00`,
      })
    }
  }
  return { runs, recommendations }
}

function seedWorkflow(recommendations: ScheduleRecommendation[]) {
  const rec = (loc: string, date: string) => recommendations.find((r) => r.locationId === loc && r.date === date)!
  const extra = (station: Station, start: number, end: number, source: RecShift['source']): RecShift => ({ id: `s-seed-${station}-${start}-${source}`, station, start, end, source, employeeId: null })

  // Approved yesterday at Troy: applied as version 2.
  const troy = rec('pw-107', '2026-10-29')
  const troyBefore = troy.shifts
  troy.shifts = [...troyBefore, extra('Prep Cook', 0, 3, 'override')]
  troy.version = 2

  // Manual adjustment at Novi, applied immediately (within the approval limit).
  const novi = rec('pw-112', '2026-10-28')
  const noviBefore = novi.shifts
  novi.shifts = [...noviBefore, extra('Line Cook', 9, 11, 'manual')]
  novi.version = 2

  const clarkston = rec('pw-101', TODAY)
  const overrides: OverrideRequest[] = [
    {
      id: 'ovr-1', recommendationId: clarkston.id, baseVersion: 1, locationId: 'pw-101', date: TODAY,
      requesterId: 'u-sm-101', submittedAt: `${TODAY}T13:42:00`, reason: 'Catering order',
      notes: 'Clarkston High athletic banquet, 85 platters for pickup at 5:30 PM. Need an extra line cook through close.',
      proposedShifts: [...clarkston.shifts, extra('Line Cook', 8, 12, 'override')],
      changeSummary: ['+1 Line Cook, 5 PM–9 PM'], status: 'pending',
    },
    {
      id: 'ovr-0', recommendationId: troy.id, baseVersion: 1, locationId: 'pw-107', date: '2026-10-29',
      requesterId: 'u-sm-104', submittedAt: '2026-10-28T10:15:00', reason: 'Local event',
      notes: 'Chamber of Commerce lunch catering. Extra prep for bulk hummus and tabbouleh.',
      proposedShifts: troy.shifts, changeSummary: ['+1 Prep Cook, 9 AM–12 PM'], status: 'approved',
      reviewerId: 'u-dm', decidedAt: '2026-10-28T10:45:00', decisionNote: 'Approved. Catering invoice verified.',
    },
  ]
  const adjustments: ManualAdjustment[] = [
    {
      id: 'adj-0', recommendationId: troy.id, locationId: 'pw-107', date: '2026-10-29', authorId: 'u-sm-104', createdAt: '2026-10-28T10:15:00',
      reason: 'Local event', notes: overrides[1].notes, changeSummary: overrides[1].changeSummary,
      hoursBefore: troyBefore.reduce((n, s) => n + s.end - s.start, 0), hoursAfter: troy.shifts.reduce((n, s) => n + s.end - s.start, 0),
      outcome: 'sent for approval', overrideId: 'ovr-0',
    },
    {
      id: 'adj-1', recommendationId: novi.id, locationId: 'pw-112', date: '2026-10-28', authorId: 'u-dm', createdAt: '2026-10-27T16:20:00',
      reason: 'Local event', notes: 'High school football game nearby; extra cook for the dinner rush.', changeSummary: ['+1 Line Cook, 6 PM–8 PM'],
      hoursBefore: noviBefore.reduce((n, s) => n + s.end - s.start, 0), hoursAfter: novi.shifts.reduce((n, s) => n + s.end - s.start, 0),
      outcome: 'applied',
    },
  ]
  return { overrides, adjustments }
}

function seedOperations(labor: LaborRecord[]) {
  const imports: ImportBatch[] = [
    { id: 'imp-1', source: 'Toast sales', locationId: 'all', period: 'Jan 1 2024 – Oct 25 2026 (history)', receivedAt: '2026-10-20T09:12:00', accepted: 52416, rejected: 37, issues: ['31 rows missing interval start', '6 duplicate rows skipped (pw-107, Oct 2026)'] },
    { id: 'imp-2', source: '7shifts schedule', locationId: 'all', period: 'Oct 19 – Nov 8 2026', receivedAt: `${TODAY}T06:00:00`, accepted: labor.filter((r) => r.basis === 'scheduled').length, rejected: 1, issues: ['7shifts employee 7S-E-0931 not matched to an employee'] },
    { id: 'imp-3', source: 'Toast time clock', locationId: 'all', period: `Oct 19 – ${TODAY}`, receivedAt: `${TODAY}T14:00:00`, accepted: labor.filter((r) => r.basis === 'actual').length, rejected: 0, issues: ['pw-104 Oct 28: one punch without clock-out'] },
    { id: 'imp-4', source: 'Payroll', locationId: 'all', period: 'Oct 19 – Nov 1 2026', receivedAt: `${TODAY}T05:00:00`, accepted: 74, rejected: 0, issues: [] },
  ]
  const sources: SourceStatus[] = LOCATIONS.flatMap((loc): SourceStatus[] => [
    loc.id === 'pw-115'
      ? { source: 'Toast', locationId: loc.id, connection: 'api', lastSuccessAt: `${TODAY}T12:05:00`, lastAttemptAt: `${TODAY}T14:00:00`, lastResult: 'failed', message: 'Toast returned an error for this store. Showing data from the last successful update.' }
      : { source: 'Toast', locationId: loc.id, connection: 'api', lastSuccessAt: `${TODAY}T14:00:00`, lastAttemptAt: `${TODAY}T14:00:00`, lastResult: 'ok', message: 'Hourly update: sales, orders and time-clock punches' },
    { source: '7shifts', locationId: loc.id, connection: 'api', lastSuccessAt: `${TODAY}T06:00:00`, lastAttemptAt: `${TODAY}T06:00:00`, lastResult: 'ok', message: 'Scheduled shifts sync' },
    { source: 'Payroll', locationId: loc.id, connection: 'file import', lastSuccessAt: `${TODAY}T05:00:00`, lastAttemptAt: `${TODAY}T05:00:00`, lastResult: 'ok', message: 'Bi-weekly export: home store and paid-out store per employee' },
    { source: 'Weather', locationId: loc.id, connection: 'api', lastSuccessAt: `${TODAY}T13:00:00`, lastAttemptAt: `${TODAY}T13:00:00`, lastResult: 'ok', message: 'Hourly forecast for the store area' },
  ])
  const discrepancies: Discrepancy[] = [
    { id: 'dq-3', kind: 'unmatched employee', locationId: 'pw-112', description: '7shifts employee "J. Ortiz" has no matching employee record.', sourceRef: '7S-E-0931', status: 'open' },
    { id: 'dq-4', kind: 'uncertain match', locationId: 'pw-104', description: 'Toast employee "M. Patel" may be the same person as an existing Birmingham employee.', sourceRef: 'TST-E-552', candidateEmployeeId: 'pw-104-e10', status: 'open' },
    { id: 'dq-5', kind: 'duplicate record', locationId: 'pw-107', description: 'Two Toast intervals for Oct 27, 11 AM with different source IDs. One was skipped.', sourceRef: 'TST-O-107-27-3 / TST-O-107-27-3b', status: 'open' },
  ]
  return { imports, sources, discrepancies }
}

// --- Payroll and break-violation history -----------------------------------

/**
 * One payroll line per employee and paid-out store. Floaters: Samir is paid entirely by his
 * home store (Clarkston) even for Lake Orion hours; Lena's Novi hours are paid out by Novi.
 */
function seedPayroll(employees: Employee[], assignments: EmployeeAssignment[]): PayrollRecord[] {
  return employees.flatMap((e, i) => {
    const home = assignments.find((a) => a.employeeId === e.id)!.locationId
    const hours = 24 + (i % 5) * 4
    const line = (paidLocationId: string, h: number): PayrollRecord => ({ id: `pr-${e.id}-${paidLocationId}`, employeeId: e.id, payPeriod: 'Oct 19 – Nov 1 2026', homeLocationId: home, paidLocationId, hours: h })
    return e.id === 'float-2' ? [line(home, hours - 8), line('pw-112', 8)] : [line(home, hours)]
  })
}

/** Weekly logs from Aug 31 – Oct 18 (the 7 weeks before the planning range). */
function seedViolationHistory(employees: Employee[], assignments: EmployeeAssignment[]): BreakViolation[] {
  const minors = employees.filter((e) => e.age !== null && e.age < RULES.minorBreaks.ageUnder)
  const out: BreakViolation[] = []
  for (let week = 0; week < 7; week++) {
    const monday = new Date('2026-08-31T12:00:00')
    monday.setDate(monday.getDate() + week * 7)
    minors.forEach((e, i) => {
      // 0–2 violations per minor per week, deterministic.
      const count = Math.max(0, Math.round(noise(i * 11 + week * 5) * 1.6))
      for (let k = 0; k < count; k++) {
        const d = new Date(monday)
        d.setDate(d.getDate() + ((i + k * 3) % 6))
        out.push({
          id: `bv-${e.id}-${week}-${k}`,
          employeeId: e.id,
          locationId: assignments.find((a) => a.employeeId === e.id)!.locationId,
          date: d.toISOString().slice(0, 10),
          continuousHours: 5.25 + ((i + k) % 3) * 0.25,
          breakMinutes: 0,
          sourceRecordId: `TST-TC-H${week}${i}${k}`,
        })
      }
    })
  }
  return out
}

export function seedDb(): Db {
  const { employees, assignments } = seedCrew()
  const { runs, recommendations } = seedForecasts(employees, assignments)
  const { overrides, adjustments } = seedWorkflow(recommendations)
  const labor = seedLabor(employees, recommendations)
  return {
    locations: LOCATIONS,
    users: USERS,
    credentials: CREDENTIALS,
    access: ACCESS,
    employees,
    assignments,
    sales: seedSales(),
    labor,
    targets: LOCATIONS.map((l) => ({ locationId: l.id, targetType: 'SPLH', value: TARGET_SPLH[l.id], effectiveFrom: '2026-10-01' })),
    models: [MODEL_VERSION],
    runs,
    recommendations,
    overrides,
    adjustments,
    ...seedOperations(labor),
    payroll: seedPayroll(employees, assignments),
    breakViolationHistory: seedViolationHistory(employees, assignments),
  }
}
