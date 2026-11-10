'use client'

import useSWR from 'swr'
import { TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type IPCResponse = {
  current: {
    month: string
    monthlyVariation: number
    yearOverYear?: number
    source: string
  }
  averages: {
    last3Months: number
    last6Months: number
    last12Months: number
  }
  yearToDate: {
    accumulated: number
    year: number
  }
  history: Array<{
    month: string
    label: string
    value: number
    source: string
  }>
}

export function IPCIndicator() {
  const { data, isLoading } = useSWR<IPCResponse>('/api/ipc', fetcher, {
    revalidateOnFocus: false,
  })

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-card p-5">
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  if (!data) return null

  const trend = data.current.monthlyVariation > data.averages.last3Months ? 'up' :
                data.current.monthlyVariation < data.averages.last3Months ? 'down' : 'stable'

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">IPC INDEC</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="tabular text-3xl font-semibold">
              {data.current.monthlyVariation}%
            </span>
            <span className="text-sm text-muted-foreground">mensual</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(data.current.month + '-01').toLocaleDateString('es-AR', {
              month: 'long',
              year: 'numeric',
            })}
            {data.current.source === 'estimate' && ' (estimado)'}
          </p>
        </div>

        <div className={cn(
          'flex size-10 items-center justify-center rounded-full',
          trend === 'down' ? 'bg-income/10 text-income' :
          trend === 'up' ? 'bg-expense/10 text-expense' :
          'bg-muted text-muted-foreground'
        )}>
          <TrendIcon className="size-5" />
        </div>
      </div>

      {/* Mini chart */}
      <div className="mt-4 flex items-end gap-0.5 h-12">
        {data.history.slice(-12).map((point, i) => {
          const maxValue = Math.max(...data.history.map(p => p.value))
          const height = (point.value / maxValue) * 100

          return (
            <div
              key={point.month}
              className="group relative flex-1"
            >
              <div
                className={cn(
                  'rounded-t transition-colors',
                  i === data.history.slice(-12).length - 1
                    ? 'bg-primary'
                    : 'bg-muted hover:bg-muted-foreground/30'
                )}
                style={{ height: `${height}%` }}
              />
              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded bg-popover px-2 py-1 text-xs shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border">
                <p className="font-medium">{point.value}%</p>
                <p className="text-muted-foreground">{point.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Prom. 3m</p>
          <p className="tabular text-sm font-medium">{data.averages.last3Months}%</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Acum. {data.yearToDate.year}</p>
          <p className="tabular text-sm font-medium">{data.yearToDate.accumulated}%</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Interanual</p>
          <p className="tabular text-sm font-medium">
            {data.current.yearOverYear ? `${data.current.yearOverYear}%` : '-'}
          </p>
        </div>
      </div>

      {/* Link to INDEC */}
      <a
        href="https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-5-31"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Fuente: INDEC
        <ExternalLink className="size-3" />
      </a>
    </section>
  )
}
