import type { ReactNode } from 'react'
import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

interface MetricCardProps {
  label: string
  value: ReactNode
  /** Short delta shown as a badge; `good` decides the trend icon and color. */
  delta?: string
  good?: boolean
  footer: ReactNode
}

export function MetricCard({ label, value, delta, good, footer }: MetricCardProps) {
  const Icon = good ? TrendingUpIcon : TrendingDownIcon
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
        {delta && (
          <CardAction>
            <Badge variant={good ? 'outline' : 'destructive'}>
              <Icon />
              {delta}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardFooter className="text-sm text-muted-foreground">{footer}</CardFooter>
    </Card>
  )
}

export const MetricGrid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
)
