import { useState } from 'react'
import { useApp, type Result } from '@/state'
import { RULES } from '@/data/policies'
import { changeSummary, totalHours } from '@/data/staffing'
import { ADJUSTMENT_REASONS, type AdjustmentReason, type RecShift, type ScheduleRecommendation } from '@/data/types'
import { FormSelect, options } from '@/components/form-select'
import { ResultAlert } from '@/components/result-alert'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  rec: ScheduleRecommendation
  draft: RecShift[]
  onDone: (result: Result) => void
  onClose: () => void
}

/** UC-14: save a manual adjustment with its reason; large additions become override requests (UC-9). */
export function AdjustmentDialog({ rec, draft, onDone, onClose }: Props) {
  const { saveAdjustment, nameOf } = useApp()
  const [reason, setReason] = useState<AdjustmentReason>(totalHours(draft) > totalHours(rec.shifts) ? 'Catering order' : 'Shift swap / availability')
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  const added = totalHours(draft) - totalHours(rec.shifts)
  const limit = RULES.adjustmentApproval.immediateIfAddedHoursAtMost
  const needsApproval = added > limit

  const submit = () => {
    const r = saveAdjustment(rec.locationId, rec.date, draft, reason, notes)
    if (r.ok) onDone(r)
    else setResult(r)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save schedule changes</DialogTitle>
          <DialogDescription>Schedule v{rec.version}: {totalHours(rec.shifts)}h → {totalHours(draft)}h</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="rounded-lg border p-3 text-sm">
            <ul className="list-disc pl-4">{changeSummary(rec.shifts, draft, nameOf).map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
          <Field>
            <FieldLabel htmlFor="adj-reason">Reason or event</FieldLabel>
            <FormSelect id="adj-reason" items={options(ADJUSTMENT_REASONS)} value={reason} onChange={setReason} />
          </Field>
          <Field>
            <FieldLabel htmlFor="adj-notes">Explanation</FieldLabel>
            <Textarea id="adj-notes" rows={3} placeholder="e.g. 85 catering platters for pickup at 5:30 PM" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Alert variant={needsApproval ? 'destructive' : 'default'}>
            <AlertTitle>{needsApproval ? 'Needs District Manager approval' : 'Applies immediately'}</AlertTitle>
            <AlertDescription>
              {needsApproval
                ? `Adds ${added}h (over the ${limit}h limit). It will be sent as an override request and the current version stays in place until approved.`
                : `${added > 0 ? `Adds ${added}h` : added < 0 ? `Removes ${-added}h` : 'Same total hours'}; within the ${limit}h limit.`}
            </AlertDescription>
          </Alert>
          <ResultAlert result={result} />
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!notes.trim()}>{needsApproval ? 'Send for approval' : 'Apply change'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
