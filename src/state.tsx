import { createContext, useContext, useState, type ReactNode } from 'react'
import { NOW_ISO, TODAY } from './data/calendar'
import { latestRun, makeForecastRun } from './data/forecast'
import { parseSalesCsv, type ImportResult } from './data/imports'
import { seedDb, type Db } from './data/mock-db'
import { can, locationsFor, type Action } from './data/permissions'
import { RULES } from './data/policies'
import { assignEmployees, buildShifts, changeSummary, newId, requiredStaff, totalHours, validateSchedule, type DayLoad } from './data/staffing'
import type { AdjustmentReason, Discrepancy, RecShift, Role, ScheduleRecommendation } from './data/types'

export type Page = 'dashboard' | 'forecast' | 'schedule' | 'splh' | 'overrides' | 'alerts' | 'data' | 'users'

/** Permission needed to open each page. */
export const PAGE_ACTION: Record<Page, Action[]> = {
  dashboard: ['forecast.view'],
  forecast: ['forecast.view'],
  schedule: ['schedule.view'],
  splh: ['splh.view'],
  overrides: ['override.request', 'override.review'],
  alerts: ['alerts.view'],
  data: ['data.manage'],
  users: ['users.manage'],
}

/** Testing convenience: when false, sign-in only checks the email. Set to true to enforce passwords. */
export const REQUIRE_PASSWORD = false

export type Result = { ok: true; message?: string } | { ok: false; error: string }
const denied: Result = { ok: false, error: 'You do not have permission for this action at this location.' }

function useAppStore() {
  const [db, setDb] = useState<Db>(seedDb)
  const [userId, setUserId] = useState<string | null>(null)
  const [page, setPageState] = useState<Page>('dashboard')
  const [locationId, setLocationId] = useState('pw-101')
  const [date, setDate] = useState(TODAY)

  const user = db.users.find((u) => u.id === userId) ?? null
  const myLocations = user ? db.locations.filter((l) => locationsFor(user, db.access).includes(l.id)) : []
  const allowed = (action: Action, loc?: string) => can(user, action, db.access, loc)
  const canOpen = (p: Page) => PAGE_ACTION[p].some((a) => allowed(a))
  const location = db.locations.find((l) => l.id === locationId)!

  const setPage = (p: Page) => {
    if (!canOpen(p)) return
    setPageState(p)
    window.scrollTo(0, 0)
  }

  // --- UC-1 ---------------------------------------------------------------
  // Makeshift email + password check against the mock credentials (no 2FA). Q3 / Q27.
  const signIn = (email: string, password: string): Result => {
    const account = db.users.find((u) => u.signInReference.toLowerCase() === email.trim().toLowerCase())
    // Same message for unknown email and wrong password, so accounts can't be probed.
    if (!account || (REQUIRE_PASSWORD && db.credentials[account.id] !== password)) return { ok: false, error: 'Incorrect email or password.' }
    if (!account.active) return { ok: false, error: 'This account is inactive. Contact an administrator.' }
    const locs = locationsFor(account, db.access)
    const first = (Object.keys(PAGE_ACTION) as Page[]).find((p) => PAGE_ACTION[p].some((a) => can(account, a, db.access)))
    setUserId(account.id)
    setLocationId(locs[0] ?? 'pw-101')
    setDate(TODAY)
    setPageState(first ?? 'schedule')
    return { ok: true }
  }
  const signOut = () => {
    setUserId(null)
  }

  /** Employees who can work at a store (assigned there, including floating employees). */
  const crewAt = (loc: string) => db.assignments.filter((a) => a.locationId === loc).map((a) => db.employees.find((e) => e.id === a.employeeId)!)
  const nameOf = (id: string | null) => (id ? db.employees.find((e) => e.id === id)?.name ?? id : 'Open shift')
  /** Shifts employees already work at other stores that day. */
  const busyElsewhere = (loc: string, d: string): DayLoad => {
    const load: DayLoad = new Map()
    for (const r of db.recommendations) {
      if (r.date !== d || r.locationId === loc) continue
      for (const s of r.shifts) if (s.employeeId) load.set(s.employeeId, [...(load.get(s.employeeId) ?? []), s])
    }
    return load
  }

  const recFor = (loc: string, d: string) => db.recommendations.find((r) => r.locationId === loc && r.date === d)
  const updateRec = (rec: ScheduleRecommendation) =>
    setDb((prev) => ({ ...prev, recommendations: prev.recommendations.map((r) => (r.id === rec.id ? rec : r)) }))

  // --- UC-6 ---------------------------------------------------------------
  const generateForecast = (loc: string, d: string): Result => {
    if (!allowed('forecast.generate', loc)) return denied
    const toast = db.sources.find((s) => s.source === 'Toast' && s.locationId === loc)
    const runNumber = db.runs.filter((r) => r.locationId === loc && r.date === d).length + 1
    const createdAt = `${TODAY}T14:${String(runNumber).padStart(2, '0')}:00`
    const run = makeForecastRun(db.locations.find((l) => l.id === loc)!, d, {
      runNumber, createdAt, dataCutoff: toast?.lastSuccessAt ?? NOW_ISO,
    })
    if (toast?.lastResult === 'failed') run.limitations.push('Latest Toast update failed; uses sales data up to the last successful update.')
    setDb((prev) => ({ ...prev, runs: [...prev.runs, run] }))
    return { ok: true, message: `Forecast run ${runNumber} saved. Earlier runs are kept for comparison.` }
  }

  // --- UC-7 ---------------------------------------------------------------
  const generateRecommendation = (loc: string, d: string): Result => {
    if (!allowed('schedule.edit', loc)) return denied
    const run = latestRun(db.runs, loc, d)
    if (!run) return { ok: false, error: 'Generate a forecast for this date first.' }
    const target = db.targets.find((t) => t.locationId === loc)!
    const { required, conflicts } = requiredStaff(run.predicted, target.value, d)
    const existing = recFor(loc, d)
    // Manual and approved-override shifts are kept; only recommended shifts are rebuilt.
    const keep = existing?.shifts.filter((s) => s.source !== 'recommended') ?? []
    const rec: ScheduleRecommendation = {
      id: existing?.id ?? `rec-${loc}-${d}`, forecastRunId: run.id, locationId: loc, date: d,
      version: (existing?.version ?? 0) + 1, targetSPLH: target.value, required, conflicts,
      shifts: assignEmployees(buildShifts(required, keep), crewAt(loc), busyElsewhere(loc, d)), status: 'draft', updatedAt: NOW_ISO,
    }
    setDb((prev) => ({ ...prev, recommendations: existing ? prev.recommendations.map((r) => (r.id === rec.id ? rec : r)) : [...prev.recommendations, rec] }))
    return { ok: true, message: `Schedule v${rec.version} generated from the latest forecast and staffed automatically.${keep.length ? ` ${keep.length} manual shifts kept.` : ''}` }
  }

  const acceptRecommendation = (loc: string, d: string): Result => {
    const rec = recFor(loc, d)
    if (!rec || !allowed('schedule.accept', loc)) return denied
    updateRec({ ...rec, status: 'accepted', updatedAt: NOW_ISO })
    return { ok: true, message: `Schedule published to the team.` }
  }

  // --- UC-14 / UC-9 -------------------------------------------------------
  const saveAdjustment = (loc: string, d: string, shifts: RecShift[], reason: AdjustmentReason, notes: string): Result => {
    const rec = recFor(loc, d)
    if (!rec || !allowed('schedule.edit', loc)) return denied
    if (!notes.trim()) return { ok: false, error: 'Add a short explanation for the change.' }
    const invalid = validateSchedule(shifts, crewAt(loc))
    if (invalid) return { ok: false, error: invalid }
    const summary = changeSummary(rec.shifts, shifts, nameOf)
    if (!summary.length) return { ok: false, error: 'No changes to save.' }
    const hoursBefore = totalHours(rec.shifts)
    const hoursAfter = totalHours(shifts)
    const needsApproval = hoursAfter - hoursBefore > RULES.adjustmentApproval.immediateIfAddedHoursAtMost
    const base = { id: newId('adj'), recommendationId: rec.id, locationId: loc, date: d, authorId: user!.id, createdAt: NOW_ISO, reason, notes: notes.trim(), changeSummary: summary, hoursBefore, hoursAfter }

    if (!needsApproval) {
      updateRec({ ...rec, shifts, version: rec.version + 1, updatedAt: NOW_ISO })
      setDb((prev) => ({ ...prev, adjustments: [{ ...base, outcome: 'applied' }, ...prev.adjustments] }))
      return { ok: true, message: `Change applied as v${rec.version + 1}.` }
    }
    const overrideId = newId('ovr')
    setDb((prev) => ({
      ...prev,
      overrides: [{ id: overrideId, recommendationId: rec.id, baseVersion: rec.version, locationId: loc, date: d, requesterId: user!.id, submittedAt: NOW_ISO, reason, notes: notes.trim(), proposedShifts: shifts, changeSummary: summary, status: 'pending' }, ...prev.overrides],
      adjustments: [{ ...base, outcome: 'sent for approval', overrideId }, ...prev.adjustments],
    }))
    return { ok: true, message: `Adds ${hoursAfter - hoursBefore}h, which needs District Manager approval. Sent as an override request.` }
  }

  // --- UC-10 --------------------------------------------------------------
  const reviewOverride = (id: string, decision: 'approved' | 'rejected', note: string): Result => {
    const req = db.overrides.find((o) => o.id === id)
    if (!req || !allowed('override.review', req.locationId)) return denied
    if (req.status !== 'pending') return { ok: false, error: 'This request was already decided. Refresh to see the decision.' }
    const rec = db.recommendations.find((r) => r.id === req.recommendationId)!
    if (decision === 'approved' && rec.version !== req.baseVersion) {
      return { ok: false, error: `The schedule changed after this request (v${req.baseVersion} → v${rec.version}). It can only be rejected so the requester can resubmit against the current version.` }
    }
    setDb((prev) => ({ ...prev, overrides: prev.overrides.map((o) => (o.id === id ? { ...o, status: decision, reviewerId: user!.id, decidedAt: NOW_ISO, decisionNote: note.trim() } : o)) }))
    if (decision === 'approved') {
      const shifts = req.proposedShifts.map((s) => (s.source === 'manual' ? { ...s, source: 'override' as const } : s))
      updateRec({ ...rec, shifts, version: rec.version + 1, updatedAt: NOW_ISO })
    }
    return { ok: true, message: decision === 'approved' ? `Approved and applied as v${rec.version + 1}.` : 'Rejected. The requester can see your note.' }
  }

  // --- UC-3 / UC-4 / UC-13 ------------------------------------------------
  const requestToastUpdate = (loc: string): Result => {
    if (!allowed('data.manage', loc)) return denied
    // Mock: Lake Orion's Toast access is still not granted.
    const failed = loc === 'pw-115'
    setDb((prev) => ({
      ...prev,
      sources: prev.sources.map((s) =>
        s.source === 'Toast' && s.locationId === loc
          ? failed
            ? { ...s, lastAttemptAt: NOW_ISO, lastResult: 'failed', message: 'Toast returned an error for this store. Showing data from the last successful update.' }
            : { ...s, lastAttemptAt: NOW_ISO, lastSuccessAt: NOW_ISO, lastResult: 'ok', message: 'Up to date: no new closed hours since the last update.' }
          : s),
    }))
    return failed ? { ok: false, error: 'Toast update failed for this store. The last successful data is kept.' } : { ok: true, message: 'Toast update succeeded; no new closed hours.' }
  }

  const importSalesCsv = (loc: string, text: string): Result & { result?: ImportResult } => {
    if (!allowed('data.manage', loc)) return denied
    const result = parseSalesCsv(text, loc, db.sales)
    if (!result.accepted.length && !result.rejected.length) return { ok: false, error: 'The file has no data rows.' }
    const dates = [...new Set(result.accepted.map((s) => s.date))].sort()
    setDb((prev) => ({
      ...prev,
      sales: [...prev.sales, ...result.accepted],
      imports: [{ id: newId('imp'), source: 'Sales CSV', locationId: loc, period: dates.length ? `${dates[0]} – ${dates[dates.length - 1]}` : '—', receivedAt: NOW_ISO, accepted: result.accepted.length, rejected: result.rejected.length, issues: result.rejected.slice(0, 5).map((r) => `Line ${r.line}: ${r.reason}`) }, ...prev.imports],
    }))
    const rows = (n: number) => `${n} row${n === 1 ? '' : 's'}`
    return { ok: true, message: `${rows(result.accepted.length)} imported, ${rows(result.rejected.length)} rejected.`, result }
  }

  const resolveDiscrepancy = (id: string, status: Discrepancy['status']): Result => {
    const d = db.discrepancies.find((x) => x.id === id)
    if (!d || !allowed('data.manage', d.locationId)) return denied
    setDb((prev) => ({ ...prev, discrepancies: prev.discrepancies.map((x) => (x.id === id ? { ...x, status, resolvedBy: user!.id, resolvedAt: NOW_ISO } : x)) }))
    return { ok: true }
  }

  // --- UC-2 ---------------------------------------------------------------
  const createUser = (input: { name: string; signInReference: string; password: string; role: Role; locationIds: string[] }): Result => {
    if (!allowed('users.manage')) return denied
    const errors: string[] = []
    if (!input.name.trim()) errors.push('Name is required.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.signInReference)) errors.push('Sign-in reference must be an email address.')
    if (db.users.some((u) => u.signInReference.toLowerCase() === input.signInReference.toLowerCase())) errors.push('An account with this sign-in reference already exists.')
    if (input.password.length < 8) errors.push('Initial password must be at least 8 characters.')
    if (!input.locationIds.length) errors.push('Assign at least one location.')
    if (errors.length) return { ok: false, error: errors.join(' ') }
    const id = newId('u')
    setDb((prev) => ({
      ...prev,
      users: [...prev.users, { id, name: input.name.trim(), signInReference: input.signInReference.trim(), role: input.role, active: true }],
      credentials: { ...prev.credentials, [id]: input.password },
      access: [...prev.access, ...input.locationIds.map((locationId) => ({ userId: id, locationId }))],
    }))
    return { ok: true, message: `Account created for ${input.name.trim()}.` }
  }

  return {
    db, user, myLocations, allowed, canOpen,
    page, setPage, location, locationId, setLocationId, date, setDate,
    signIn, signOut,
    recFor, crewAt, nameOf, generateForecast, generateRecommendation, acceptRecommendation, saveAdjustment, reviewOverride,
    requestToastUpdate, importSalesCsv, resolveDiscrepancy, createUser,
  }
}

export type AppStore = ReturnType<typeof useAppStore>
const AppContext = createContext<AppStore | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  return <AppContext.Provider value={useAppStore()}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
