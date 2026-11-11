import { BellRingIcon } from 'lucide-react'
import { useApp } from '@/state'
import { activeAlerts, detectBreakViolations, hourAlerts, tallyViolations, weekOf } from '@/data/alerts'
import { dayLabel } from '@/data/calendar'
import { RULES } from '@/data/policies'
import { PageTitle } from '@/components/page-title'
import { MetricCard, MetricGrid } from '@/components/metric-card'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const STATUS_VARIANT = { 'over limit': 'destructive', warning: 'outline', 'missing age': 'secondary', 'on track': 'secondary' } as const
const weekLabel = (monday: string) => `Week of ${new Date(`${monday}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
const monthLabel = (ym: string) => new Date(`${ym}-15T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

/** UC-11 employee hour alerts, plus the minor break-violation log (weekly and monthly). */
export function AlertsView() {
  const { db, location, date, myLocations } = useApp()
  const alerts = hourAlerts(db.employees, db.labor, date, [location.id])
  const locName = (id: string) => db.locations.find((l) => l.id === id)?.name ?? id
  const empName = (id: string) => db.employees.find((e) => e.id === id)?.name ?? id

  // Violations at the user's stores: logged history plus the current week from Toast punches.
  const mine = myLocations.map((l) => l.id)
  const violations = [...db.breakViolationHistory, ...detectBreakViolations(db.employees, db.labor)].filter((v) => mine.includes(v.locationId))
  const atStore = violations.filter((v) => v.locationId === location.id)
  const weekly = tallyViolations(atStore, 'week')
  const monthly = tallyViolations(violations, 'month')
  const thisWeek = atStore.filter((v) => weekOf(v.date) === weekOf(date)).sort((a, b) => b.date.localeCompare(a.date))
  const prior = new Date(`${weekOf(date)}T12:00:00`)
  prior.setDate(prior.getDate() - 7)
  const lastWeek = prior.toISOString().slice(0, 10)

  return (
    <>
      <PageTitle title="Hour alerts" description={`${location.name} · ${dayLabel(date)}`} />
      <Tabs defaultValue="hours">
        <TabsList>
          <TabsTrigger value="hours">Under-16 hours ({activeAlerts(alerts).length})</TabsTrigger>
          <TabsTrigger value="breaks">Break violations ({thisWeek.length} this week)</TabsTrigger>
        </TabsList>

        <TabsContent value="hours" className="grid gap-4">
          <MetricGrid>
            <MetricCard label="Under-16 employees working" value={alerts.length} footer={location.name} />
            <MetricCard label="Warnings" value={alerts.filter((a) => a.status === 'warning').length} footer={`Sent ${RULES.minorHours.warningMinutes.map((m) => (m >= 60 ? `${m / 60}h` : `${m} min`)).join(' and ')} before the limit`} />
            <MetricCard label="Over the limit" value={alerts.filter((a) => a.status === 'over limit').length} good={!alerts.some((a) => a.status === 'over limit')} footer={`Daily limit ${RULES.minorHours.limitHours}h`} />
            <MetricCard label="Missing age" value={alerts.filter((a) => a.status === 'missing age').length} footer="Add date of birth to track" />
          </MetricGrid>
          {alerts.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><BellRingIcon /></EmptyMedia>
                <EmptyTitle>No under-16 employees working</EmptyTitle>
                <EmptyDescription>Nobody under {RULES.minorHours.ageUnder} is scheduled at {location.name} on this date.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Under-{RULES.minorHours.ageUnder} hour tracker</CardTitle>
                <CardDescription>Daily limit {RULES.minorHours.limitHours}h, counted across all stores. Scheduled hours from 7shifts, worked hours from Toast.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="min-w-40">Worked today</TableHead>
                      <TableHead className="text-right">Scheduled</TableHead>
                      {RULES.minorHours.warningMinutes.map((m) => <TableHead key={m}>{m >= 60 ? `${m / 60}h` : `${m} min`} warning</TableHead>)}
                      <TableHead>Reaches limit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map((a) => (
                      <TableRow key={a.key}>
                        <TableCell>
                          <div className="font-medium">{a.employee.name}</div>
                          <div className="text-xs opacity-70">{a.employee.age === null ? 'Age unknown' : `Age ${a.employee.age}`} · {a.locationIds.map(locName).join(', ')}</div>
                        </TableCell>
                        <TableCell><Badge variant={STATUS_VARIANT[a.status]}>{a.status}</Badge></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                              <div className={`h-full ${a.progress > 1 ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${Math.min(100, a.progress * 100)}%` }} />
                            </div>
                            <span className="tabular-nums">{a.actualHours.toFixed(2)}h</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{a.scheduledHours}h</TableCell>
                        {a.warnings.length ? a.warnings.map((w) => (
                          <TableCell key={w.minutes}>
                            {w.at ? <span className="flex items-center gap-1.5">{w.at}<Badge variant={w.sent ? 'secondary' : 'outline'}>{w.sent ? 'sent' : 'scheduled'}</Badge></span> : '—'}
                          </TableCell>
                        )) : RULES.minorHours.warningMinutes.map((m) => <TableCell key={m}>—</TableCell>)}
                        <TableCell>{a.limitAt ?? (a.status === 'missing age' ? '—' : 'Stays under')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="breaks" className="grid gap-4">
          <MetricGrid>
            <MetricCard label="This week" value={thisWeek.length} footer={`${weekLabel(weekOf(date))} · ${location.name}`} />
            <MetricCard label="Last week" value={weekly.find((w) => w.period === lastWeek)?.count ?? 0} footer={`${weekLabel(lastWeek)} · ${location.name}`} />
            <MetricCard label="This month" value={monthly.find((m) => m.period === date.slice(0, 7))?.byLocation.get(location.id) ?? 0} footer={`${monthLabel(date.slice(0, 7))} · ${location.name}`} />
            <MetricCard label="Employees involved this month" value={new Set(atStore.filter((v) => v.date.startsWith(date.slice(0, 7))).map((v) => v.employeeId)).size} footer="Distinct minors" />
          </MetricGrid>

          <Card>
            <CardHeader>
              <CardTitle>Violation log · {weekLabel(weekOf(date))}</CardTitle>
              <CardDescription>Minors who worked past the continuous-work limit without the required break, from Toast time-clock punches</CardDescription>
            </CardHeader>
            <CardContent>
              {thisWeek.length === 0 ? (
                <p className="text-sm opacity-70">No violations this week.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Continuous work</TableHead>
                      <TableHead className="text-right">Longest break</TableHead>
                      <TableHead>Toast record</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="tabular-nums">
                    {thisWeek.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>{dayLabel(v.date)}</TableCell>
                        <TableCell className="font-medium">{empName(v.employeeId)}</TableCell>
                        <TableCell className="text-right">{v.continuousHours.toFixed(2)}h</TableCell>
                        <TableCell className="text-right">{v.breakMinutes ? `${v.breakMinutes} min` : 'None'}</TableCell>
                        <TableCell>{v.sourceRecordId}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Weekly tally</CardTitle>
                <CardDescription>{location.name}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Week</TableHead>
                      <TableHead className="text-right">Violations</TableHead>
                      <TableHead className="text-right">Employees</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="tabular-nums">
                    {weekly.map((w) => (
                      <TableRow key={w.period} data-state={w.period === weekOf(date) ? 'selected' : undefined}>
                        <TableCell>{weekLabel(w.period)}</TableCell>
                        <TableCell className="text-right">{w.count}</TableCell>
                        <TableCell className="text-right">{w.employees.size}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Monthly rollup</CardTitle>
                <CardDescription>All your locations</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Violations</TableHead>
                      <TableHead className="text-right">Employees</TableHead>
                      <TableHead>By store</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="tabular-nums">
                    {monthly.map((m) => (
                      <TableRow key={m.period}>
                        <TableCell>{monthLabel(m.period)}</TableCell>
                        <TableCell className="text-right">{m.count}</TableCell>
                        <TableCell className="text-right">{m.employees.size}</TableCell>
                        <TableCell className="whitespace-normal">{[...m.byLocation].map(([l, n]) => `${locName(l)} ${n}`).join(' · ')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </>
  )
}
