import { ArrowRightIcon } from 'lucide-react'
import { useApp, type Page } from '@/state'
import { activeAlerts, hourAlerts } from '@/data/alerts'
import { dayLabel, stamp } from '@/data/calendar'
import { actualsFor, latestRun, salesRows, weatherLabel } from '@/data/forecast'
import { ratio, scheduledVsActual } from '@/data/labor'
import { totalHours } from '@/data/staffing'
import type { Location } from '@/data/types'
import { SalesChart } from '@/components/charts'
import { MetricCard, MetricGrid } from '@/components/metric-card'
import { PageTitle } from '@/components/page-title'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn, money, signed } from '@/lib/utils'

/** Planning summary for the selected location and date, plus all assigned locations. */
export function DashboardView() {
  const { db, location, date, recFor, myLocations, setLocationId, setPage, allowed, user } = useApp()

  const snapshot = (loc: Location) => {
    const run = latestRun(db.runs, loc.id, date)
    const rec = recFor(loc.id, date)
    const actual = actualsFor(db.sales, loc.id, date)
    const closed = actual.filter((v) => v !== null).length
    const forecastTotal = run?.predicted.reduce((a, b) => a + b, 0) ?? 0
    const actualTotal = actual.reduce<number>((n, v) => n + (v ?? 0), 0)
    const forecastToDate = run?.predicted.slice(0, closed).reduce((a, b) => a + b, 0) ?? 0
    const hours = rec ? totalHours(rec.shifts) : 0
    const labor = scheduledVsActual(db.labor.filter((r) => r.locationId === loc.id && r.date === date), closed)
    const orders = run?.predictedOrders.reduce((a, b) => a + b, 0) ?? 0
    return { run, rec, closed, forecastTotal, orders, actualTotal, forecastToDate, hours, labor, projectedSplh: ratio(forecastTotal, hours) }
  }

  const s = snapshot(location)
  const sources = db.sources.filter((x) => x.locationId === location.id)
  const pendingOverrides = db.overrides.filter((o) => o.status === 'pending' && myLocations.some((l) => l.id === o.locationId) && (allowed('override.review') || o.requesterId === user!.id))
  const alerts = activeAlerts(hourAlerts(db.employees, db.labor, date, [location.id]))
  const variance = s.forecastToDate ? ((s.actualTotal - s.forecastToDate) / s.forecastToDate) * 100 : 0

  const attention: { text: string; page: Page }[] = [
    ...(s.rec?.conflicts.length ? [{ text: 'Staffing note on this schedule', page: 'schedule' as Page }] : []),
    ...(!s.rec ? [{ text: 'No schedule for this date', page: 'schedule' as Page }] : []),
    ...(pendingOverrides.length ? [{ text: `${pendingOverrides.length} override request${pendingOverrides.length > 1 ? 's' : ''} pending`, page: 'overrides' as Page }] : []),
    ...(alerts.length ? [{ text: `${alerts.length} employee hour alert${alerts.length > 1 ? 's' : ''}`, page: 'alerts' as Page }] : []),
    ...sources.filter((x) => x.lastResult === 'failed').map((x) => ({ text: `${x.source} update failed: data may be stale`, page: 'dashboard' as Page })),
  ]

  return (
    <>
      <PageTitle
        title={`${location.name} #${location.storeNumber}`}
        description={`${dayLabel(date)} · ${weatherLabel(location, date)} · ${location.type} · ${location.district}`}
      />

      <div className="flex flex-wrap gap-2">
        {sources.map((x) => (
          <Badge key={x.source} variant={x.lastResult === 'failed' ? 'destructive' : 'outline'} title={x.message}>
            {x.source}: {x.lastSuccessAt ? `updated ${stamp(x.lastSuccessAt)}` : 'not connected'}
            {x.lastResult === 'failed' && ' · last attempt failed'}
          </Badge>
        ))}
      </div>

      <MetricGrid>
        <MetricCard
          label="Forecast sales"
          value={s.run ? money(s.forecastTotal) : '—'}
          footer={s.run ? `${s.orders.toLocaleString()} orders · run created ${stamp(s.run.createdAt)}` : 'No forecast for this date'}
        />
        <MetricCard
          label="Actual sales to date"
          value={s.closed ? money(s.actualTotal) : '—'}
          delta={s.closed && s.run ? `${signed(variance)}%` : undefined}
          good={variance >= 0}
          footer={s.closed ? `vs ${money(s.forecastToDate)} forecast for the same ${s.closed} hours` : 'No actual sales yet'}
        />
        <MetricCard
          label="Actual vs scheduled hours"
          value={s.closed ? `${s.labor.actualTotal.toFixed(1)}h` : '—'}
          delta={s.closed ? `${signed(s.labor.actualTotal - s.labor.scheduledTotal)}h` : undefined}
          good={s.labor.actualTotal <= s.labor.scheduledTotal}
          footer={s.closed ? `Toast actual vs ${s.labor.scheduledTotal.toFixed(1)}h scheduled in 7shifts, same hours` : 'No actual hours yet'}
        />
        <MetricCard
          label="Projected SPLH"
          value={s.projectedSplh ? money(s.projectedSplh) : '—'}
          delta={s.projectedSplh && s.rec ? `${money(s.rec.targetSPLH)} target` : undefined}
          good={!!s.projectedSplh && !!s.rec && s.projectedSplh >= s.rec.targetSPLH}
          footer={s.rec ? `Forecast ÷ ${s.hours}h scheduled (${s.rec.status === 'accepted' ? 'published' : 'draft'})` : 'No schedule yet'}
        />
      </MetricGrid>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Sales vs forecast</CardTitle>
            <CardDescription>Hourly; bars appear as hours close</CardDescription>
          </CardHeader>
          <CardContent><SalesChart data={salesRows(s.run?.predicted, actualsFor(db.sales, location.id, date))} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>{attention.length ? `${attention.length} item${attention.length > 1 ? 's' : ''}` : 'Nothing right now'}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {attention.map((a) => (
              <Button key={a.text} variant="outline" className="h-auto justify-between py-2 text-left whitespace-normal" onClick={() => setPage(a.page)}>
                {a.text}
                <ArrowRightIcon />
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {myLocations.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Your locations</CardTitle>
            <CardDescription>{dayLabel(date)}. Select a row to switch location.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Forecast</TableHead>
                  <TableHead className="text-right">Actual to date</TableHead>
                  <TableHead className="text-right">Actual / scheduled hours</TableHead>
                  <TableHead className="text-right">Scheduled hours</TableHead>
                  <TableHead className="text-right">Projected SPLH</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead className="text-right">Pending requests</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="tabular-nums">
                {myLocations.map((loc) => {
                  const x = snapshot(loc)
                  return (
                    <TableRow key={loc.id} data-state={loc.id === location.id ? 'selected' : undefined} className="cursor-pointer" onClick={() => setLocationId(loc.id)}>
                      <TableCell className="font-medium">{loc.name} <span className="font-normal opacity-60">#{loc.storeNumber}</span></TableCell>
                      <TableCell className="text-right">{x.run ? money(x.forecastTotal) : '—'}</TableCell>
                      <TableCell className="text-right">{x.closed ? money(x.actualTotal) : '—'}</TableCell>
                      <TableCell className="text-right">{x.closed ? `${x.labor.actualTotal.toFixed(1)} / ${x.labor.scheduledTotal.toFixed(1)}h` : '—'}</TableCell>
                      <TableCell className="text-right">{x.rec ? `${x.hours}h` : '—'}</TableCell>
                      <TableCell className={cn('text-right', x.projectedSplh && x.rec && x.projectedSplh < x.rec.targetSPLH && 'text-destructive')}>
                        {x.projectedSplh ? money(x.projectedSplh) : '—'}
                      </TableCell>
                      <TableCell>{x.rec ? <Badge variant={x.rec.status === 'accepted' ? 'secondary' : 'outline'}>{x.rec.status === 'accepted' ? 'Published' : 'Draft'}</Badge> : '—'}</TableCell>
                      <TableCell className="text-right">{db.overrides.filter((o) => o.locationId === loc.id && o.status === 'pending').length}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  )
}
