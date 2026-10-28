'use client'

import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatARS, formatCompactARS } from '@/lib/format'
import type { MonthProjection } from '@/lib/projection'

const config = {
  balance: { label: 'Saldo proyectado', color: 'var(--chart-1)' },
} satisfies ChartConfig

export function ProjectionChart({
  startBalance,
  months,
}: {
  startBalance?: number
  months?: MonthProjection[]
}) {
  const data =
    startBalance !== undefined && months
      ? [{ label: 'Hoy', balance: startBalance }, ...months.map((m) => ({ label: m.label, balance: m.balance }))]
      : []

  return (
    <section aria-label="Proyección de saldo a 12 meses" className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="mb-4 flex flex-col gap-0.5">
        <h2 className="text-base font-semibold">Proyección a 12 meses</h2>
        <p className="text-xs text-muted-foreground">Saldo al cierre de cada mes, con inflación.</p>
      </div>

      {data.length === 0 ? (
        <div className="h-60 animate-pulse rounded-xl bg-muted" aria-label="Cargando gráfico" />
      ) : (
        <ChartContainer config={config} className="h-60 w-full">
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="fillBalance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-balance)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--color-balance)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              interval="preserveStartEnd"
            />
            <YAxis
              width={52}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatCompactARS(v)}
            />
            <ReferenceLine y={0} stroke="var(--expense)" strokeDasharray="4 4" />
            <ChartTooltip
              cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  formatter={(value) => (
                    <span className="tabular font-medium text-foreground">{formatARS(Number(value))}</span>
                  )}
                />
              }
            />
            <Area
              dataKey="balance"
              type="monotone"
              stroke="var(--color-balance)"
              strokeWidth={2.5}
              fill="url(#fillBalance)"
            />
          </AreaChart>
        </ChartContainer>
      )}
    </section>
  )
}
