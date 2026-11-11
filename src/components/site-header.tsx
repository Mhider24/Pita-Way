import { useApp, type Page } from '@/state'
import { DATES, dayLabel } from '@/data/calendar'
import { pageTitle } from '@/components/app-sidebar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

/** Pages that don't depend on the selected location and date. */
const UNSCOPED: Page[] = ['users']
const DAY_ITEMS = DATES.map((d) => ({ label: dayLabel(d), value: d }))

export function SiteHeader() {
  const { page, myLocations, locationId, setLocationId, date, setDate } = useApp()
  const locations = myLocations.map((l) => ({ label: `${l.name} #${l.storeNumber}`, value: l.id }))

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b">
      <div className="flex w-full flex-wrap items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto" />
        <h1 className="text-base font-medium">{pageTitle(page)}</h1>
        {!UNSCOPED.includes(page) && (
          <div className="ml-auto flex gap-2">
            <Select items={locations} value={locationId} onValueChange={(v) => v && setLocationId(v)} disabled={locations.length < 2}>
              <SelectTrigger size="sm" className="w-44" aria-label="Location"><SelectValue /></SelectTrigger>
              <SelectContent align="end">
                {locations.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select items={DAY_ITEMS} value={date} onValueChange={(v) => v && setDate(v)}>
              <SelectTrigger size="sm" className="w-40" aria-label="Date"><SelectValue /></SelectTrigger>
              <SelectContent align="end">
                {DAY_ITEMS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </header>
  )
}
