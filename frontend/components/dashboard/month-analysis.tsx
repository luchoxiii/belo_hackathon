'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import {
  ChevronLeft,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  ChevronDown,
  Calendar,
} from 'lucide-react'
import { formatARS } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type MonthData = {
  month: string
  label: string
  type: 'historical' | 'projection'
  summary: {
    totalIncome: number
    totalExpenses: number
    net: number
    transactionCount: number
  }
  breakdown: {
    income: Array<{
      category: string
      label: string
      amount: number
      count?: number
      confidence?: 'high' | 'medium' | 'low'
      transactions?: Array<{
        id: string
        description: string
        amount: number
        date: string
        merchant?: string
      }>
    }>
    expenses: Array<{
      category: string
      label: string
      amount: number
      count?: number
      confidence?: 'high' | 'medium' | 'low'
      transactions?: Array<{
        id: string
        description: string
        amount: number
        date: string
        merchant?: string
      }>
    }>
  }
  comparison: {
    vsAverage: {
      income: number
      incomePercent?: number
      expenses: number
      expensesPercent?: number
    }
  }
  note?: string
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getMonthLabel(date: Date): string {
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

export function MonthAnalysis() {
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  const monthKey = getMonthKey(selectedDate)
  const { data, isLoading, error } = useSWR<MonthData>(`/api/month/${monthKey}`, fetcher)

  const now = new Date()
  const isCurrentMonth = monthKey === getMonthKey(now)
  const isFuture = selectedDate > now

  function navigateMonth(direction: -1 | 1) {
    setSelectedDate(prev => {
      const next = new Date(prev)
      next.setMonth(next.getMonth() + direction)
      return next
    })
    setExpandedCategory(null)
  }

  // Generar lista de meses para selector rápido
  const quickMonths = useMemo(() => {
    const months = []
    const current = new Date()

    // 3 meses atrás
    for (let i = 3; i >= 1; i--) {
      const d = new Date(current)
      d.setMonth(d.getMonth() - i)
      months.push({ date: d, key: getMonthKey(d), label: d.toLocaleDateString('es-AR', { month: 'short' }) })
    }

    // Mes actual
    months.push({ date: current, key: getMonthKey(current), label: 'Hoy', isCurrent: true })

    // 3 meses adelante
    for (let i = 1; i <= 3; i++) {
      const d = new Date(current)
      d.setMonth(d.getMonth() + i)
      months.push({ date: d, key: getMonthKey(d), label: d.toLocaleDateString('es-AR', { month: 'short' }), isFuture: true })
    }

    return months
  }, [])

  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      {/* Header con navegación */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="size-5 text-muted-foreground" />
            <h2 className="font-semibold">Análisis mensual</h2>
          </div>
          {isFuture && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              Proyección
            </span>
          )}
        </div>

        {/* Navegación de mes */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateMonth(-1)}
            aria-label="Ir al mes anterior"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Button>

          <div className="text-center">
            <p className="text-lg font-semibold capitalize" aria-live="polite">{getMonthLabel(selectedDate)}</p>
            {isCurrentMonth && <p className="text-xs text-muted-foreground">Mes actual</p>}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateMonth(1)}
            aria-label="Ir al mes siguiente"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </Button>
        </div>

        {/* Selector rápido de meses */}
        <div className="flex justify-center gap-1" role="tablist" aria-label="Seleccionar mes">
          {quickMonths.map(m => (
            <button
              key={m.key}
              onClick={() => setSelectedDate(m.date)}
              role="tab"
              aria-selected={m.key === monthKey}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                m.key === monthKey
                  ? 'bg-primary text-primary-foreground'
                  : m.isFuture
                    ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    : 'hover:bg-muted'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      {isLoading ? (
        <div className="space-y-4" role="status" aria-busy="true" aria-label="Cargando datos del mes">
          <span className="sr-only">Cargando análisis mensual...</span>
          <div className="h-20 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
        </div>
      ) : error || !data ? (
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground" role="alert">
          <AlertCircle className="size-5" aria-hidden="true" />
          <p>No hay datos para este mes</p>
        </div>
      ) : (
        <>
          {/* Nota de proyección */}
          {data.note && (
            <div className="flex items-start gap-2 rounded-xl bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground">
              <AlertCircle className="size-4 shrink-0 text-primary mt-0.5" />
              <p>{data.note}</p>
            </div>
          )}

          {/* Resumen */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-income/5 p-3 text-center">
              <p className="text-xs text-muted-foreground">Ingresos</p>
              <p className="tabular text-lg font-semibold text-income">
                {formatARS(data.summary.totalIncome)}
              </p>
              {data.comparison.vsAverage.incomePercent !== undefined && data.comparison.vsAverage.incomePercent !== 0 && (
                <p className={cn(
                  'flex items-center justify-center gap-1 text-xs',
                  data.comparison.vsAverage.incomePercent > 0 ? 'text-income' : 'text-expense'
                )}>
                  {data.comparison.vsAverage.incomePercent > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {Math.abs(data.comparison.vsAverage.incomePercent)}% vs prom.
                </p>
              )}
            </div>

            <div className="rounded-xl bg-expense/5 p-3 text-center">
              <p className="text-xs text-muted-foreground">Gastos</p>
              <p className="tabular text-lg font-semibold text-expense">
                {formatARS(data.summary.totalExpenses)}
              </p>
              {data.comparison.vsAverage.expensesPercent !== undefined && data.comparison.vsAverage.expensesPercent !== 0 && (
                <p className={cn(
                  'flex items-center justify-center gap-1 text-xs',
                  data.comparison.vsAverage.expensesPercent < 0 ? 'text-income' : 'text-expense'
                )}>
                  {data.comparison.vsAverage.expensesPercent > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {Math.abs(data.comparison.vsAverage.expensesPercent)}% vs prom.
                </p>
              )}
            </div>

            <div className={cn(
              'rounded-xl p-3 text-center',
              data.summary.net >= 0 ? 'bg-income/5' : 'bg-expense/5'
            )}>
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className={cn(
                'tabular text-lg font-semibold',
                data.summary.net >= 0 ? 'text-income' : 'text-expense'
              )}>
                {data.summary.net >= 0 ? '+' : ''}{formatARS(data.summary.net)}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.summary.transactionCount} mov.
              </p>
            </div>
          </div>

          {/* Breakdown de gastos */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Detalle de gastos</h3>
            <div className="space-y-1" role="list" aria-label="Lista de categorías de gastos">
              {data.breakdown.expenses.slice(0, 8).map(cat => (
                <CategoryRow
                  key={cat.category}
                  category={cat}
                  categoryId={`expense-${cat.category}`}
                  isProjection={data.type === 'projection'}
                  expanded={expandedCategory === cat.category}
                  onToggle={() => setExpandedCategory(
                    expandedCategory === cat.category ? null : cat.category
                  )}
                  total={data.summary.totalExpenses}
                />
              ))}
            </div>
            {data.breakdown.expenses.length > 8 && (
              <p className="text-center text-xs text-muted-foreground">
                +{data.breakdown.expenses.length - 8} categorías más
              </p>
            )}
          </div>

          {/* Breakdown de ingresos */}
          {data.breakdown.income.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Detalle de ingresos</h3>
              <div className="space-y-1" role="list" aria-label="Lista de categorías de ingresos">
                {data.breakdown.income.map(cat => (
                  <CategoryRow
                    key={cat.category}
                    category={cat}
                    categoryId={`income-${cat.category}`}
                    isProjection={data.type === 'projection'}
                    expanded={expandedCategory === `income-${cat.category}`}
                    onToggle={() => setExpandedCategory(
                      expandedCategory === `income-${cat.category}` ? null : `income-${cat.category}`
                    )}
                    total={data.summary.totalIncome}
                    isIncome
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function CategoryRow({
  category,
  isProjection,
  expanded,
  onToggle,
  total,
  isIncome = false,
  categoryId,
}: {
  category: {
    label: string
    amount: number
    count?: number
    confidence?: 'high' | 'medium' | 'low'
    transactions?: Array<{
      id: string
      description: string
      amount: number
      date: string
      merchant?: string
    }>
  }
  isProjection: boolean
  expanded: boolean
  onToggle: () => void
  total: number
  isIncome?: boolean
  categoryId: string
}) {
  const percentage = total > 0 ? (category.amount / total) * 100 : 0
  const hasDetails = category.transactions && category.transactions.length > 0
  const panelId = `category-panel-${categoryId}`

  return (
    <div className="rounded-lg border bg-background/50">
      <button
        onClick={onToggle}
        disabled={!hasDetails && !isProjection}
        aria-expanded={hasDetails ? expanded : undefined}
        aria-controls={hasDetails ? panelId : undefined}
        className={cn(
          'flex w-full items-center gap-3 p-3 text-left transition-colors',
          (hasDetails || isProjection) && 'hover:bg-muted/50'
        )}
      >
        <div
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full',
            isIncome ? 'bg-income/10 text-income' : 'bg-muted text-muted-foreground'
          )}
          aria-hidden="true"
        >
          {isIncome ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{category.label}</span>
            {isProjection && category.confidence && (
              <span className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                category.confidence === 'high' ? 'bg-income/10 text-income' :
                category.confidence === 'medium' ? 'bg-amber-500/10 text-amber-500' :
                'bg-muted text-muted-foreground'
              )}>
                {category.confidence === 'high' ? 'Fijo' :
                 category.confidence === 'medium' ? 'Variable' : 'Estimado'}
              </span>
            )}
          </div>
          {!isProjection && category.count && (
            <span className="text-xs text-muted-foreground">
              {category.count} {category.count === 1 ? 'movimiento' : 'movimientos'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className={cn('tabular text-sm font-semibold', isIncome && 'text-income')}>
              {formatARS(category.amount)}
            </p>
            <p className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</p>
          </div>
          {hasDetails && (
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground transition-transform',
                expanded && 'rotate-180'
              )}
              aria-hidden="true"
            />
          )}
        </div>
      </button>

      {/* Transacciones expandidas */}
      {expanded && hasDetails && (
        <div id={panelId} className="border-t bg-muted/30 px-3 py-2" role="region" aria-label={`Transacciones de ${category.label}`}>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {category.transactions!.map(tx => (
              <li key={tx.id} className="flex items-center justify-between text-xs">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{tx.description}</p>
                  <p className="text-muted-foreground">
                    {tx.merchant && `${tx.merchant} · `}
                    {new Date(tx.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <p className={cn('tabular font-medium', isIncome && 'text-income')}>
                  {formatARS(tx.amount)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
