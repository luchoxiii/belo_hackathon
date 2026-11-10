'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  Sparkles,
  ChevronRight,
} from 'lucide-react'
import { formatARS } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { MonthAnalysis } from './month-analysis'
import { IPCIndicator } from './ipc-indicator'

const fetcher = (url: string) => fetch(url).then(r => r.json())

// Colores vibrantes para el gráfico de categorías
const CATEGORY_COLORS = [
  '#F97068', // coral
  '#0D9488', // teal
  '#8B5CF6', // purple
  '#F59E0B', // amber
  '#EC4899', // pink
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F472B6', // rose
  '#6366F1', // indigo
  '#14B8A6', // teal light
]

type StatsResponse = {
  profile: { name: string; family: string[] }
  currentBalance: number
  stats: {
    totalTransactions: number
    totalIncome: number
    totalExpenses: number
    avgMonthlyIncome: number
    avgMonthlyExpenses: number
    savingsRate: number
  }
  charts: {
    monthly: Array<{ month: string; label: string; income: number; expenses: number; net: number }>
    categories: Array<{ category: string; label: string; value: number; count: number }>
    balance: Array<{ date: string; balance: number }>
  }
  recent: Array<{
    id: string
    type: 'credit' | 'debit'
    category: string
    categoryLabel: string
    amount: number
    amountArs: number
    description: string
    merchant?: string
    createdAt: string
  }>
  insights: Array<{
    type: string
    title: string
    description: string
    action: string
  }>
  accounts: Array<{ name: string; currency: string; balance: number }>
}

export function DashboardView() {
  const { data, isLoading, error } = useSWR<StatsResponse>('/api/stats', fetcher, {
    revalidateOnFocus: false,
  })

  if (isLoading) {
    return <DashboardSkeleton />
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center card-premium p-8" role="alert">
          <p className="text-lg font-heading font-semibold">No hay datos disponibles</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Ejecutá <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">npm run generate-mock-data</code> para generar datos de prueba.
          </p>
        </div>
      </div>
    )
  }

  const maxMonthlyValue = Math.max(
    ...data.charts.monthly.map(m => Math.max(m.income, m.expenses))
  )

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-4 pb-24 md:p-8">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Hola, {data.profile.name.split(' ')[0]}</p>
        <h1 className="font-heading text-3xl font-semibold md:text-4xl">Tu resumen financiero</h1>
      </header>

      {/* Hero Balance Card */}
      <section className="card-premium p-6 md:p-8 bg-gradient-to-br from-primary/5 via-card to-card">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Saldo disponible</p>
            <p className="tabular font-heading text-4xl md:text-5xl font-semibold">
              {formatARS(data.currentBalance)}
            </p>
            {data.stats.savingsRate > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-income/10 px-3 py-1.5 text-sm font-medium text-income">
                <TrendingUp className="size-4" />
                Ahorrás {data.stats.savingsRate}% de tus ingresos
              </div>
            )}
          </div>
          <div className="flex gap-4">
            <StatMini
              label="Ingresos/mes"
              value={formatARS(data.stats.avgMonthlyIncome)}
              icon={ArrowDownLeft}
              iconClassName="text-income bg-income/10"
            />
            <StatMini
              label="Gastos/mes"
              value={formatARS(data.stats.avgMonthlyExpenses)}
              icon={ArrowUpRight}
              iconClassName="text-primary bg-primary/10"
            />
          </div>
        </div>
      </section>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Income vs Expenses - Custom Bar Chart */}
        <section className="card-premium p-6" aria-labelledby="chart-monthly-title">
          <div className="mb-6">
            <h2 id="chart-monthly-title" className="font-heading text-lg font-semibold">Ingresos vs Gastos</h2>
            <p className="text-xs text-muted-foreground">Últimos {data.charts.monthly.length} meses</p>
          </div>

          {/* Screen reader accessible table */}
          <table className="sr-only">
            <caption>Comparación de ingresos y gastos mensuales</caption>
            <thead>
              <tr>
                <th scope="col">Mes</th>
                <th scope="col">Ingresos</th>
                <th scope="col">Gastos</th>
                <th scope="col">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.charts.monthly.slice(-8).map((month) => (
                <tr key={month.month}>
                  <td>{month.label}</td>
                  <td>{formatARS(month.income)}</td>
                  <td>{formatARS(month.expenses)}</td>
                  <td>{formatARS(month.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Custom Bar Chart - Visual only */}
          <div
            className="flex items-end gap-2 h-48"
            role="img"
            aria-label={`Gráfico de barras: ingresos y gastos de los últimos ${data.charts.monthly.slice(-8).length} meses`}
            aria-hidden="false"
          >
            {data.charts.monthly.slice(-8).map((month, i) => {
              const incomeHeight = (month.income / maxMonthlyValue) * 100
              const expenseHeight = (month.expenses / maxMonthlyValue) * 100
              return (
                <div key={month.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-0.5 items-end h-40">
                    {/* Income bar */}
                    <div
                      className="flex-1 rounded-t-lg bg-gradient-to-t from-income to-income/70 transition-all hover:from-income/90 hover:to-income/60"
                      style={{ height: `${incomeHeight}%` }}
                      aria-hidden="true"
                    />
                    {/* Expense bar */}
                    <div
                      className="flex-1 rounded-t-lg bg-gradient-to-t from-primary to-primary/70 transition-all hover:from-primary/90 hover:to-primary/60"
                      style={{ height: `${expenseHeight}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground" aria-hidden="true">{month.label.split(' ')[0]}</span>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex justify-center gap-6 mt-4 text-xs" aria-hidden="true">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-sm bg-gradient-to-t from-income to-income/70" />
              <span className="text-muted-foreground">Ingresos</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-sm bg-gradient-to-t from-primary to-primary/70" />
              <span className="text-muted-foreground">Gastos</span>
            </div>
          </div>
        </section>

        {/* Categories Donut */}
        <section className="card-premium p-6" aria-labelledby="chart-categories-title">
          <div className="mb-6">
            <h2 id="chart-categories-title" className="font-heading text-lg font-semibold">Gastos por categoría</h2>
            <p className="text-xs text-muted-foreground">Top categorías</p>
          </div>

          {/* Screen reader accessible table */}
          <table className="sr-only">
            <caption>Distribución de gastos por categoría</caption>
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                <th scope="col">Monto</th>
                <th scope="col">Porcentaje</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const total = data.charts.categories.reduce((sum, c) => sum + c.value, 0)
                return data.charts.categories.slice(0, 6).map((cat) => (
                  <tr key={cat.category}>
                    <td>{cat.label}</td>
                    <td>{formatARS(cat.value)}</td>
                    <td>{((cat.value / total) * 100).toFixed(1)}%</td>
                  </tr>
                ))
              })()}
            </tbody>
          </table>

          <div className="flex items-center gap-6">
            {/* Custom Donut Chart - Visual only */}
            <div className="relative w-40 h-40 shrink-0">
              <svg
                viewBox="0 0 100 100"
                className="w-full h-full -rotate-90"
                role="img"
                aria-label="Gráfico circular de gastos por categoría"
                focusable="false"
              >
                {(() => {
                  const total = data.charts.categories.reduce((sum, c) => sum + c.value, 0)
                  let currentAngle = 0
                  return data.charts.categories.slice(0, 6).map((cat, i) => {
                    const percentage = cat.value / total
                    const angle = percentage * 360
                    const startAngle = currentAngle
                    currentAngle += angle

                    const startRad = (startAngle * Math.PI) / 180
                    const endRad = ((startAngle + angle) * Math.PI) / 180

                    const x1 = 50 + 40 * Math.cos(startRad)
                    const y1 = 50 + 40 * Math.sin(startRad)
                    const x2 = 50 + 40 * Math.cos(endRad)
                    const y2 = 50 + 40 * Math.sin(endRad)

                    const largeArc = angle > 180 ? 1 : 0

                    return (
                      <path
                        key={cat.category}
                        d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                        fill={CATEGORY_COLORS[i]}
                        className="transition-opacity hover:opacity-80 cursor-pointer"
                        strokeWidth="0.5"
                        stroke="#FDF8F3"
                        aria-hidden="true"
                      />
                    )
                  })
                })()}
                {/* Center circle for donut effect */}
                <circle cx="50" cy="50" r="25" fill="#FDF8F3" aria-hidden="true" />
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
                <span className="text-xs text-muted-foreground">Total</span>
                <span className="tabular font-heading text-sm font-semibold">
                  {formatARS(data.charts.categories.reduce((sum, c) => sum + c.value, 0))}
                </span>
              </div>
            </div>

            {/* Legend */}
            <ul className="flex flex-col gap-2 flex-1" aria-label="Leyenda de categorías">
              {data.charts.categories.slice(0, 6).map((cat, i) => (
                <li key={cat.category} className="flex items-center gap-2">
                  <span
                    className="size-3 rounded-full shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[i] }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-xs truncate">{cat.label}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    {formatARS(cat.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* Month Analysis + IPC */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MonthAnalysis />
        </div>
        <IPCIndicator />
      </div>

      {/* Recent Transactions */}
      <section className="card-premium">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="font-heading text-lg font-semibold">Últimos movimientos</h2>
            <p className="text-xs text-muted-foreground">
              {data.stats.totalTransactions.toLocaleString()} transacciones totales
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs">
            Ver todos
            <ChevronRight className="ml-1 size-3" />
          </Button>
        </div>
        <div className="divide-y divide-border">
          {data.recent.slice(0, 8).map((tx) => (
            <div key={tx.id} className="flex items-center gap-4 p-4 hover:bg-secondary/50 transition-colors">
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl',
                  tx.type === 'credit' ? 'bg-income/10 text-income' : 'bg-secondary text-muted-foreground'
                )}
              >
                {tx.type === 'credit' ? (
                  <ArrowDownLeft className="size-5" />
                ) : (
                  <ArrowUpRight className="size-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{tx.description}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {tx.categoryLabel} · {new Date(tx.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <p
                className={cn(
                  'tabular font-semibold',
                  tx.type === 'credit' ? 'text-income' : ''
                )}
              >
                {tx.type === 'credit' ? '+' : '-'}{formatARS(tx.amountArs)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Insights */}
      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold">Insights para vos</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {data.insights.map((insight, i) => (
            <div
              key={i}
              className={cn(
                'card-premium-hover flex items-start gap-4 p-5',
                insight.type === 'positive' && 'border-income/30 bg-income/5',
                insight.type === 'warning' && 'border-primary/30 bg-primary/5'
              )}
            >
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl',
                  insight.type === 'positive' ? 'bg-income/10 text-income' :
                  insight.type === 'warning' ? 'bg-primary/10 text-primary' :
                  'bg-accent/10 text-accent'
                )}
              >
                {insight.type === 'positive' ? <TrendingUp className="size-5" /> :
                 insight.type === 'warning' ? <TrendingDown className="size-5" /> :
                 <Sparkles className="size-5" />}
              </div>
              <div className="flex-1">
                <h3 className="font-medium">{insight.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{insight.description}</p>
                <Button variant="link" size="sm" className="mt-2 h-auto p-0 text-xs">
                  {insight.action}
                  <ChevronRight className="ml-0.5 size-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function StatMini({
  label,
  value,
  icon: Icon,
  iconClassName,
}: {
  label: string
  value: string
  icon: typeof Wallet
  iconClassName?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-secondary/50 p-4">
      <div className={cn('flex size-10 items-center justify-center rounded-xl', iconClassName)}>
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="tabular font-heading text-lg font-semibold">{value}</p>
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-4 md:p-8"
      role="status"
      aria-busy="true"
      aria-label="Cargando panel financiero"
    >
      <span className="sr-only">Cargando tu información financiera...</span>
      <div className="h-10 w-64 animate-pulse rounded-lg bg-secondary" aria-hidden="true" />
      <div className="h-40 animate-pulse rounded-2xl bg-secondary" aria-hidden="true" />
      <div className="grid gap-6 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-72 animate-pulse rounded-2xl bg-secondary" aria-hidden="true" />
        ))}
      </div>
    </div>
  )
}
