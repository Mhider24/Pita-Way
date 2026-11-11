import { useState } from 'react'
import { REQUIRE_PASSWORD, useApp, type Result } from '@/state'
import { ROLE_LABEL } from '@/data/permissions'
import { ResultAlert } from '@/components/result-alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

// The theme's input color is close to the card color, so give fields a visible surface.
const fieldClass = 'h-10 border border-border bg-background shadow-sm'

/** UC-1 sign-in. Makeshift email + password against mock credentials; no 2FA yet (Q3). */
export function SignInView() {
  const { db, signIn } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <div className="grid w-full max-w-sm gap-4">
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">PW</div>
            <CardTitle className="text-xl">Sign in to Pita Way</CardTitle>
            <CardDescription>Labor forecasting and scheduling</CardDescription>
          </CardHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setResult(signIn(email, password))
            }}
          >
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input id="email" type="email" className={fieldClass} autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input id="password" type="password" className={fieldClass} autoComplete="current-password" required={REQUIRE_PASSWORD} placeholder={REQUIRE_PASSWORD ? undefined : "Not required while testing"} value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <ResultAlert result={result} />
              </FieldGroup>
            </CardContent>
            <CardFooter className="mt-4">
              <Button type="submit" className="w-full">Sign in</Button>
            </CardFooter>
          </form>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Demo accounts</CardTitle>
            <CardDescription>Select one to fill the email.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1">
            {db.users.map((u) => (
              <Button key={u.id} variant="ghost" className="h-auto flex-col items-start gap-0 py-2 text-left whitespace-normal" onClick={() => setEmail(u.signInReference)}>
                <span className="break-all">{u.signInReference}</span>
                <span className="text-xs font-normal opacity-70">{ROLE_LABEL[u.role]}{u.active ? '' : ' (inactive)'}</span>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
