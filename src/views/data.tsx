import { useState } from 'react'
import { RefreshCwIcon, UploadIcon } from 'lucide-react'
import { useApp, type Result } from '@/state'
import { clock, dayLabel, stamp } from '@/data/calendar'
import { floatingEmployees } from '@/data/employees'
import { SALES_CSV_HEADER, type ImportResult } from '@/data/imports'
import { laborHours } from '@/data/labor'
import { PageTitle } from '@/components/page-title'
import { ResultAlert } from '@/components/result-alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

const RESULT_VARIANT = { ok: 'outline', failed: 'destructive', none: 'secondary' } as const

/** UC-3 import, UC-4 sales retrieval, UC-5 labor records and UC-13 floating employees / discrepancies. */
export function DataView() {
  const { db, location, date, requestToastUpdate, importSalesCsv, resolveDiscrepancy } = useApp()
  const [result, setResult] = useState<Result | null>(null)
  const [csv, setCsv] = useState('')
  const [rejected, setRejected] = useState<ImportResult['rejected']>([])

  const locName = (id: string) => db.locations.find((l) => l.id === id)?.name ?? id
  const empName = (id: string) => db.employees.find((e) => e.id === id)?.name ?? id
  const labor = db.labor.filter((r) => r.locationId === location.id && r.date === date).sort((a, b) => a.employeeId.localeCompare(b.employeeId) || a.basis.localeCompare(b.basis))
  const issues = new Map(laborHours(labor).issues.map((i) => [i.record.id, i.issue]))
  const floaters = floatingEmployees(db.employees, db.payroll, db.labor)

  const runImport = () => {
    const r = importSalesCsv(location.id, csv)
    setResult(r)
    setRejected(r.ok && 'result' in r && r.result ? r.result.rejected : [])
    if (r.ok) setCsv('')
  }

  return (
    <>
      <PageTitle title="Data & sources" description="Toast (sales, orders, actual hours), 7shifts (scheduled hours), payroll (home and paid-out store), weather." />
      <ResultAlert result={result} />
      <Tabs defaultValue="sources">
        <TabsList>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="labor">Labor records</TabsTrigger>
          <TabsTrigger value="employees">Employees & discrepancies</TabsTrigger>
        </TabsList>

        <TabsContent value="sources">
          <Card>
            <CardHeader>
              <CardTitle>Source status by location</CardTitle>
              <CardDescription>A failed update keeps the last successful data and is shown here and on the dashboard.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Connection</TableHead>
                    <TableHead>Last success</TableHead>
                    <TableHead>Last result</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {db.sources.map((s) => (
                    <TableRow key={s.source + s.locationId}>
                      <TableCell className="font-medium">{locName(s.locationId)}</TableCell>
                      <TableCell>{s.source}</TableCell>
                      <TableCell>{s.connection}</TableCell>
                      <TableCell>{s.lastSuccessAt ? stamp(s.lastSuccessAt) : '—'}</TableCell>
                      <TableCell><Badge variant={RESULT_VARIANT[s.lastResult]}>{s.lastResult === 'none' ? 'n/a' : s.lastResult}</Badge></TableCell>
                      <TableCell className="max-w-80 whitespace-normal">{s.message}</TableCell>
                      <TableCell className="text-right">
                        {s.source === 'Toast' && (
                          <Button size="sm" variant="ghost" onClick={() => setResult(requestToastUpdate(s.locationId))}>
                            <RefreshCwIcon data-icon="inline-start" />Update
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import" className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Import sales history · {location.name}</CardTitle>
              <CardDescription>Paste CSV or choose a file. Valid rows are saved; invalid and duplicate rows are reported.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field>
                <FieldLabel htmlFor="csv-file">File</FieldLabel>
                <Input id="csv-file" type="file" accept=".csv,text/csv" onChange={async (e) => setCsv((await e.target.files?.[0]?.text()) ?? '')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="csv-text">CSV</FieldLabel>
                <Textarea id="csv-text" rows={6} className="font-mono text-xs" placeholder={`${SALES_CSV_HEADER}\n2026-10-30 12:00,912.50,68`} value={csv} onChange={(e) => setCsv(e.target.value)} />
                <FieldDescription>Format: <code>{SALES_CSV_HEADER}</code>, one row per closed hour.</FieldDescription>
              </Field>
              <div><Button disabled={!csv.trim()} onClick={runImport}><UploadIcon data-icon="inline-start" />Validate and import</Button></div>
              {rejected.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line</TableHead>
                      <TableHead>Row</TableHead>
                      <TableHead>Rejected because</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rejected.map((r) => (
                      <TableRow key={r.line}>
                        <TableCell>{r.line}</TableCell>
                        <TableCell className="font-mono text-xs">{r.raw}</TableCell>
                        <TableCell>{r.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Import history</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Accepted</TableHead>
                    <TableHead className="text-right">Rejected</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {db.imports.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{stamp(b.receivedAt)}</TableCell>
                      <TableCell>{b.source}</TableCell>
                      <TableCell>{b.locationId === 'all' ? 'All' : locName(b.locationId)}</TableCell>
                      <TableCell>{b.period}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.accepted.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.rejected}</TableCell>
                      <TableCell className="max-w-80 whitespace-normal">{b.issues.join('; ') || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="labor">
          <Card>
            <CardHeader>
              <CardTitle>Labor records · {location.name} · {dayLabel(date)}</CardTitle>
              <CardDescription>Scheduled hours from 7shifts and actual punches from the Toast time clock, kept separate.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Basis</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Breaks</TableHead>
                    <TableHead>Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {labor.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{empName(r.employeeId)}</TableCell>
                      <TableCell><Badge variant={r.basis === 'actual' ? 'secondary' : 'outline'}>{r.basis}</Badge></TableCell>
                      <TableCell>{r.source}</TableCell>
                      <TableCell>{r.station}</TableCell>
                      <TableCell className="tabular-nums">{clock(r.start)}–{r.end === null ? 'open' : clock(r.end)}</TableCell>
                      <TableCell>{r.breaks.map((b) => `${clock(b.start)}–${clock(b.end)}`).join(', ') || '—'}</TableCell>
                      <TableCell className="max-w-72 whitespace-normal">{issues.get(r.id) ?? ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employees" className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Floating employees</CardTitle>
              <CardDescription>Worked (Toast) at a store other than their payroll home store this week</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Home store (payroll)</TableHead>
                    <TableHead>Hours worked (Toast)</TableHead>
                    <TableHead>Hours paid out (payroll)</TableHead>
                    <TableHead>Check</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {floaters.map((f) => (
                    <TableRow key={f.employee.id}>
                      <TableCell className="font-medium">{f.employee.name}</TableCell>
                      <TableCell>{locName(f.homeLocationId)}</TableCell>
                      <TableCell>{Object.entries(f.workedHours).map(([l, h]) => `${locName(l)} ${h.toFixed(1)}h`).join(' · ')}</TableCell>
                      <TableCell>{Object.entries(f.paidHours).map(([l, h]) => `${locName(l)} ${h}h`).join(' · ')}</TableCell>
                      <TableCell className="max-w-72 whitespace-normal">
                        {f.paidElsewhere.length
                          ? <Badge variant="destructive">{f.paidElsewhere.map(locName).join(', ')} hours paid by {locName(f.homeLocationId)}</Badge>
                          : <Badge variant="outline">Paid where worked</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Discrepancies</CardTitle>
              <CardDescription>Uncertain matches stay visible until reviewed; nothing is merged automatically.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Source reference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {db.discrepancies.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium whitespace-nowrap">{d.kind}</TableCell>
                      <TableCell>{locName(d.locationId)}</TableCell>
                      <TableCell className="max-w-80 whitespace-normal">{d.description}</TableCell>
                      <TableCell className="font-mono text-xs">{d.sourceRef}</TableCell>
                      <TableCell><Badge variant={d.status === 'open' ? 'destructive' : 'outline'}>{d.status}</Badge></TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {d.status === 'open' && (
                          <>
                            {d.candidateEmployeeId && <Button size="sm" variant="ghost" onClick={() => setResult(resolveDiscrepancy(d.id, 'confirmed'))}>Confirm match</Button>}
                            <Button size="sm" variant="ghost" onClick={() => setResult(resolveDiscrepancy(d.id, 'kept unresolved'))}>Keep unresolved</Button>
                          </>
                        )}
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
