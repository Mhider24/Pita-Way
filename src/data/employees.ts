// UC-13 Floating employees: home store from payroll, stores worked from Toast time-clock punches,
// paid-out store from payroll.
import { laborHours } from './labor'
import type { Employee, LaborRecord, PayrollRecord } from './types'

export interface FloatingEmployee {
  employee: Employee
  homeLocationId: string
  /** Toast actual hours per store worked. */
  workedHours: Record<string, number>
  /** Payroll hours per paying store. */
  paidHours: Record<string, number>
  /** Stores worked whose hours were paid out by a different store. */
  paidElsewhere: string[]
}

export function floatingEmployees(employees: Employee[], payroll: PayrollRecord[], labor: LaborRecord[]): FloatingEmployee[] {
  const out: FloatingEmployee[] = []
  for (const employee of employees) {
    const lines = payroll.filter((p) => p.employeeId === employee.id)
    if (!lines.length) continue
    const home = lines[0].homeLocationId
    const punches = labor.filter((r) => r.employeeId === employee.id && r.basis === 'actual' && r.source === 'Toast time clock')
    const worked = [...new Set(punches.map((r) => r.locationId))]
    if (!worked.some((l) => l !== home)) continue
    const workedHours = Object.fromEntries(worked.map((l) => [l, laborHours(punches.filter((r) => r.locationId === l)).total]))
    const paidHours = Object.fromEntries(lines.map((p) => [p.paidLocationId, p.hours]))
    out.push({ employee, homeLocationId: home, workedHours, paidHours, paidElsewhere: worked.filter((l) => !(l in paidHours)) })
  }
  return out
}
