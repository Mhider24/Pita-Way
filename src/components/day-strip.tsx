import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useApp } from '@/state'
import { weekOf } from '@/data/alerts'
import { DATES, TODAY, hoursLabel } from '@/data/calendar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Week of day buttons with store hours; arrows move a week back or forward within the planning range. */
export function DayStrip({ marks }: { marks?: Set<string> }) {
  const { date, setDate } = useApp()
  const monday = weekOf(date)
  const week = Array.from({ length: 7 }, (_, i) => shift(monday, i))
  const prev = shift(monday, -7)
  const next = shift(monday, 7)
  const inRange = (d: string) => DATES.includes(d)
  const label = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="flex items-stretch gap-2">
      <Button variant="outline" size="icon" className="h-auto" aria-label="Previous week" disabled={!inRange(prev)} onClick={() => setDate(DATES.includes(shift(date, -7)) ? shift(date, -7) : prev)}>
        <ChevronLeftIcon />
      </Button>
      <div className="grid flex-1 grid-cols-7 gap-1.5 overflow-x-auto">
        {week.map((d) => {
          const selected = d === date
          return (
            <button
              key={d}
              disabled={!inRange(d)}
              onClick={() => setDate(d)}
              className={cn(
                'min-w-20 rounded-lg border px-2 py-1.5 text-left text-xs transition-colors disabled:opacity-40',
                selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
              )}
            >
              <div className="flex items-center justify-between gap-1 text-sm font-medium">
                <span>{new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })} {new Date(`${d}T12:00:00`).getDate()}</span>
                {d === TODAY && <span className={cn('size-1.5 rounded-full', selected ? 'bg-primary-foreground' : 'bg-primary')} title="Today" />}
                {marks?.has(d) && !selected && <span className="size-1.5 rounded-full bg-chart-2" title="You work this day" />}
              </div>
              <div className={cn('truncate', selected ? 'opacity-90' : 'opacity-70')}>{hoursLabel(d)}</div>
            </button>
          )
        })}
      </div>
      <Button variant="outline" size="icon" className="h-auto" aria-label="Next week" disabled={!inRange(next)} onClick={() => setDate(DATES.includes(shift(date, 7)) ? shift(date, 7) : next)}>
        <ChevronRightIcon />
      </Button>
      <span className="sr-only">Week of {label(monday)}</span>
    </div>
  )
}
