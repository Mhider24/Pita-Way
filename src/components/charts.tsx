import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { money } from '@/lib/utils'

export interface SalesRow {
  hour: string
  forecast: number
  actual: number | null
}

export interface StaffRow {
  hour: string
  lead: number
  cook: number
  prep: number
  required: number
}

const salesConfig = {
  actual: { label: 'Actual', color: 'var(--chart-1)' },
  forecast: { label: 'Forecast', color: 'var(--foreground)' },
} satisfies ChartConfig

const staffConfig = {
  lead: { label: 'Shift Lead', color: 'var(--chart-1)' },
  cook: { label: 'Line Cook', color: 'var(--chart-2)' },
  prep: { label: 'Prep Cook', color: 'var(--chart-3)' },
  required: { label: 'Required', color: 'var(--foreground)' },
} satisfies ChartConfig

const xAxis = <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />

/** Hourly actuals (bars, closed hours only) against the forecast line, in dollars or orders. */
export function SalesChart({ data, className = 'h-64', unit = 'money' }: { data: SalesRow[]; className?: string; unit?: 'money' | 'orders' }) {
  const fmt = (v: number) => (unit === 'money' ? money(v) : `${Math.round(v)}`)
  return (
    <ChartContainer config={salesConfig} className={`${className} w-full`}>
      <ComposedChart data={data} margin={{ left: 0, right: 8 }}>
        <CartesianGrid vertical={false} />
        {xAxis}
        <YAxis width={48} tickLine={false} axisLine={false} tickFormatter={fmt} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => `${salesConfig[name as keyof typeof salesConfig]?.label ?? name}: ${fmt(Number(v))}${unit === 'orders' ? ' orders' : ''}`} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="actual" fill="var(--color-actual)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line dataKey="forecast" stroke="var(--color-forecast)" strokeWidth={2} dot={false} type="linear" />
      </ComposedChart>
    </ChartContainer>
  )
}

/** Staff on shift by role (stacked) against the requirement. */
export function StaffingChart({ data, className = 'h-64' }: { data: StaffRow[]; className?: string }) {
  return (
    <ChartContainer config={staffConfig} className={`${className} w-full`}>
      <ComposedChart data={data} margin={{ left: 0, right: 8 }}>
        <CartesianGrid vertical={false} />
        {xAxis}
        <YAxis width={32} tickLine={false} axisLine={false} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="lead" stackId="staff" fill="var(--color-lead)" maxBarSize={28} />
        <Bar dataKey="cook" stackId="staff" fill="var(--color-cook)" maxBarSize={28} />
        <Bar dataKey="prep" stackId="staff" fill="var(--color-prep)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line dataKey="required" stroke="var(--color-required)" strokeWidth={2} strokeDasharray="4 4" dot={false} type="stepAfter" />
      </ComposedChart>
    </ChartContainer>
  )
}
