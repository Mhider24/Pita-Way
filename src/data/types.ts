// Domain records, following the SRS data dictionary (section 3.1.1).
// Times within a day are decimal hours (8.5 = 8:30 AM); hourly slots index HOURS.

export type Role = 'admin' | 'district_manager' | 'store_manager' | 'shift_lead' | 'crew_member'
export type Station = 'Shift Lead' | 'Line Cook' | 'Prep Cook'
export type StoreType = 'Drive-Thru' | 'Inline' | 'Flagship'

export interface Location {
  id: string
  name: string
  storeNumber: number
  district: string
  type: StoreType
  address: string
  timezone: string
  sourceStoreIds: { toast: string; sevenShifts: string }
  /** Mock: relative sales volume. A real forecast replaces this. */
  demandScale: number
}

export interface UserAccount {
  id: string
  name: string
  signInReference: string
  role: Role
  active: boolean
  /** Employee record for crew accounts (own hours, alerts and breaks). */
  employeeId?: string
}

export interface UserLocationAccess {
  userId: string
  locationId: string
}

export interface Employee {
  id: string
  name: string
  /** null when the source record has no age; age-based rules can't be evaluated. */
  age: number | null
  station: Station
  sourceIds: { toast?: string; sevenShifts?: string }
}

export interface EmployeeAssignment {
  employeeId: string
  locationId: string
  effectiveFrom: string
}

export interface SalesInterval {
  id: string
  sourceRecordId: string
  locationId: string
  date: string
  /** Index into HOURS. */
  slot: number
  amount: number
  /** Order (ticket) count in the interval. */
  orders: number
  source: 'toast' | 'import'
}

export interface BreakRecord {
  start: number
  end: number
  paid?: boolean
}

export interface LaborRecord {
  id: string
  sourceRecordId: string
  employeeId: string
  locationId: string
  date: string
  start: number
  /** null = no clock-out recorded (in progress today, incomplete otherwise). */
  end: number | null
  basis: 'scheduled' | 'actual'
  station: Station
  /** Toast time clock is the source of truth for actual hours; 7shifts for scheduled hours. */
  source: '7shifts' | 'Toast time clock' | 'manual entry'
  breaks: BreakRecord[]
}

export interface LaborTarget {
  locationId: string
  targetType: 'SPLH'
  value: number
  effectiveFrom: string
}

export interface ModelVersion {
  id: string
  method: string
  trainingCutoff: string
  inputs: string
  validationSummary: string
}

export interface ForecastRun {
  id: string
  locationId: string
  date: string
  createdAt: string
  dataCutoff: string
  horizon: string
  modelVersionId: string
  status: 'completed' | 'failed'
  limitations: string[]
  /** Predicted sales per HOURS slot. */
  predicted: number[]
  /** Predicted order count per HOURS slot. */
  predictedOrders: number[]
}

export type Headcount = Record<Station, number[]>

/** A shift for one role covering slots [start, end), optionally assigned to an employee. */
export interface RecShift {
  id: string
  station: Station
  start: number
  end: number
  source: 'recommended' | 'manual' | 'override'
  /** Assigned employee; null = open shift. */
  employeeId: string | null
}

export interface ScheduleRecommendation {
  id: string
  forecastRunId: string
  locationId: string
  date: string
  version: number
  targetSPLH: number
  required: Headcount
  conflicts: string[]
  shifts: RecShift[]
  status: 'draft' | 'accepted'
  updatedAt: string
}

export const ADJUSTMENT_REASONS = ['Shift swap / availability', 'Catering order', 'Local event', 'Weather', 'Ramadan / Hijri holiday', 'Training', 'Other'] as const
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]

export interface OverrideRequest {
  id: string
  recommendationId: string
  /** Recommendation version the change was proposed against. */
  baseVersion: number
  locationId: string
  date: string
  requesterId: string
  submittedAt: string
  reason: AdjustmentReason
  notes: string
  proposedShifts: RecShift[]
  changeSummary: string[]
  status: 'pending' | 'approved' | 'rejected'
  reviewerId?: string
  decidedAt?: string
  decisionNote?: string
}

export interface ManualAdjustment {
  id: string
  recommendationId: string
  locationId: string
  date: string
  authorId: string
  createdAt: string
  reason: AdjustmentReason
  notes: string
  changeSummary: string[]
  hoursBefore: number
  hoursAfter: number
  outcome: 'applied' | 'sent for approval'
  overrideId?: string
}

export interface ImportBatch {
  id: string
  source: 'Toast sales' | 'Toast time clock' | '7shifts schedule' | 'Payroll' | 'Sales CSV'
  locationId: string | 'all'
  period: string
  receivedAt: string
  accepted: number
  rejected: number
  issues: string[]
}

export interface SourceStatus {
  source: 'Toast' | '7shifts' | 'Payroll' | 'Weather'
  locationId: string
  connection: 'api' | 'file import' | 'not connected'
  lastSuccessAt: string | null
  lastAttemptAt: string | null
  lastResult: 'ok' | 'failed' | 'none'
  message: string
}

export interface Discrepancy {
  id: string
  kind: 'unmatched employee' | 'uncertain match' | 'duplicate record'
  locationId: string
  description: string
  sourceRef: string
  candidateEmployeeId?: string
  status: 'open' | 'confirmed' | 'kept unresolved'
  resolvedBy?: string
  resolvedAt?: string
}

/** Payroll export line: who paid the employee, for which store's hours. */
export interface PayrollRecord {
  id: string
  employeeId: string
  payPeriod: string
  /** Employee's home store according to payroll. */
  homeLocationId: string
  /** Store whose payroll paid out these hours. */
  paidLocationId: string
  hours: number
}

/** A minor worked longer than the continuous-work limit without the required break (from Toast punches). */
export interface BreakViolation {
  id: string
  employeeId: string
  locationId: string
  date: string
  continuousHours: number
  breakMinutes: number
  sourceRecordId: string
}
