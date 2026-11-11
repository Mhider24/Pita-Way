import { useState } from 'react'
import { ChartLineIcon, TriangleAlertIcon } from 'lucide-react'
import { useApp, type Result } from '@/state'
import { DATES, dayLabel, isPast, stamp } from '@/data/calendar'
import { MODEL_VERSION, weatherLabel, actualsFor, compareForecast, latestRun, predictedFor, salesRows, type Measure } from '@/data/forecast'
import { SalesChart } from '@/components/charts'
import { MetricCard, MetricGrid } from '@/components/metric-card'
import { PageTitle } from '@/components/page-title'
import { ResultAlert } from '@/components/result-alert'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn, money, signed } from '@/lib/utils'

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`)
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

export function ForecastView() {
  const { db, location, date, allowed, generateForecast } = useApp()
  const [result, setResult] = useState<Result | null>(null)
  const [pickedRun, setPickedRun] = useState<string | null>(null)
  const [measure, setMeasure] = useState<Measure>('sales')
  const fmt = (v: number) => (measure === 'sales' ? money(v) : `${Math.round(v).toLocaleString()} orders`)

  const runs = db.runs.filter((r) => r.locationId === location.id && r.date === date).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const run = runs.find((r) => r.id === pickedRun) ?? runs[0]
  const actual = actualsFor(db.sales, location.id, date, measure)
  const canGenerate = allowed('forecast.generate', location.id) && !isPast(date)

  const generate = canGenerate && (
    <Button onClick={() => { setResult(generateForecast(location.id, date)); setPickedRun(null) }}>
      <ChartLineIcon data-icon="inline-start" />Generate forecast
    </Button>
  )

  if (!run) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><ChartLineIcon /></EmptyMedia>
          <EmptyTitle>No forecast for {dayLabel(date)}</EmptyTitle>
          <EmptyDescription>Generate one from the latest sales history.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>{generate}</EmptyContent>
      </Empty>
    )
  }

  const predicted = predictedFor(run, measure)
  const comparison = compareForecast(predicted, actual, date)
  const adjustments = db.adjustments.filter((a) => a.locationId === location.id && a.date === date)

  return (
    <>
      <PageTitle title="Sales forecast" description={`${location.name} · ${dayLabel(date)} · sales dollars and order count`} actions={generate} />
      <ResultAlert result={result} />

      <Card size="sm">
        <CardHeader>
          <CardTitle>Forecast run {runs.length - runs.indexOf(run)} of {runs.length}</CardTitle>
          <CardDescription>{run.id}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              ['Created', stamp(run.createdAt)],
              ['Data cutoff', stamp(run.dataCutoff)],
              ['Weather', weatherLabel(location, date)],
              ['Sales', money(sum(run.predicted))],
              ['Orders', sum(run.predictedOrders).toLocaleString()],
              ['Model', run.modelVersionId],
              ['Status', run.status],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs opacity-70">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" title={MODEL_VERSION.validationSummary}>{MODEL_VERSION.method}</Badge>
          </div>
          {run.limitations.length > 0 && (
            <Alert>
              <TriangleAlertIcon />
              <AlertTitle>Input limitations</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">{run.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Tabs value={measure} onValueChange={(v) => setMeasure(v as Measure)}>
        <TabsList>
          <TabsTrigger value="sales">Sales $</TabsTrigger>
          <TabsTrigger value="orders">Order count</TabsTrigger>
        </TabsList>
      </Tabs>

      <Tabs defaultValue="hourly">
        <TabsList>
          <TabsTrigger value="hourly">Hourly</TabsTrigger>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="compare">Compare with actual</TabsTrigger>
          <TabsTrigger value="history">Run history ({runs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="hourly">
          <Card>
            <CardContent><SalesChart data={salesRows(predicted, actual)} unit={measure === 'sales' ? 'money' : 'orders'} className="h-72" /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily">
          <Card>
            <CardHeader>
              <CardTitle>Daily totals this week</CardTitle>
              <CardDescription>Shown separately from hourly accuracy so a good day total can't hide poor busy-hour predictions.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Forecast</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Daily error</TableHead>
                    <TableHead className="text-right">Hourly WAPE</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {DATES.map((d) => {
                    const r = latestRun(db.runs, location.id, d)
                    if (!r) return null
                    const c = compareForecast(predictedFor(r, measure), actualsFor(db.sales, location.id, d, measure), d)
                    return (
                      <TableRow key={d} data-state={d === date ? 'selected' : undefined}>
                        <TableCell className="font-medium">{dayLabel(d)}</TableCell>
                        <TableCell className="text-right">{fmt(sum(predictedFor(r, measure)))}</TableCell>
                        <TableCell className="text-right">{c.status === 'no actuals' ? '—' : fmt(c.actualTotal)}</TableCell>
                        <TableCell className="text-right">{c.status === 'complete' ? pct(c.dailyError) : '—'}</TableCell>
                        <TableCell className="text-right">{c.status === 'complete' ? pct(c.hourlyWape) : '—'}</TableCell>
                        <TableCell><Badge variant="outline">{c.status}</Badge></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compare" className="grid gap-4">
          {comparison.status === 'no actuals' ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>Actual sales aren't available yet</EmptyTitle>
                <EmptyDescription>The comparison appears once hours close and Toast data arrives.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              {comparison.status === 'incomplete' && (
                <Alert>
                  <TriangleAlertIcon />
                  <AlertTitle>Incomplete comparison</AlertTitle>
                  <AlertDescription>
                    Only {comparison.rows.filter((r) => r.actual !== null).length} of 13 hours have actual sales.
                    {comparison.missing.length > 0 && ` Missing closed hours: ${comparison.missing.join(', ')} (data source may be stale).`}
                  </AlertDescription>
                </Alert>
              )}
              {adjustments.length > 0 && (
                <Alert>
                  <TriangleAlertIcon />
                  <AlertTitle>Manual schedule changes on this date</AlertTitle>
                  <AlertDescription>
                    {adjustments.map((a) => `${a.reason}: ${a.changeSummary.join('; ')}`).join(' · ')}. Events like these can explain differences from the forecast.
                  </AlertDescription>
                </Alert>
              )}
              <MetricGrid>
                <MetricCard label="Hourly WAPE" value={pct(comparison.hourlyWape)} footer="Over hours with actual sales" />
                <MetricCard label="Total error" value={pct(comparison.dailyError)} footer="|actual − forecast| ÷ actual, same hours" />
                <MetricCard label="Actual" value={fmt(comparison.actualTotal)} footer="Hours with data" />
                <MetricCard label="Forecast" value={fmt(comparison.predictedTotal)} footer="Same hours" />
              </MetricGrid>
              <Card>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hour</TableHead>
                        <TableHead className="text-right">Forecast</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Difference</TableHead>
                        <TableHead className="text-right">% of forecast</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="tabular-nums">
                      {comparison.rows.map((r) => (
                        <TableRow key={r.hour}>
                          <TableCell className="font-medium">{r.hour}</TableCell>
                          <TableCell className="text-right">{fmt(r.predicted)}</TableCell>
                          <TableCell className="text-right">{r.actual === null ? '—' : fmt(r.actual)}</TableCell>
                          <TableCell className={cn('text-right', r.diff !== null && r.diff < 0 && 'text-destructive')}>{r.diff === null ? '—' : `${r.diff >= 0 ? '+' : '−'}${fmt(Math.abs(r.diff))}`}</TableCell>
                          <TableCell className="text-right">{r.diff === null || !r.predicted ? "—" : `${signed((r.diff / r.predicted) * 100)}%`}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Saved runs for this date</CardTitle>
              <CardDescription>New runs never overwrite earlier predictions, so later comparisons stay honest.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Data cutoff</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r, i) => (
                    <TableRow key={r.id} data-state={r.id === run.id ? 'selected' : undefined}>
                      <TableCell className="font-medium">#{runs.length - i}</TableCell>
                      <TableCell>{stamp(r.createdAt)}</TableCell>
                      <TableCell>{stamp(r.dataCutoff)}</TableCell>
                      <TableCell>{r.modelVersionId}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(sum(r.predicted))}</TableCell>
                      <TableCell className="text-right tabular-nums">{sum(r.predictedOrders).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {r.id !== run.id && <Button size="sm" variant="ghost" onClick={() => setPickedRun(r.id)}>View</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  )
}
