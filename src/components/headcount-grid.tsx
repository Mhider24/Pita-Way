import { MinusIcon, PlusIcon } from 'lucide-react'
import { HOURS } from '@/data/calendar'
import { STATIONS } from '@/data/staffing'
import type { Headcount, Station } from '@/data/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  scheduled: Headcount
  required: Headcount
  onAdd?: (role: Station, hour: number) => void
  onRemove?: (role: Station, hour: number) => void
}

/** Role × hour matrix of staff on shift vs required. Short cells are red, overstaffed cells muted. */
export function HeadcountGrid({ scheduled, required, onAdd, onRemove }: Props) {
  const total = (h: Headcount, i: number) => STATIONS.reduce((n, r) => n + h[r][i], 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="w-24" />
            {HOURS.map((h) => <th key={h} className="min-w-14 font-normal">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {STATIONS.map((role) => (
            <tr key={role}>
              <th className="pr-2 text-left font-medium whitespace-nowrap">{role}</th>
              {HOURS.map((hour, i) => {
                const have = scheduled[role][i]
                const need = required[role][i]
                return (
                  <td
                    key={hour}
                    title={`${role} at ${hour}: ${have} scheduled, ${need} required`}
                    className={cn(
                      'group relative h-12 rounded-md text-center ring-1 ring-border',
                      have < need && 'bg-destructive/10 text-destructive ring-destructive/30',
                      have > need && 'bg-muted text-muted-foreground'
                    )}
                  >
                    <span className="font-medium">{have}</span>
                    <span className="text-xs opacity-70">/{need}</span>
                    {onAdd && onRemove && (
                      <div className="absolute inset-0 hidden items-center justify-center gap-0.5 rounded-md bg-background/90 group-hover:flex group-focus-within:flex">
                        <Button size="icon-xs" variant="outline" aria-label={`Remove ${role} at ${hour}`} onClick={() => onRemove(role, i)}>
                          <MinusIcon />
                        </Button>
                        <Button size="icon-xs" variant="outline" aria-label={`Add ${role} at ${hour}`} onClick={() => onAdd(role, i)}>
                          <PlusIcon />
                        </Button>
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
          <tr className="text-xs text-muted-foreground">
            <th className="pr-2 text-left font-medium">Net</th>
            {HOURS.map((hour, i) => {
              const gap = total(scheduled, i) - total(required, i)
              return (
                <td key={hour} className={cn('pt-1 text-center', gap < 0 && 'font-medium text-destructive')}>
                  {gap === 0 ? '–' : gap > 0 ? `+${gap}` : gap}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
