import { HOURS, OPEN_HOUR, hoursFor, hoursLabel, slotLabel } from '@/data/calendar'
import { STATIONS } from '@/data/staffing'
import type { RecShift } from '@/data/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Props {
  shifts: RecShift[]
  /** Date whose store hours are shaded (closed time is greyed). */
  date: string
  nameOf: (id: string | null) => string
  /** Employee to highlight (the signed-in crew member). */
  highlight?: string
  /** When set, rows are clickable (edit mode). */
  onSelect?: (shift: RecShift) => void
  /** Show recommended/manual/override tags (managers only). */
  showSource?: boolean
}

const STATION_BAR: Record<string, string> = {
  'Shift Lead': 'bg-chart-1/85 text-primary-foreground',
  'Line Cook': 'bg-chart-2/85 text-primary-foreground',
  // Amber is light in both themes, so its label stays dark.
  'Prep Cook': 'bg-chart-3/90 text-neutral-900',
}

/** Day view of who works when: one row per shift, grouped by role, bars across opening hours. */
export function ShiftTimeline({ shifts, date, nameOf, highlight, onSelect, showSource }: Props) {
  const pct = (slot: number) => `${(slot / HOURS.length) * 100}%`
  const { open, close } = hoursFor(date)
  const openAt = open - OPEN_HOUR
  const closeAt = close - OPEN_HOUR
  // Closed time (before opening, after closing) shaded behind the bars.
  const closedShade = (
    <>
      <div className="absolute inset-y-0 left-0 rounded-l-md bg-muted" style={{ width: pct(openAt) }} />
      <div className="absolute inset-y-0 right-0 rounded-r-md bg-muted" style={{ left: pct(closeAt) }} />
    </>
  )

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[44rem]">
        <div className="grid grid-cols-[11rem_1fr] border-b pb-1 text-xs text-muted-foreground">
          <span className="self-end">Open {hoursLabel(date)}</span>
          <div>
            <div className="relative mb-1 h-1.5 rounded-full bg-muted">
              <div className="absolute inset-y-0 rounded-full bg-primary/60" style={{ left: pct(openAt), width: pct(closeAt - openAt) }} />
            </div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${HOURS.length}, 1fr)` }}>
              {HOURS.map((h) => <span key={h}>{h}</span>)}
            </div>
          </div>
        </div>
        {STATIONS.map((station) => {
          const rows = shifts.filter((s) => s.station === station).sort((a, b) => a.start - b.start || a.end - b.end)
          if (!rows.length) return null
          return (
            <div key={station} className="border-b py-2 last:border-0">
              <div className="mb-1 text-xs font-medium tracking-wide uppercase opacity-60">{station}</div>
              {rows.map((s) => {
                const mine = !!highlight && s.employeeId === highlight
                return (
                  <div
                    key={s.id}
                    onClick={onSelect && (() => onSelect(s))}
                    className={cn('grid grid-cols-[11rem_1fr] items-center rounded-md py-0.5', onSelect && 'cursor-pointer hover:bg-muted', mine && 'bg-accent')}
                  >
                    <div className="flex min-w-0 items-center gap-1.5 pr-2 text-sm">
                      <span className={cn('truncate', s.employeeId ? 'font-medium' : 'italic opacity-60', mine && 'text-accent-foreground')}>
                        {s.employeeId ? nameOf(s.employeeId) : 'Open shift'}
                      </span>
                      {mine && <Badge>You</Badge>}
                      {showSource && s.source !== 'recommended' && <Badge variant="outline">{s.source}</Badge>}
                    </div>
                    <div className="relative h-7">
                      {closedShade}
                      <div
                        className={cn('absolute inset-y-0.5 flex items-center rounded-md px-2 text-xs whitespace-nowrap', STATION_BAR[station], !s.employeeId && 'opacity-50')}
                        style={{ left: pct(s.start), width: pct(s.end - s.start) }}
                      >
                        {slotLabel(s.start)}–{slotLabel(s.end)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
