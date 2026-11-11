// Mock clock: the app runs as if it is Friday Oct 30 2026, 2:00 PM store time.

/**
 * Hourly slots of the staffed day (9 AM–10 PM); each label is the hour the slot starts.
 * Stores open later (see OPERATING_HOURS): the early slot is opening prep, the last covers close-down.
 */
export const HOURS = ['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM', '8 PM', '9 PM']
export const OPEN_HOUR = 9

/** Store hours by weekday (0 = Sunday), as decimal hours. */
export const OPERATING_HOURS: Record<number, { open: number; close: number }> = {
  0: { open: 11, close: 20 },
  1: { open: 10.5, close: 21.5 },
  2: { open: 10.5, close: 21.5 },
  3: { open: 10.5, close: 21.5 },
  4: { open: 10.5, close: 21.5 },
  5: { open: 10.5, close: 21.5 },
  6: { open: 10.5, close: 21.5 },
}

/** Staff arrive this long before opening and stay this long after closing. */
export const PREP_HOURS = 1
export const CLOSE_DOWN_HOURS = 0.5

/** Planning range: last week, this week and next week. */
export const DATES = Array.from({ length: 21 }, (_, i) => {
  const d = new Date('2026-10-19T12:00:00')
  d.setDate(d.getDate() + i)
  return d.toISOString().slice(0, 10)
})
export const TODAY = '2026-10-30'
/** Slots before this index have closed today (2 PM). */
export const NOW_SLOT = 5
export const NOW_ISO = `${TODAY}T14:00:00`

export const slotLabel = (slot: number) => (slot >= HOURS.length ? '10 PM' : HOURS[slot])

/** Decimal hour (14.5) → "2:30 PM". */
export function clock(hour: number) {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  const suffix = h >= 12 && h < 24 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${suffix}`
}

export const weekday = (date: string) => new Date(`${date}T12:00:00`).getDay()
export const hoursFor = (date: string) => OPERATING_HOURS[weekday(date)]
export const hoursLabel = (date: string) => {
  const { open, close } = hoursFor(date)
  return `${clock(open)} – ${clock(close)}`
}

/** Share of a slot (0–1) during which the store is open to customers. */
export function openShare(date: string, slot: number) {
  const { open, close } = hoursFor(date)
  const s0 = OPEN_HOUR + slot
  return Math.max(0, Math.min(s0 + 1, close) - Math.max(s0, open))
}

/** Slot range staff can work on a date: prep before opening through close-down. */
export function staffedSlots(date: string) {
  const { open, close } = hoursFor(date)
  return { first: Math.max(0, Math.floor(open - PREP_HOURS) - OPEN_HOUR), end: Math.min(HOURS.length, Math.ceil(close + CLOSE_DOWN_HOURS) - OPEN_HOUR) }
}

export const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
  (date === TODAY ? ' (today)' : '')

export const isPast = (date: string) => date < TODAY
export const isFuture = (date: string) => date > TODAY
/** Number of closed slots on a date. */
export const closedSlots = (date: string) => (isPast(date) ? HOURS.length : date === TODAY ? NOW_SLOT : 0)

export const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
