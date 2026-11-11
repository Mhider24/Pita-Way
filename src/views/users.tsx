import { useState } from 'react'
import { UserPlusIcon } from 'lucide-react'
import { useApp, type Result } from '@/state'
import { ROLES, ROLE_LABEL, locationsFor } from '@/data/permissions'
import type { Role } from '@/data/types'
import { FormSelect } from '@/components/form-select'
import { PageTitle } from '@/components/page-title'
import { ResultAlert } from '@/components/result-alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const roleItems = ROLES.map((r) => ({ label: ROLE_LABEL[r], value: r }))

/** UC-2 Manage users and access. Edit and deactivate actions are pending (Q4). */
export function UsersView() {
  const { db } = useApp()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  return (
    <>
      <PageTitle
        title="Users & access"
        description="Accounts, roles and assigned locations"
        actions={<Button onClick={() => { setOpen(true); setResult(null) }}><UserPlusIcon data-icon="inline-start" />Create account</Button>}
      />
      <ResultAlert result={result} />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Sign-in</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Locations</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {db.users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.signInReference}</TableCell>
                  <TableCell>{ROLE_LABEL[u.role]}</TableCell>
                  <TableCell className="max-w-80 whitespace-normal">
                    {locationsFor(u, db.access).map((id) => db.locations.find((l) => l.id === id)?.name).join(', ')}
                  </TableCell>
                  <TableCell><Badge variant={u.active ? 'outline' : 'destructive'}>{u.active ? 'Active' : 'Inactive'}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {open && <CreateUserDialog onClose={() => setOpen(false)} onDone={(r) => { setOpen(false); setResult(r) }} />}
    </>
  )
}

function CreateUserDialog({ onClose, onDone }: { onClose: () => void; onDone: (r: Result) => void }) {
  const { db, createUser } = useApp()
  const [form, setForm] = useState({ name: '', signInReference: '', password: '', role: 'store_manager' as Role, locationIds: [] as string[] })
  const [result, setResult] = useState<Result | null>(null)

  const toggle = (id: string, on: boolean) =>
    setForm((f) => ({ ...f, locationIds: on ? [...f.locationIds, id] : f.locationIds.filter((x) => x !== id) }))

  const submit = () => {
    const r = createUser(form)
    if (r.ok) onDone(r)
    else setResult(r)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create account</DialogTitle>
          <DialogDescription>The account can only see its assigned locations.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="user-name">Name</FieldLabel>
            <Input id="user-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="user-email">Sign-in email</FieldLabel>
            <Input id="user-email" type="email" value={form.signInReference} onChange={(e) => setForm({ ...form, signInReference: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="user-password">Initial password</FieldLabel>
            <Input id="user-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="user-role">Role</FieldLabel>
            <FormSelect id="user-role" items={roleItems} value={form.role} onChange={(role) => setForm({ ...form, role })} />
          </Field>
          <FieldSet>
            <FieldLegend variant="label">Locations</FieldLegend>
            <div className="grid grid-cols-2 gap-2">
              {db.locations.map((l) => (
                <Field key={l.id} orientation="horizontal">
                  <Checkbox id={`loc-${l.id}`} aria-label={l.name} checked={form.locationIds.includes(l.id)} onCheckedChange={(on) => toggle(l.id, !!on)} />
                  <FieldLabel htmlFor={`loc-${l.id}`} className="font-normal">{l.name}</FieldLabel>
                </Field>
              ))}
            </div>
          </FieldSet>
          <ResultAlert result={result} />
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Create account</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
