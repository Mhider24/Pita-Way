// UC-3 Import historical data: provisional CSV format until sample files are agreed (Q7).
//   interval_start,sales_amount,order_count
//   2026-10-30 12:00,912.50,68
import { HOURS, NOW_ISO, OPEN_HOUR } from './calendar'
import type { SalesInterval } from './types'

export const SALES_CSV_HEADER = 'interval_start,sales_amount,order_count'

export interface ImportResult {
  accepted: SalesInterval[]
  rejected: { line: number; raw: string; reason: string }[]
}

export function parseSalesCsv(text: string, locationId: string, existing: SalesInterval[]): ImportResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const result: ImportResult = { accepted: [], rejected: [] }
  if (!lines.length) return result
  const start = lines[0].toLowerCase().replace(/\s/g, '') === SALES_CSV_HEADER ? 1 : 0
  const seen = new Set(existing.filter((s) => s.locationId === locationId).map((s) => `${s.date}|${s.slot}`))

  lines.slice(start).forEach((raw, i) => {
    const line = i + start + 1
    const reject = (reason: string) => result.rejected.push({ line, raw, reason })
    const [when, amountText, ordersText, ...extra] = raw.split(',').map((c) => c.trim())
    if (extra.length) return reject('Too many columns')
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):00$/.exec(when ?? '')
    if (!m) return reject('interval_start must look like 2026-10-30 12:00')
    const [, date, hh] = m
    if (Number.isNaN(new Date(`${date}T12:00:00`).getTime())) return reject('Invalid date')
    const slot = Number(hh) - OPEN_HOUR
    if (slot < 0 || slot >= HOURS.length) return reject('Outside the staffed day (9 AM–10 PM)')
    if (`${date}T${hh}:00:00` >= NOW_ISO) return reject('Interval has not closed yet')
    const amount = Number(amountText)
    if (amountText === undefined || amountText === '' || Number.isNaN(amount) || amount < 0) return reject('sales_amount must be a number ≥ 0')
    const orders = Number(ordersText)
    if (ordersText === undefined || ordersText === '' || !Number.isInteger(orders) || orders < 0) return reject('order_count must be a whole number ≥ 0')
    const key = `${date}|${slot}`
    if (seen.has(key)) return reject('Duplicate: this interval already exists')
    seen.add(key)
    result.accepted.push({ id: `si-imp-${locationId}-${date}-${slot}`, sourceRecordId: `CSV-${line}`, locationId, date, slot, amount: Math.round(amount * 100) / 100, orders, source: 'import' })
  })
  return result
}
