'use client'

import { useState } from 'react'
import {
  Plus,
  TrendingUp,
  Calendar,
  Home,
  Zap,
  Heart,
  GraduationCap,
  Tv,
  Shield,
  Landmark,
  Repeat,
  MoreHorizontal,
  Car,
  ChevronRight,
  AlertCircle,
  Edit2,
  Trash2,
  RefreshCw,
  History,
} from 'lucide-react'
import { useRecurringExpenses } from '@/lib/recurring-expenses'
import { formatARS } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  RECURRING_EXPENSE_CATEGORIES,
  ADJUSTMENT_FREQUENCY_LABELS,
  ADJUSTMENT_TYPE_LABELS,
  type RecurringExpense,
} from '@/lib/recurring-expenses/types'
import { getAverageIPC } from '@/lib/recurring-expenses/ipc-data'
import { RecurringExpenseForm } from './recurring-expense-form'
import { ExpenseDetailModal } from './expense-detail-modal'

const CATEGORY_ICONS: Record<string, typeof Home> = {
  vivienda: Home,
  servicios: Zap,
  transporte: Car,
  salud: Heart,
  educacion: GraduationCap,
  entretenimiento: Tv,
  seguros: Shield,
  impuestos: Landmark,
  suscripciones: Repeat,
  otros: MoreHorizontal,
}

export function RecurringExpensesView() {
  const {
    recurringExpenses,
    scheduledExpenses,
    ipcHistory,
    settings,
    hydrated,
    removeRecurringExpense,
    getMonthlyProjection,
  } = useRecurringExpenses()

  const [showForm, setShowForm] = useState(false)
  const [editingExpense, setEditingExpense] = useState<RecurringExpense | null>(null)
  const [detailExpenseName, setDetailExpenseName] = useState<string | null>(null)

  if (!hydrated) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    )
  }

  const avgIPC = getAverageIPC(3, ipcHistory)
  const latestIPC = ipcHistory[ipcHistory.length - 1]

  // Calcular totales
  const monthlyTotal = recurringExpenses.reduce((sum, e) => {
    if (e.paymentFrequency === 'monthly') return sum + e.baseAmount
    if (e.paymentFrequency === 'bimonthly') return sum + e.baseAmount / 2
    if (e.paymentFrequency === 'quarterly') return sum + e.baseAmount / 3
    if (e.paymentFrequency === 'semester') return sum + e.baseAmount / 6
    if (e.paymentFrequency === 'yearly') return sum + e.baseAmount / 12
    return sum
  }, 0)

  // Próximas renovaciones (próximos 6 meses)
  const upcomingRenewals = scheduledExpenses
    .filter(s => {
      const date = new Date(s.scheduledDate)
      const sixMonthsFromNow = new Date()
      sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)
      return date <= sixMonthsFromNow && s.status === 'pending'
    })
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))

  // Próximo mes proyección
  const nextMonth = new Date()
  nextMonth.setMonth(nextMonth.getMonth() + 1)
  const nextMonthKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`
  const nextMonthProjection = getMonthlyProjection(nextMonthKey)

  // Agrupar por categoría
  const byCategory = recurringExpenses.reduce((acc, expense) => {
    const cat = expense.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(expense)
    return acc
  }, {} as Record<string, RecurringExpense[]>)

  function handleEdit(expense: RecurringExpense) {
    setEditingExpense(expense)
    setShowForm(true)
  }

  function handleDelete(id: string) {
    if (confirm('¿Estás seguro de eliminar este gasto?')) {
      removeRecurringExpense(id)
    }
  }

  function handleCloseForm() {
    setShowForm(false)
    setEditingExpense(null)
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 pb-24 md:p-8">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Gastos Fijos</h1>
          <p className="text-sm text-muted-foreground">
            Administrá tus gastos recurrentes y reglas de ajuste
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="size-4" />
          Agregar
        </Button>
      </header>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Monthly Total */}
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Total mensual estimado</p>
          <p className="tabular mt-1 text-2xl font-semibold">{formatARS(monthlyTotal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {recurringExpenses.length} gastos fijos
          </p>
        </div>

        {/* IPC Card */}
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">IPC Actual</p>
            <TrendingUp className="size-4 text-primary" />
          </div>
          <p className="tabular mt-1 text-2xl font-semibold">{latestIPC?.monthlyVariation}%</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {latestIPC?.month} · Promedio 3m: {avgIPC.toFixed(1)}%
          </p>
        </div>

        {/* Next Month Projection */}
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Proyección próximo mes</p>
            <Calendar className="size-4 text-primary" />
          </div>
          <p className="tabular mt-1 text-2xl font-semibold">
            {formatARS(nextMonthProjection.totalRecurring + nextMonthProjection.totalScheduled)}
          </p>
          {nextMonthProjection.totalScheduled > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Incluye {formatARS(nextMonthProjection.totalScheduled)} en gastos únicos
            </p>
          )}
        </div>
      </div>

      {/* Upcoming Renewals */}
      {upcomingRenewals.length > 0 && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="size-5 text-amber-500" />
            <h2 className="font-semibold">Próximos gastos importantes</h2>
          </div>
          <div className="space-y-3">
            {upcomingRenewals.slice(0, 5).map(expense => (
              <div
                key={expense.id}
                className="flex items-center justify-between rounded-lg bg-background/50 p-3"
              >
                <div>
                  <p className="text-sm font-medium">{expense.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(expense.scheduledDate).toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
                <p className="tabular text-sm font-semibold text-amber-500">
                  {formatARS(expense.amount)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Expenses by Category */}
      <section className="space-y-4">
        <h2 className="font-semibold">Gastos por categoría</h2>

        {Object.entries(byCategory).map(([category, expenses]) => {
          const categoryInfo = RECURRING_EXPENSE_CATEGORIES[category as keyof typeof RECURRING_EXPENSE_CATEGORIES]
          const Icon = CATEGORY_ICONS[category] || MoreHorizontal
          const categoryTotal = expenses.reduce((sum, e) => sum + e.baseAmount, 0)

          return (
            <div key={category} className="rounded-2xl border bg-card">
              {/* Category Header */}
              <div className="flex items-center gap-3 border-b p-4">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{categoryInfo?.label || category}</p>
                  <p className="text-xs text-muted-foreground">
                    {expenses.length} {expenses.length === 1 ? 'gasto' : 'gastos'}
                  </p>
                </div>
                <p className="tabular text-sm font-semibold">{formatARS(categoryTotal)}</p>
              </div>

              {/* Expenses List */}
              <div className="divide-y">
                {expenses.map(expense => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    onEdit={() => handleEdit(expense)}
                    onDelete={() => handleDelete(expense.id)}
                    onViewHistory={() => setDetailExpenseName(expense.name)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </section>

      {/* Empty State */}
      {recurringExpenses.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border bg-card p-12 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-muted">
            <Repeat className="size-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 font-semibold">No hay gastos fijos</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Agregá tus gastos recurrentes para proyectar tu situación financiera
          </p>
          <Button className="mt-4" onClick={() => setShowForm(true)}>
            <Plus className="size-4" />
            Agregar gasto fijo
          </Button>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <RecurringExpenseForm
          expense={editingExpense}
          onClose={handleCloseForm}
        />
      )}

      {/* Detail Modal */}
      {detailExpenseName && (
        <ExpenseDetailModal
          expenseName={detailExpenseName}
          onClose={() => setDetailExpenseName(null)}
        />
      )}
    </div>
  )
}

function ExpenseRow({
  expense,
  onEdit,
  onDelete,
  onViewHistory,
}: {
  expense: RecurringExpense
  onEdit: () => void
  onDelete: () => void
  onViewHistory: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const hasRenewal = !!expense.renewalRule
  const hasAdjustment = expense.adjustmentRule && expense.adjustmentRule.type !== 'none'

  return (
    <div className="group">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{expense.name}</span>
            {hasAdjustment && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {expense.adjustmentRule!.type === 'ipc' ? 'IPC' : `${expense.adjustmentRule!.value}%`}
              </span>
            )}
            {hasRenewal && (
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                Renovación
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {expense.description || (hasAdjustment && expense.adjustmentRule?.frequency
              ? `Ajuste ${ADJUSTMENT_FREQUENCY_LABELS[expense.adjustmentRule.frequency].toLowerCase()}`
              : 'Sin ajuste')}
          </p>
        </div>

        <p className="tabular text-sm font-semibold">{formatARS(expense.baseAmount)}</p>

        <ChevronRight
          className={cn(
            'size-4 text-muted-foreground transition-transform',
            expanded && 'rotate-90'
          )}
        />
      </button>

      {expanded && (
        <div className="border-t bg-muted/30 p-4">
          <div className="grid gap-4 text-sm md:grid-cols-2">
            {/* Payment Info */}
            <div>
              <p className="text-xs font-medium text-muted-foreground">Pago</p>
              <p className="mt-1">
                Día {expense.paymentDay} · {
                  expense.paymentFrequency === 'monthly' ? 'Mensual' :
                  expense.paymentFrequency === 'bimonthly' ? 'Bimestral' :
                  expense.paymentFrequency === 'quarterly' ? 'Trimestral' :
                  expense.paymentFrequency === 'semester' ? 'Semestral' : 'Anual'
                }
              </p>
            </div>

            {/* Adjustment Rule */}
            {hasAdjustment && expense.adjustmentRule?.frequency && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Ajuste</p>
                <p className="mt-1">
                  {ADJUSTMENT_TYPE_LABELS[expense.adjustmentRule.type]}
                  {expense.adjustmentRule.type === 'fixed_percent' && ` (${expense.adjustmentRule.value}%)`}
                  {' · '}
                  {ADJUSTMENT_FREQUENCY_LABELS[expense.adjustmentRule.frequency]}
                </p>
              </div>
            )}

            {/* Renewal Rule */}
            {hasRenewal && (
              <div className="md:col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Renovación</p>
                <p className="mt-1">
                  Cada {expense.renewalRule!.frequencyMonths} meses · Próxima:{' '}
                  {new Date(expense.renewalRule!.nextRenewalDate).toLocaleDateString('es-AR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
                {expense.renewalRule!.associatedCosts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {expense.renewalRule!.associatedCosts.map(cost => (
                      <span
                        key={cost.id}
                        className="rounded-full bg-background px-2 py-1 text-xs"
                      >
                        {cost.name}:{' '}
                        {cost.isMultiplierOfBase
                          ? `${cost.amount}x base`
                          : formatARS(cost.amount)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {expense.notes && (
              <div className="md:col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Notas</p>
                <p className="mt-1">{expense.notes}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" onClick={onViewHistory}>
              <History className="size-3" />
              Ver historial
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit2 className="size-3" />
              Editar
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
              <Trash2 className="size-3" />
              Eliminar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
