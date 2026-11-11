import { useState } from 'react'
import { CalendarDaysIcon, PencilIcon, PlusIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react'
import { useApp, type Result } from '@/state'
import { DATES, dayLabel, hoursLabel, isPast, slotLabel, stamp } from '@/data/calendar'
import { latestRun, weatherLabel } from '@/data/forecast'
import { weekOf } from '@/data/alerts'
import { ratio } from '@/data/labor'
import { MIN_SHIFT_HOURS, addCoverage, changeSummary, headcountOf, newId, removeCoverage, staffRows, sumHeadcount, totalHours } from '@/data/staffing'
import type { RecShift } from '@/data/types'
import { AdjustmentDialog } from '@/components/adjustment-dialog'
import { DayStrip } from '@/components/day-strip'
import { StaffingChart } from '@/components/charts'
import { HeadcountGrid } from '@/components/headcount-grid'
import { MetricCard, MetricGrid } from '@/components/metric-card'
import { PageTitle } from '@/components/page-title'
import { ResultAlert } from '@/components/result-alert'
import { ShiftDialog } from '@/components/shift-dialog'
import { ShiftTimeline } from '@/components/shift-timeline'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { money } from '@/lib/utils'

export function ScheduleView() {
  const { allowed } = useApp()
  // Crew and Shift Leads get the read-only named schedule; managers get planning tools.
  return allowed('forecast.view') ? <ManagerSchedule /> : <TeamSchedule />
}

/** Read-only, named schedule for crew: their own shifts this week and the full day. */
function TeamSchedule() {
  const { db, user, location, date, setDate, recFor, nameOf } = useApp()
  const rec = recFor(location.id, date)
  const published = rec?.status === 'accepted'
  const me = user!.employeeId
  const week = DATES.filter((d) => weekOf(d) === weekOf(date))
  const myWeek = week.flatMap((d) => {
    const r = db.recommendations.find((x) => x.date === d && x.status === 'accepted' && x.shifts.some((s) => s.employeeId === me))
    return r ? r.shifts.filter((s) => s.employeeId === me).map((s) => ({ date: d, shift: s, store: db.locations.find((l) => l.id === r.locationId)!.name })) : []
  })

  return (
    <>
      <PageTitle title={`${location.name} schedule`} description={`${dayLabel(date)} · Open ${hoursLabel(date)} · ${weatherLabel(location, date)}`} />
      <DayStrip marks={new Set(myWeek.map((m) => m.date))} />

      {me && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Your shifts this week</CardTitle>
            <CardDescription>{myWeek.length ? `${myWeek.length} shifts · ${totalHours(myWeek.map((m) => m.shift))}h` : 'No published shifts this week'}</CardDescription>
          </CardHeader>
          {myWeek.length > 0 && (
            <CardContent className="flex flex-wrap gap-2">
              {myWeek.map(({ date: d, shift, store }) => (
                <button key={shift.id} onClick={() => setDate(d)} className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${d === date ? 'border-primary bg-accent' : 'bg-background'}`}>
                  <div className="font-medium">{dayLabel(d).replace(' (today)', '')}</div>
                  <div>{slotLabel(shift.start)}–{slotLabel(shift.end)} · {shift.station}</div>
                  {store !== location.name && <div className="text-xs opacity-70">at {store}</div>}
                </button>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {!rec || !published ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><CalendarDaysIcon /></EmptyMedia>
            <EmptyTitle>Schedule not published yet</EmptyTitle>
            <EmptyDescription>Your manager hasn't published the schedule for {dayLabel(date)}.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Who's working</CardTitle>
            <CardDescription>{rec.shifts.filter((s) => s.employeeId).length} people · {dayLabel(date)}</CardDescription>
          </CardHeader>
          <CardContent>
            <ShiftTimeline shifts={rec.shifts.filter((s) => s.employeeId)} date={date} nameOf={nameOf} highlight={me} />
          </CardContent>
        </Card>
      )}
    </>
  )
}

/** UC-7 recommendation, UC-14 manual adjustment and UC-9 override requests for one store and date. */
function ManagerSchedule() {
  const { db, location, date, recFor, allowed, crewAt, nameOf, generateRecommendation, acceptRecommendation } = useApp()
  const [draft, setDraft] = useState<RecShift[] | null>(null)
  const [editing, setEditing] = useState<{ shift: RecShift; isNew: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const rec = recFor(location.id, date)
  const latest = latestRun(db.runs, location.id, date)
  const canEdit = allowed('schedule.edit', location.id) && !isPast(date)
  const run = rec && db.runs.find((r) => r.id === rec.forecastRunId)

  if (!rec || !run) {
    return (
      <>
      <DayStrip />
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><CalendarDaysIcon /></EmptyMedia>
          <EmptyTitle>No schedule for {dayLabel(date)}</EmptyTitle>
          <EmptyDescription>{latest ? 'Generate one from the latest forecast.' : 'A forecast is needed first.'}</EmptyDescription>
        </EmptyHeader>
        {canEdit && latest && <EmptyContent><Button onClick={() => setResult(generateRecommendation(location.id, date))}>Generate schedule</Button></EmptyContent>}
        <ResultAlert result={result} />
      </Empty>
      </>
    )
  }

  const shifts = draft ?? rec.shifts
  const forecastTotal = run.predicted.reduce((a, b) => a + b, 0)
  const hours = totalHours(shifts)
  const projected = ratio(forecastTotal, hours)
  const open = shifts.filter((s) => !s.employeeId).length
  const pending = db.overrides.filter((o) => o.recommendationId === rec.id && o.status === 'pending')
  const history = db.adjustments.filter((a) => a.recommendationId === rec.id)
  const changes = draft ? changeSummary(rec.shifts, draft, nameOf) : []
  const newerForecast = latest && latest.id !== rec.forecastRunId

  const act = (r: Result) => {
    setResult(r)
    if (r.ok) setDraft(null)
  }

  return (
    <>
      <PageTitle
        title="Staffing & schedule"
        description={`${location.name} · ${dayLabel(date)} · Open ${hoursLabel(date)} · ${weatherLabel(location, date)}`}
        actions={canEdit && !draft && (
          <>
            {newerForecast && <Button variant="outline" onClick={() => act(generateRecommendation(location.id, date))}><RefreshCwIcon data-icon="inline-start" />Update from latest forecast</Button>}
            {rec.status === 'draft' && allowed('schedule.accept', location.id) && <Button variant="outline" onClick={() => act(acceptRecommendation(location.id, date))}>Publish to team</Button>}
            <Button onClick={() => { setDraft(rec.shifts); setResult(null) }}><PencilIcon data-icon="inline-start" />Edit schedule</Button>
          </>
        )}
      />

      {!draft && <DayStrip />}

      <div className="flex flex-wrap gap-2">
        <Badge variant={rec.status === 'accepted' ? 'secondary' : 'outline'}>v{rec.version} · {rec.status === 'accepted' ? 'Published' : 'Draft (not visible to team)'}</Badge>
        {open > 0 && <Badge variant="destructive">{open} open shift{open > 1 ? 's' : ''}</Badge>}
      </div>

      <ResultAlert result={result} />

      {rec.conflicts.length > 0 && (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Staffing note</AlertTitle>
          <AlertDescription><ul className="list-disc pl-4">{rec.conflicts.map((c) => <li key={c}>{c}</li>)}</ul></AlertDescription>
        </Alert>
      )}
      {pending.map((o) => (
        <Alert key={o.id}>
          <AlertTitle>Change waiting for District Manager approval</AlertTitle>
          <AlertDescription>{o.changeSummary.join('; ')} · {o.reason}. The schedule below stays at v{rec.version} until it's decided.</AlertDescription>
        </Alert>
      ))}

      <MetricGrid>
        <MetricCard label="Forecast sales" value={money(forecastTotal)} footer={`${run.predictedOrders.reduce((a, b) => a + b, 0).toLocaleString()} orders`} />
        <MetricCard label={draft ? 'Labor hours (editing)' : 'Scheduled hours'} value={`${hours}h`} footer={`${sumHeadcount(rec.required)}h needed for the forecast`} />
        <MetricCard
          label="Projected SPLH"
          value={projected ? money(projected) : '—'}
          delta={projected ? `${money(rec.targetSPLH)} target` : undefined}
          good={!!projected && projected >= rec.targetSPLH}
          footer="Forecast sales ÷ scheduled hours"
        />
        <MetricCard label="Team" value={new Set(shifts.map((s) => s.employeeId).filter(Boolean)).size} footer={open ? `${open} shifts still open` : 'All shifts filled'} />
      </MetricGrid>

      {draft && (
        <Alert>
          <PencilIcon />
          <AlertTitle>Editing a working copy of v{rec.version}</AlertTitle>
          <AlertDescription>
            {changes.length ? changes.join('; ') : 'No changes yet. Click a shift to change who works it, or use + / − on the coverage grid.'}
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={!changes.length} onClick={() => setSaving(true)}>Save changes…</Button>
              <Button size="sm" variant="outline" onClick={() => setDraft(null)}>Discard</Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Who's working</CardTitle>
          <CardDescription>{shifts.length} shifts · {hours}h{draft && ' · click a shift to edit'}</CardDescription>
          {draft && (
            <CardAction>
              <Button size="sm" variant="outline" onClick={() => setEditing({ shift: { id: newId('s'), station: 'Line Cook', start: 0, end: MIN_SHIFT_HOURS, source: 'manual', employeeId: null }, isNew: true })}>
                <PlusIcon data-icon="inline-start" />Add shift
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <ShiftTimeline shifts={shifts} date={date} nameOf={nameOf} showSource onSelect={draft ? (s) => setEditing({ shift: s, isNew: false }) : undefined} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coverage vs need</CardTitle>
          <CardDescription>Scheduled / needed per role and hour{draft && '. Hover a cell to add or trim an hour'}</CardDescription>
        </CardHeader>
        <CardContent>
          <HeadcountGrid
            scheduled={headcountOf(shifts)}
            required={rec.required}
            onAdd={draft ? (s, h) => setDraft((d) => addCoverage(d!, s, h)) : undefined}
            onRemove={draft ? (s, h) => setDraft((d) => removeCoverage(d!, s, h)) : undefined}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Staffing by hour</CardTitle>
            <CardDescription>Dashed line: staff needed for the forecast</CardDescription>
          </CardHeader>
          <CardContent><StaffingChart data={staffRows(rec.required, shifts)} className="h-56" /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Change history</CardTitle>
            <CardDescription>Manual changes and approval requests for this schedule</CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm opacity-70">No manual changes.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Change</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="max-w-72 whitespace-normal">
                        <div className="font-medium">{a.reason}</div>
                        <div>{a.changeSummary.join('; ')}</div>
                      </TableCell>
                      <TableCell>{db.users.find((u) => u.id === a.authorId)?.name}<div className="text-xs opacity-70">{stamp(a.createdAt)}</div></TableCell>
                      <TableCell><Badge variant={a.outcome === 'applied' ? 'secondary' : 'outline'}>{a.outcome}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {editing && (
        <ShiftDialog
          {...editing}
          employees={crewAt(location.id)}
          others={shifts}
          onClose={() => setEditing(null)}
          onDelete={(id) => {
            setDraft((d) => d!.filter((x) => x.id !== id))
            setEditing(null)
          }}
          onSave={(shift) => {
            setDraft((d) => (editing.isNew ? [...d!, shift] : d!.map((x) => (x.id === shift.id ? shift : x))))
            setEditing(null)
          }}
        />
      )}
      {saving && draft && (
        <AdjustmentDialog
          rec={rec}
          draft={draft}
          onClose={() => setSaving(false)}
          onDone={(r) => {
            setSaving(false)
            act(r)
          }}
        />
      )}
    </>
  )
}
