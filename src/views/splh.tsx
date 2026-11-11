import { useState } from 'react'
import { TriangleAlertIcon } from 'lucide-react'
import { useApp } from '@/state'
import { clock, dayLabel } from '@/data/calendar'
import { actualsFor, latestRun } from '@/data/forecast'
import { BASIS_LABEL, scheduledVsActual, splhReport, type SplhBasis } from '@/data/labor'
import { MetricCard, MetricGrid } from '@/components/metric-card'
import { PageTitle } from '@/components/page-title'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { money, signed } from '@/lib/utils'

const fmtHours = (h: number) => `${Math.round(h * 100) / 100}h`

/** UC-8 View SPLH, including UC-12 Calculate labor hours. */
export function SplhView() {
  const { db, location, date, recFor } = useApp()
  const [basis, setBasis] = useState<SplhBasis>('actual')

  const rec = recFor(location.id, date)
  const run = latestRun(db.runs, location.id, date)
  const labor = db.labor.filter((r) => r.locationId === location.id && r.date === date)
  const report = splhReport({ basis, date, actual: actualsFor(db.sales, location.id, date), predicted: run?.predicted, labor, shifts: rec?.shifts })
  // Scheduled (7shifts) vs actual (Toast) hours over the same closed hours as the report.
  const sva = basis === 'projected' ? null : scheduledVsActual(labor, report.rows.length)
  const target = db.targets.find((t) => t.locationId === location.id)!.value
  const label = BASIS_LABEL[basis]
  const name = (id: string) => db.employees.find((e) => e.id === id)?.name ?? id

  return (
    <>
      <PageTitle title="Sales per labor hour" description={`${location.name} · ${dayLabel(date)}`} />

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={basis} onValueChange={(v) => setBasis(v as SplhBasis)}>
          <TabsList>
            <TabsTrigger value="actual">Actual</TabsTrigger>
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
            <TabsTrigger value="projected">Projected</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {!report.available && report.rows.length === 0 ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>SPLH unavailable</AlertTitle>
          <AlertDescription>{report.reason}</AlertDescription>
        </Alert>
      ) : (
        <>
          <MetricGrid>
            <MetricCard label="SPLH" value={report.value === null ? 'Unavailable' : money(report.value)} delta={report.value === null ? undefined : `${money(target)} target`} good={(report.value ?? 0) >= target} footer={report.value === null ? report.reason : `${label.sales} ÷ ${label.hours.toLowerCase()}`} />
            <MetricCard label={label.sales} value={money(report.sales)} footer={report.period} />
            <MetricCard label={label.hours} value={fmtHours(report.hours)} footer={basis === 'projected' ? 'Shifts in the schedule' : 'Net of unpaid breaks'} />
            {sva ? (
              <MetricCard
                label="Actual vs scheduled hours"
                value={`${fmtHours(sva.actualTotal)} / ${fmtHours(sva.scheduledTotal)}`}
                delta={`${signed(sva.actualTotal - sva.scheduledTotal)}h`}
                good={sva.actualTotal <= sva.scheduledTotal}
                footer={`Toast time clock vs 7shifts · ${report.issues.length} record${report.issues.length === 1 ? '' : 's'} need review`}
              />
            ) : (
              <MetricCard label="Incomplete labor records" value={report.issues.length} footer="Projected basis uses scheduled hours" />
            )}
          </MetricGrid>

          {report.issues.length > 0 && (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>Labor records needing review</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {report.issues.map(({ record: r, issue }) => (
                    <li key={r.id + issue}>{name(r.employeeId)} ({r.station}, {clock(r.start)}{r.end ? `–${clock(r.end)}` : ''}, {r.sourceRecordId}): {issue}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>By hour</CardTitle>
              <CardDescription>{report.period}. Sales and hours always cover the same intervals.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hour</TableHead>
                    <TableHead className="text-right">{basis === 'projected' ? 'Forecast sales' : 'Sales'}</TableHead>
                    <TableHead className="text-right">Labor hours</TableHead>
                    {sva && <TableHead className="text-right">Scheduled (7shifts)</TableHead>}
                    {sva && <TableHead className="text-right">Actual (Toast)</TableHead>}
                    <TableHead className="text-right">SPLH</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {report.rows.map((r, i) => (
                    <TableRow key={r.hour}>
                      <TableCell className="font-medium">{r.hour}</TableCell>
                      <TableCell className="text-right">{money(r.sales)}</TableCell>
                      <TableCell className="text-right">{fmtHours(r.hours)}</TableCell>
                      {sva && <TableCell className="text-right">{fmtHours(sva.scheduled[i])}</TableCell>}
                      {sva && <TableCell className="text-right">{fmtHours(sva.actual[i])}</TableCell>}
                      <TableCell className="text-right">{r.value === null ? 'Unavailable (0h)' : money(r.value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
