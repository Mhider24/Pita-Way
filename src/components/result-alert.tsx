import { CircleCheckIcon, TriangleAlertIcon } from 'lucide-react'
import type { Result } from '@/state'
import { Alert, AlertDescription } from '@/components/ui/alert'

/** Outcome of the last action (success message or the reason it was refused). */
export function ResultAlert({ result }: { result: Result | null }) {
  if (!result || (result.ok && !result.message)) return null
  return result.ok ? (
    <Alert>
      <CircleCheckIcon />
      <AlertDescription>{result.message}</AlertDescription>
    </Alert>
  ) : (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertDescription>{result.error}</AlertDescription>
    </Alert>
  )
}
