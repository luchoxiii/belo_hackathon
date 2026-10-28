'use client'

import { useEffect, useState } from 'react'
import {
  X,
  TrendingUp,
  TrendingDown,
  Calendar,
  CreditCard,
  DollarSign,
  Clock,
  BarChart3,
} from 'lucide-react'
import { formatARS } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type PaymentRecord = {
  id: string
  date: string
  amount: number
  description: string
  method: string
}

type ExpenseStats = {
  totalPayments: number
  totalAmount: number
  avgAmount: number
  minAmount: number
  maxAmount: number
  firstPaymentDate: string
  lastPaymentDate: string
  monthsSubscribed: number
  priceVariation: number
}

type MonthlyHistory = {
  month: string
  label: string
  amount: number
  count: number
}

type ExpenseHistoryResponse = {
  found: boolean
  name: string
  category: string
  payments: PaymentRecord[]
  stats: ExpenseStats | null
  monthlyHistory: MonthlyHistory[]
}

type Props = {
  expenseName: string
  onClose: () => void
}

export function ExpenseDetailModal({ expenseName, onClose }: Props) {
  const [data, setData] = useState<ExpenseHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch(`/api/expense-history?name=${encodeURIComponent(expenseName)}`)
        if (!res.ok) throw new Error('Error al cargar historial')
        const json = await res.json()
        setData(json)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [expenseName])

  // Cerrar con Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-card border shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4 md:p-6">
          <div>
            <h2 className="text-xl font-semibold">{expenseName}</h2>
            <p className="text-sm text-muted-foreground">Historial de pagos</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-4 md:p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="mt-4 text-sm text-muted-foreground">Cargando historial...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-destructive">{error}</p>
            </div>
          )}

          {data && !data.found && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground">
                No se encontraron pagos históricos para "{expenseName}"
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                El historial se construye con los datos de transacciones disponibles.
              </p>
            </div>
          )}

          {data?.found && data.stats && (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                <StatCard
                  label="Total pagos"
                  value={data.stats.totalPayments.toString()}
                  icon={CreditCard}
                  className="bg-primary/5 border-primary/20"
                />
                <StatCard
                  label="Meses suscripto"
                  value={`${data.stats.monthsSubscribed} meses`}
                  icon={Clock}
                  className="bg-blue-500/5 border-blue-500/20"
                />
                <StatCard
                  label="Total gastado"
                  value={formatARS(data.stats.totalAmount)}
                  icon={DollarSign}
                  className="bg-amber-500/5 border-amber-500/20"
                />
                <StatCard
                  label="Variación precio"
                  value={`${data.stats.priceVariation > 0 ? '+' : ''}${data.stats.priceVariation}%`}
                  icon={data.stats.priceVariation > 0 ? TrendingUp : TrendingDown}
                  className={cn(
                    data.stats.priceVariation > 0
                      ? 'bg-expense/5 border-expense/20'
                      : 'bg-income/5 border-income/20'
                  )}
                  valueClassName={data.stats.priceVariation > 0 ? 'text-expense' : 'text-income'}
                />
              </div>

              {/* Price Range */}
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Rango de precios</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Mínimo</p>
                    <p className="tabular font-semibold text-income">{formatARS(data.stats.minAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Promedio</p>
                    <p className="tabular font-semibold">{formatARS(data.stats.avgAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Máximo</p>
                    <p className="tabular font-semibold text-expense">{formatARS(data.stats.maxAmount)}</p>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Período</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Primer pago</p>
                    <p className="font-medium">
                      {new Date(data.stats.firstPaymentDate).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="flex-1 mx-4 border-t border-dashed border-muted-foreground/30" />
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Último pago</p>
                    <p className="font-medium">
                      {new Date(data.stats.lastPaymentDate).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Monthly History Chart */}
              {data.monthlyHistory.length > 0 && (
                <div className="rounded-xl border p-4">
                  <h3 className="text-sm font-medium mb-4">Evolución mensual</h3>
                  <div className="flex items-end gap-1.5">
                    {(() => {
                      const history = data.monthlyHistory.slice(-12)
                      const maxAmount = Math.max(...history.map(m => m.amount))
                      const minAmount = Math.min(...history.map(m => m.amount))
                      // If all amounts are equal, show all bars at 80% height
                      const allEqual = maxAmount === minAmount

                      return history.map((month) => {
                        const height = allEqual ? 80 : ((month.amount - minAmount) / (maxAmount - minAmount) * 70) + 30
                        return (
                          <div
                            key={month.month}
                            className="flex-1 flex flex-col items-center gap-1"
                          >
                            <div className="w-full h-28 flex items-end">
                              <div
                                className="w-full bg-gradient-to-t from-primary to-primary/70 rounded-t transition-all hover:from-primary/90 hover:to-primary/60 cursor-pointer min-h-[8px]"
                                style={{ height: `${height}%` }}
                                title={`${month.label}: ${formatARS(month.amount)}`}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                              {month.label.split(' ')[0]}
                            </span>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>
              )}

              {/* Recent Payments */}
              <div className="rounded-xl border">
                <div className="border-b p-4">
                  <h3 className="text-sm font-medium">Últimos pagos</h3>
                </div>
                <div className="divide-y max-h-64 overflow-y-auto">
                  {data.payments.slice().reverse().slice(0, 12).map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between p-3 text-sm">
                      <div>
                        <p className="font-medium">
                          {new Date(payment.date).toLocaleDateString('es-AR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {payment.method.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <p className="tabular font-semibold">{formatARS(payment.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  className,
  valueClassName,
}: {
  label: string
  value: string
  icon: typeof CreditCard
  className?: string
  valueClassName?: string
}) {
  return (
    <div className={cn('rounded-xl border p-3', className)}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={cn('tabular text-lg font-semibold', valueClassName)}>{value}</p>
    </div>
  )
}
