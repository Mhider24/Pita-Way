import { useState } from 'react'
import { TriangleAlertIcon } from 'lucide-react'
import { useApp, type Result } from '@/state'
import { dayLabel, stamp } from '@/data/calendar'
import { ratio } from '@/data/labor'
import { totalHours } from '@/data/staffing'
import type { OverrideRequest } from '@/data/types'
import { PageTitle } from '@/components/page-title'
import { ResultAlert } from '@/components/result-alert'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { money } from '@/lib/utils'

const STATUS_VARIANT = { pending: 'outline', approved: 'secondary', rejected: 'destructive' } as const

/** UC-9 request status for Store Managers, UC-10 review for District Managers. */
export function OverridesView() {
  const { db, user, myLocations, allowed } = useApp()
  const mine = myLocations.map((l) => l.id)
  const reviewer = allowed('override.review')
  const visible = db.overrides.filter((o) => mine.includes(o.locationId) && (reviewer || o.requesterId === user!.id))
  const pending = visible.filter((o) => o.status === 'pending')
  const decided = visible.filter((o) => o.status !== 'pending')

  return (
    <>
      <PageTitle
        title="Override requests"
        description={reviewer ? 'Review schedule changes that exceed the manual adjustment limit.' : 'Changes you sent for District Manager approval.'}
      />
      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="decided">Decided ({decided.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="grid gap-4">
          {pending.length === 0 && (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No pending requests</EmptyTitle>
                <EmptyDescription>Requests appear here when a schedule change needs approval.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {pending.map((o) => <RequestCard key={o.id} request={o} />)}
        </TabsContent>
        <TabsContent value="decided" className="grid gap-4">
          {decided.map((o) => <RequestCard key={o.id} request={o} />)}
        </TabsContent>
      </Tabs>
    </>
  )
}

function RequestCard({ request: o }: { request: OverrideRequest }) {
  const { db, allowed, reviewOverride } = useApp()
  const [note, setNote] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  const loc = db.locations.find((l) => l.id === o.locationId)!
  const rec = db.recommendations.find((r) => r.id === o.recommendationId)!
  const run = db.runs.find((r) => r.id === rec.forecastRunId)
  const forecast = run?.predicted.reduce((a, b) => a + b, 0) ?? 0
  const userName = (id?: string) => db.users.find((u) => u.id === id)?.name ?? '—'
  const stale = o.status === 'pending' && rec.version !== o.baseVersion
  const canReview = o.status === 'pending' && allowed('override.review', o.locationId)

  // Impact of the proposal against the current recommendation (shown while pending).
  const hoursBefore = totalHours(rec.shifts)
  const hoursAfter = totalHours(o.proposedShifts)
  const rows: [string, string, string][] = [
    ['Labor hours', `${hoursBefore}h`, `${hoursAfter}h`],
    ['Projected SPLH', money(ratio(forecast, hoursBefore) ?? 0), money(ratio(forecast, hoursAfter) ?? 0)],
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{loc.name} #{loc.storeNumber} · {dayLabel(o.date)}</CardTitle>
        <CardDescription>{o.reason} · requested by {userName(o.requesterId)}, {stamp(o.submittedAt)} · against v{o.baseVersion}</CardDescription>
        <CardAction><Badge variant={STATUS_VARIANT[o.status]}>{o.status}</Badge></CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1 text-sm">
          <div className="font-medium">Proposed change</div>
          <ul className="list-disc pl-4">{o.changeSummary.map((c) => <li key={c}>{c}</li>)}</ul>
          <p className="mt-1">{o.notes}</p>
        </div>
        {o.status === 'pending' && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead className="text-right">Current (v{rec.version})</TableHead>
                <TableHead className="text-right">With change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="tabular-nums">
              {rows.map(([label, a, b]) => (
                <TableRow key={label}>
                  <TableCell>{label}</TableCell>
                  <TableCell className="text-right">{a}</TableCell>
                  <TableCell className="text-right font-medium">{b}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {stale && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>The schedule changed after this request</AlertTitle>
            <AlertDescription>It was made against v{o.baseVersion}; the current version is v{rec.version}. Reject it so the requester can resubmit against the current schedule.</AlertDescription>
          </Alert>
        )}
        {o.status !== 'pending' && (
          <div className="rounded-lg border p-3 text-sm">
            <span className="font-medium">{o.status === 'approved' ? 'Approved' : 'Rejected'}</span> by {userName(o.reviewerId)}, {o.decidedAt && stamp(o.decidedAt)}
            {o.decisionNote && <p className="mt-1">{o.decisionNote}</p>}
          </div>
        )}
        {canReview && <Textarea rows={2} placeholder="Decision note for the requester" value={note} onChange={(e) => setNote(e.target.value)} />}
        <ResultAlert result={result} />
      </CardContent>
      {canReview && (
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={() => setResult(reviewOverride(o.id, 'rejected', note))}>Reject</Button>
          <Button disabled={stale} onClick={() => setResult(reviewOverride(o.id, 'approved', note))}>Approve</Button>
        </CardFooter>
      )}
    </Card>
  )
}
