import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  IPC_HISTORY,
  projectAmountWithIPC,
  getIPCForMonth,
  getAverageIPC,
} from '@/lib/recurring-expenses/ipc-data'
import type { RecurringExpense, ScheduledExpense, IPCDataPoint } from '@/lib/recurring-expenses/types'

// Este endpoint provee proyecciones basadas en reglas de gastos recurrentes
// Los datos se cargan desde localStorage en el cliente, pero aquí usamos los datos de demo
// para mostrar cómo funcionarían las proyecciones

// Datos de demo para el servidor (normalmente estos vendrían del cliente)
const DEMO_RECURRING_EXPENSES: RecurringExpense[] = [
  {
    id: 'demo-alquiler',
    name: 'Alquiler',
    description: 'Departamento 3 ambientes en Palermo',
    category: 'vivienda',
    baseAmount: 450000,
    currency: 'ARS',
    startDate: '2023-01-01',
    paymentFrequency: 'monthly',
    paymentDay: 1,
    adjustmentRule: {
      type: 'ipc',
      frequency: 'quarterly',
      startMonth: 3,
    },
    renewalRule: {
      frequencyMonths: 24,
      nextRenewalDate: '2025-12-01',
      associatedCosts: [
        { id: 'deposito', name: 'Depósito', amount: 2, isMultiplierOfBase: true, category: 'vivienda' },
        { id: 'garantia', name: 'Garantía', amount: 1, isMultiplierOfBase: true, category: 'vivienda' },
        { id: 'comision', name: 'Comisión inmobiliaria', amount: 1, isMultiplierOfBase: true, category: 'vivienda' },
        { id: 'mudanza', name: 'Mudanza (estimado)', amount: 150000, isMultiplierOfBase: false, category: 'vivienda' },
      ],
    },
    adjustsWithServices: false,
    adjustmentHistory: [],
    createdAt: '2023-01-01',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-expensas',
    name: 'Expensas',
    category: 'vivienda',
    baseAmount: 85000,
    currency: 'ARS',
    startDate: '2023-01-01',
    paymentFrequency: 'monthly',
    paymentDay: 10,
    adjustmentRule: {
      type: 'ipc',
      frequency: 'bimonthly',
    },
    adjustsWithServices: true,
    adjustmentHistory: [],
    createdAt: '2023-01-01',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-luz',
    name: 'Edenor (Luz)',
    category: 'servicios',
    baseAmount: 35000,
    currency: 'ARS',
    startDate: '2023-01-01',
    paymentFrequency: 'monthly',
    paymentDay: 15,
    adjustmentRule: {
      type: 'ipc',
      frequency: 'bimonthly',
    },
    adjustsWithServices: true,
    adjustmentHistory: [],
    createdAt: '2023-01-01',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-prepaga',
    name: 'OSDE 310',
    description: 'Plan familiar',
    category: 'salud',
    baseAmount: 180000,
    currency: 'ARS',
    startDate: '2023-01-01',
    paymentFrequency: 'monthly',
    paymentDay: 1,
    adjustmentRule: {
      type: 'ipc',
      frequency: 'monthly',
    },
    adjustsWithServices: false,
    adjustmentHistory: [],
    createdAt: '2023-01-01',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-colegio',
    name: 'Colegio Valentina',
    category: 'educacion',
    baseAmount: 250000,
    currency: 'ARS',
    startDate: '2023-01-01',
    paymentFrequency: 'monthly',
    paymentDay: 10,
    adjustmentRule: {
      type: 'fixed_percent',
      value: 4,
      frequency: 'monthly',
    },
    adjustsWithServices: false,
    adjustmentHistory: [],
    createdAt: '2023-01-01',
    updatedAt: new Date().toISOString(),
  },
]

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function getProjectedAmount(
  expense: RecurringExpense,
  targetMonth: string,
  ipcData: IPCDataPoint[],
  estimatedFutureIPC: number = 2.5
): number {
  if (!expense.adjustmentRule || expense.adjustmentRule.type === 'none') {
    return expense.baseAmount
  }

  const currentMonth = getCurrentMonth()

  if (expense.adjustmentRule.type === 'ipc') {
    return projectAmountWithIPC(
      expense.baseAmount,
      currentMonth,
      targetMonth,
      ipcData,
      estimatedFutureIPC
    )
  }

  if (expense.adjustmentRule.type === 'fixed_percent' && expense.adjustmentRule.value) {
    const now = new Date()
    const target = new Date(targetMonth + '-01')
    const monthsDiff = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())

    if (monthsDiff <= 0) return expense.baseAmount

    let periods = 0
    switch (expense.adjustmentRule.frequency) {
      case 'monthly': periods = monthsDiff; break
      case 'bimonthly': periods = Math.floor(monthsDiff / 2); break
      case 'quarterly': periods = Math.floor(monthsDiff / 3); break
      case 'semester': periods = Math.floor(monthsDiff / 6); break
      case 'yearly': periods = Math.floor(monthsDiff / 12); break
    }

    const factor = Math.pow(1 + expense.adjustmentRule.value / 100, periods)
    return Math.round(expense.baseAmount * factor)
  }

  return expense.baseAmount
}

function getScheduledExpensesForMonth(
  expenses: RecurringExpense[],
  targetMonth: string
): ScheduledExpense[] {
  const scheduled: ScheduledExpense[] = []

  for (const expense of expenses) {
    if (!expense.renewalRule) continue

    const renewal = new Date(expense.renewalRule.nextRenewalDate)
    const renewalMonth = `${renewal.getFullYear()}-${String(renewal.getMonth() + 1).padStart(2, '0')}`

    if (renewalMonth === targetMonth) {
      for (const cost of expense.renewalRule.associatedCosts) {
        const amount = cost.isMultiplierOfBase
          ? expense.baseAmount * cost.amount
          : cost.amount

        scheduled.push({
          id: `${expense.id}-renewal-${cost.id}`,
          name: `${cost.name} (${expense.name})`,
          description: `Renovación de ${expense.name}`,
          category: cost.category || expense.category,
          amount: Math.round(amount),
          currency: 'ARS',
          scheduledDate: expense.renewalRule.nextRenewalDate,
          linkedRecurringExpenseId: expense.id,
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }
    }
  }

  return scheduled
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params

  // Validar formato yyyy-MM
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Formato inválido. Usar yyyy-MM' }, { status: 400 })
  }

  const targetDate = new Date(month + '-01')
  const now = new Date()
  const currentMonth = getCurrentMonth()

  // Solo proyecciones futuras
  if (month <= currentMonth) {
    return NextResponse.json({
      error: 'Este endpoint es solo para proyecciones futuras',
      suggestion: 'Usa /api/month/[month] para datos históricos',
    }, { status: 400 })
  }

  const ipcData = IPC_HISTORY
  const estimatedFutureIPC = 2.5 // Default

  // Calcular proyecciones para cada gasto recurrente
  const projectedExpenses = DEMO_RECURRING_EXPENSES
    .filter(e => {
      // Verificar si el gasto está activo en ese mes
      const start = e.startDate.substring(0, 7)
      const end = e.endDate?.substring(0, 7)
      return month >= start && (!end || month <= end)
    })
    .filter(e => {
      // Verificar si se paga en ese mes según la frecuencia
      const target = new Date(month + '-01')
      const start = new Date(e.startDate)
      const monthsDiff = (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth())

      switch (e.paymentFrequency) {
        case 'monthly': return true
        case 'bimonthly': return monthsDiff % 2 === 0
        case 'quarterly': return monthsDiff % 3 === 0
        case 'semester': return monthsDiff % 6 === 0
        case 'yearly': return monthsDiff % 12 === 0
        default: return true
      }
    })
    .map(expense => ({
      id: expense.id,
      name: expense.name,
      category: expense.category,
      currentAmount: expense.baseAmount,
      projectedAmount: getProjectedAmount(expense, month, ipcData, estimatedFutureIPC),
      adjustmentType: expense.adjustmentRule?.type || 'none',
      confidence: expense.adjustmentRule?.type === 'ipc' ? 'high' as const :
                  expense.adjustmentRule?.type === 'fixed_percent' ? 'high' as const : 'medium' as const,
    }))

  // Gastos programados (renovaciones)
  const scheduledExpenses = getScheduledExpensesForMonth(DEMO_RECURRING_EXPENSES, month)

  const totalRecurring = projectedExpenses.reduce((sum, e) => sum + e.projectedAmount, 0)
  const totalScheduled = scheduledExpenses.reduce((sum, e) => sum + e.amount, 0)

  // IPC info
  const ipcForMonth = getIPCForMonth(month, ipcData)
  const avgIPC = getAverageIPC(3, ipcData)

  return NextResponse.json({
    month,
    label: targetDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
    type: 'projection',
    ipc: {
      monthValue: ipcForMonth?.monthlyVariation || estimatedFutureIPC,
      source: ipcForMonth?.source || 'estimate',
      averageLast3Months: avgIPC,
    },
    summary: {
      totalRecurring,
      totalScheduled,
      total: totalRecurring + totalScheduled,
      expenseCount: projectedExpenses.length,
      hasRenewals: scheduledExpenses.length > 0,
    },
    recurring: projectedExpenses,
    scheduled: scheduledExpenses.map(s => ({
      id: s.id,
      name: s.name,
      category: s.category,
      amount: s.amount,
      date: s.scheduledDate,
      linkedTo: s.linkedRecurringExpenseId,
    })),
    note: ipcForMonth?.source === 'estimate'
      ? `Proyección basada en IPC estimado (${estimatedFutureIPC}% mensual). Los valores reales pueden variar.`
      : 'Proyección basada en IPC oficial y reglas de ajuste configuradas.',
  })
}
