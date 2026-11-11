// Role and location permissions (SRS 2.1, 5.3). The store calls `can()` inside every action,
// not only to hide buttons. A backend must enforce the same rules (PB-18).
import type { Role, UserAccount, UserLocationAccess } from './types'

export type Action =
  | 'forecast.view' | 'forecast.generate'
  | 'schedule.view' | 'schedule.edit' | 'schedule.accept'
  | 'override.request' | 'override.review'
  | 'splh.view' | 'alerts.view'
  | 'data.manage' | 'users.manage'

// What each account role can do. Checked inside every store action, not only in the UI.
const MATRIX: Record<Role, Action[]> = {
  admin: ['users.manage', 'data.manage'],
  district_manager: ['forecast.view', 'forecast.generate', 'schedule.view', 'override.review', 'splh.view', 'alerts.view'],
  store_manager: ['forecast.view', 'forecast.generate', 'schedule.view', 'schedule.edit', 'schedule.accept', 'override.request', 'splh.view', 'alerts.view'],
  // Crew see their store's named schedule (read-only); Shift Leads also see hour alerts.
  shift_lead: ['schedule.view', 'alerts.view'],
  crew_member: ['schedule.view'],
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  district_manager: 'District Manager',
  store_manager: 'Store Manager',
  shift_lead: 'Shift Lead',
  crew_member: 'Crew Member',
}

export const ROLES = Object.keys(ROLE_LABEL) as Role[]

export const locationsFor = (user: UserAccount, access: UserLocationAccess[]) =>
  access.filter((a) => a.userId === user.id).map((a) => a.locationId)

export function can(user: UserAccount | null, action: Action, access: UserLocationAccess[], locationId?: string) {
  if (!user?.active) return false
  if (!MATRIX[user.role].includes(action)) return false
  return !locationId || locationsFor(user, access).includes(locationId)
}
