import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { FormSelect, options } from '@/components/form-select'
import { HOURS, slotLabel } from '@/data/calendar'
import { STATIONS, isMinor, validateShift } from '@/data/staffing'
import type { Employee, RecShift } from '@/data/types'

interface Props {
  shift: RecShift
  isNew: boolean
  /** Employees who can work at this store. */
  employees: Employee[]
  /** The rest of the working schedule, to flag people already on an overlapping shift. */
  others: RecShift[]
  onSave: (shift: RecShift) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const startOptions = HOURS.map((h, i) => ({ label: h, value: i }))
const endOptions = HOURS.map((_, i) => ({ label: slotLabel(i + 1), value: i + 1 }))

const OPEN = 'open'

/** Edit one shift in the working copy: role, employee and times. */
export function ShiftDialog({ shift, isNew, employees, others, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState(shift)
  const update = (patch: Partial<RecShift>) => setDraft((d) => ({ ...d, ...patch, source: 'manual' }))
  const error = validateShift(draft)
  const people = [
    { label: 'Open shift (unassigned)', value: OPEN },
    ...employees.filter((e) => e.station === draft.station).map((e) => {
      const clash = others.find((s) => s.id !== draft.id && s.employeeId === e.id && s.start < draft.end && s.end > draft.start)
      const tags = [isMinor(e) && `age ${e.age}`, clash && `working ${slotLabel(clash.start)}–${slotLabel(clash.end)}`].filter(Boolean)
      return { label: tags.length ? `${e.name} (${tags.join(', ')})` : e.name, value: e.id }
    }),
  ]

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add shift' : 'Edit shift'}</DialogTitle>
          <DialogDescription>Changes are saved with a reason when you save the schedule.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="shift-station">Role</FieldLabel>
            <FormSelect id="shift-station" items={options(STATIONS)} value={draft.station} onChange={(station) => update({ station, employeeId: null })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="shift-employee">Employee</FieldLabel>
            <FormSelect id="shift-employee" items={people} value={draft.employeeId ?? OPEN} onChange={(v) => update({ employeeId: v === OPEN ? null : v })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="shift-start">Start</FieldLabel>
              <FormSelect id="shift-start" items={startOptions} value={draft.start} onChange={(start) => update({ start })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="shift-end">End</FieldLabel>
              <FormSelect id="shift-end" items={endOptions} value={draft.end} onChange={(end) => update({ end })} />
            </Field>
          </div>
          {error ? <FieldError>{error}</FieldError> : <FieldDescription>{draft.end - draft.start} hours</FieldDescription>}
        </FieldGroup>
        <DialogFooter className="sm:justify-between">
          {!isNew ? <Button variant="destructive" onClick={() => onDelete(draft.id)}>Remove shift</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!!error} onClick={() => onSave(draft)}>Done</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
