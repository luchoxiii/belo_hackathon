'use client'

import { useSyncExternalStore } from 'react'
import {
  recurringExpenseSchema,
  scheduledExpenseSchema,
  ipcDataPointSchema,
  type RecurringExpense,
  type ScheduledExpense,
  type IPCDataPoint,
  type RecurringExpensesStore,
} from './types'
import { IPC_HISTORY, projectAmountWithIPC, calculateIPCAdjustment } from './ipc-data'

type State = RecurringExpensesStore

const STORAGE_KEY = 'belo-recurring:v1'

const DEFAULT_STATE: State = {
  recurringExpenses: [],
  scheduledExpenses: [],
  ipcHistory: IPC_HISTORY,
  settings: {
    inflationSource: 'ipc',
    manualMonthlyInflation: 4,
    estimatedFutureIPC: 2.5,
  },
}

let state: State = DEFAULT_STATE
let loaded = false
const listeners = new Set<() => void>()

function load() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // Cargar datos de demo si es la primera vez
      state = { ...DEFAULT_STATE, recurringExpenses: buildDemoRecurringExpenses() }
      return
    }
    const parsed = JSON.parse(raw)

    const recurringExpenses = Array.isArray(parsed?.recurringExpenses)
      ? parsed.recurringExpenses.flatMap((e: unknown) => {
          const result = recurringExpenseSchema.safeParse(e)
          return result.success ? [result.data] : []
        })
      : []

    const scheduledExpenses = Array.isArray(parsed?.scheduledExpenses)
      ? parsed.scheduledExpenses.flatMap((e: unknown) => {
          const result = scheduledExpenseSchema.safeParse(e)
          return result.success ? [result.data] : []
        })
      : []

    // Siempre usar IPC_HISTORY actualizado, pero permitir agregar datos manuales
    const customIPC = Array.isArray(parsed?.customIPC)
      ? parsed.customIPC.flatMap((e: unknown) => {
          const result = ipcDataPointSchema.safeParse(e)
          return result.success && result.data.source === 'manual' ? [result.data] : []
        })
      : []

    state = {
      recurringExpenses,
      scheduledExpenses,
      ipcHistory: [...IPC_HISTORY, ...customIPC],
      settings: {
        ...DEFAULT_STATE.settings,
        ...parsed?.settings,
      },
    }
  } catch {
    state = DEFAULT_STATE
  }
}

function commit(next: State) {
  state = next
  try {
    // Guardar solo datos custom, no IPC_HISTORY
    const toSave = {
      recurringExpenses: next.recurringExpenses,
      scheduledExpenses: next.scheduledExpenses,
      customIPC: next.ipcHistory.filter(d => d.source === 'manual'),
      settings: next.settings,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch {
    // Storage full or blocked
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return
    loaded = false
    load()
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function getRecurringState() {
  load()
  return state
}

const getServerState = () => DEFAULT_STATE
const subscribeHydration = () => () => {}

// Helper para obtener el mes actual en formato "YYYY-MM"
function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Helper para generar scheduled expenses de renovaciones próximas
function generateScheduledFromRenewal(
  expense: RecurringExpense,
  months: number = 24
): ScheduledExpense[] {
  if (!expense.renewalRule) return []

  const scheduled: ScheduledExpense[] = []
  const now = new Date()
  const endDate = new Date()
  endDate.setMonth(endDate.getMonth() + months)

  let nextRenewal = new Date(expense.renewalRule.nextRenewalDate)

  while (nextRenewal <= endDate) {
    if (nextRenewal >= now) {
      // Generar gastos asociados a la renovación
      for (const cost of expense.renewalRule.associatedCosts) {
        const amount = cost.isMultiplierOfBase
          ? expense.baseAmount * cost.amount
          : cost.amount

        scheduled.push({
          id: `${expense.id}-renewal-${nextRenewal.toISOString()}-${cost.id}`,
          name: `${cost.name} (${expense.name})`,
          description: `Renovación de ${expense.name}`,
          category: cost.category || expense.category,
          amount: Math.round(amount),
          currency: 'ARS',
          scheduledDate: nextRenewal.toISOString().split('T')[0],
          linkedRecurringExpenseId: expense.id,
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }
    }
    // Siguiente renovación
    nextRenewal = new Date(nextRenewal)
    nextRenewal.setMonth(nextRenewal.getMonth() + expense.renewalRule.frequencyMonths)
  }

  return scheduled
}

export const recurringActions = {
  // Gastos recurrentes
  addRecurringExpense(expense: Omit<RecurringExpense, 'id' | 'createdAt' | 'updatedAt' | 'adjustmentHistory'>) {
    const now = new Date().toISOString()
    const newExpense: RecurringExpense = {
      ...expense,
      id: crypto.randomUUID(),
      adjustmentHistory: [],
      createdAt: now,
      updatedAt: now,
    }

    const current = getRecurringState()

    // Generar scheduled expenses si hay renovación
    const scheduledFromRenewal = generateScheduledFromRenewal(newExpense)

    commit({
      ...current,
      recurringExpenses: [...current.recurringExpenses, newExpense],
      scheduledExpenses: [...current.scheduledExpenses, ...scheduledFromRenewal],
    })

    return newExpense
  },

  updateRecurringExpense(expense: RecurringExpense) {
    const current = getRecurringState()

    // Actualizar timestamp
    const updated = { ...expense, updatedAt: new Date().toISOString() }

    // Regenerar scheduled expenses si hay renovación
    const otherScheduled = current.scheduledExpenses.filter(
      s => s.linkedRecurringExpenseId !== expense.id
    )
    const scheduledFromRenewal = generateScheduledFromRenewal(updated)

    commit({
      ...current,
      recurringExpenses: current.recurringExpenses.map((e) =>
        e.id === expense.id ? updated : e
      ),
      scheduledExpenses: [...otherScheduled, ...scheduledFromRenewal],
    })
  },

  removeRecurringExpense(id: string) {
    const current = getRecurringState()
    commit({
      ...current,
      recurringExpenses: current.recurringExpenses.filter((e) => e.id !== id),
      scheduledExpenses: current.scheduledExpenses.filter(
        (s) => s.linkedRecurringExpenseId !== id
      ),
    })
  },

  // Aplicar ajuste de IPC a un gasto
  applyIPCAdjustment(expenseId: string) {
    const current = getRecurringState()
    const expense = current.recurringExpenses.find((e) => e.id === expenseId)
    if (!expense || !expense.adjustmentRule || expense.adjustmentRule.type !== 'ipc') return

    const lastAdjustment = expense.adjustmentHistory[expense.adjustmentHistory.length - 1]
    const lastMonth = lastAdjustment?.date?.substring(0, 7) || expense.startDate.substring(0, 7)
    const currentMonth = getCurrentMonth()

    const { accumulated, factor } = calculateIPCAdjustment(lastMonth, currentMonth, current.ipcHistory)
    const newAmount = Math.round(expense.baseAmount * factor)

    const updated: RecurringExpense = {
      ...expense,
      baseAmount: newAmount,
      adjustmentHistory: [
        ...expense.adjustmentHistory,
        {
          date: new Date().toISOString(),
          previousAmount: expense.baseAmount,
          newAmount,
          reason: 'ipc',
          ipcValue: accumulated,
        },
      ],
      updatedAt: new Date().toISOString(),
    }

    commit({
      ...current,
      recurringExpenses: current.recurringExpenses.map((e) =>
        e.id === expenseId ? updated : e
      ),
    })
  },

  // Scheduled expenses
  addScheduledExpense(expense: Omit<ScheduledExpense, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString()
    const newExpense: ScheduledExpense = {
      ...expense,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }
    const current = getRecurringState()
    commit({
      ...current,
      scheduledExpenses: [...current.scheduledExpenses, newExpense],
    })
    return newExpense
  },

  updateScheduledExpense(expense: ScheduledExpense) {
    const current = getRecurringState()
    commit({
      ...current,
      scheduledExpenses: current.scheduledExpenses.map((e) =>
        e.id === expense.id ? { ...expense, updatedAt: new Date().toISOString() } : e
      ),
    })
  },

  removeScheduledExpense(id: string) {
    const current = getRecurringState()
    commit({
      ...current,
      scheduledExpenses: current.scheduledExpenses.filter((e) => e.id !== id),
    })
  },

  markScheduledAsPaid(id: string) {
    const current = getRecurringState()
    commit({
      ...current,
      scheduledExpenses: current.scheduledExpenses.map((e) =>
        e.id === id ? { ...e, status: 'paid' as const, updatedAt: new Date().toISOString() } : e
      ),
    })
  },

  // Settings
  updateSettings(settings: Partial<State['settings']>) {
    const current = getRecurringState()
    commit({
      ...current,
      settings: { ...current.settings, ...settings },
    })
  },

  // Reset
  resetAll() {
    commit({ ...DEFAULT_STATE, recurringExpenses: buildDemoRecurringExpenses() })
  },

  clearAll() {
    commit(DEFAULT_STATE)
  },

  // Proyecciones
  getProjectedAmount(expense: RecurringExpense, targetMonth: string): number {
    const current = getRecurringState()

    if (!expense.adjustmentRule || expense.adjustmentRule.type === 'none') {
      return expense.baseAmount
    }

    if (expense.adjustmentRule.type === 'ipc') {
      return projectAmountWithIPC(
        expense.baseAmount,
        getCurrentMonth(),
        targetMonth,
        current.ipcHistory,
        current.settings.estimatedFutureIPC
      )
    }

    if (expense.adjustmentRule.type === 'fixed_percent' && expense.adjustmentRule.value) {
      // Calcular cuántos períodos de ajuste hay entre ahora y el mes objetivo
      const now = new Date()
      const target = new Date(targetMonth + '-01')
      const monthsDiff = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())

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
  },

  // Obtener todos los gastos proyectados para un mes
  getMonthlyProjection(targetMonth: string): {
    recurring: Array<{ expense: RecurringExpense; projectedAmount: number }>
    scheduled: ScheduledExpense[]
    totalRecurring: number
    totalScheduled: number
  } {
    const current = getRecurringState()

    const recurring = current.recurringExpenses
      .filter(e => {
        // Verificar si el gasto está activo en ese mes
        const start = e.startDate.substring(0, 7)
        const end = e.endDate?.substring(0, 7)
        return targetMonth >= start && (!end || targetMonth <= end)
      })
      .filter(e => {
        // Verificar si se paga en ese mes según la frecuencia
        const target = new Date(targetMonth + '-01')
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
        expense,
        projectedAmount: recurringActions.getProjectedAmount(expense, targetMonth),
      }))

    const scheduled = current.scheduledExpenses.filter(
      s => s.scheduledDate.startsWith(targetMonth) && s.status === 'pending'
    )

    return {
      recurring,
      scheduled,
      totalRecurring: recurring.reduce((sum, r) => sum + r.projectedAmount, 0),
      totalScheduled: scheduled.reduce((sum, s) => sum + s.amount, 0),
    }
  },
}

export function useRecurringExpenses() {
  const store = useSyncExternalStore(subscribe, getRecurringState, getServerState)
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  )
  return { ...store, hydrated, ...recurringActions }
}

// Datos de demo
function buildDemoRecurringExpenses(): RecurringExpense[] {
  const now = new Date()
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  // Fecha de próxima renovación de alquiler (ejemplo: en 8 meses)
  const nextRenewal = new Date()
  nextRenewal.setMonth(nextRenewal.getMonth() + 8)

  return [
    {
      id: 'demo-alquiler',
      name: 'Alquiler',
      description: 'Departamento 3 ambientes en Palermo',
      category: 'vivienda',
      baseAmount: 450000,
      currency: 'ARS',
      startDate: twoYearsAgo.toISOString().split('T')[0],
      paymentFrequency: 'monthly',
      paymentDay: 1,
      adjustmentRule: {
        type: 'ipc',
        frequency: 'quarterly',
        startMonth: 3, // Marzo, Junio, Septiembre, Diciembre
      },
      renewalRule: {
        frequencyMonths: 24,
        nextRenewalDate: nextRenewal.toISOString().split('T')[0],
        associatedCosts: [
          { id: 'deposito', name: 'Depósito', amount: 2, isMultiplierOfBase: true, category: 'vivienda' },
          { id: 'garantia', name: 'Garantía', amount: 1, isMultiplierOfBase: true, category: 'vivienda' },
          { id: 'comision', name: 'Comisión inmobiliaria', amount: 1, isMultiplierOfBase: true, category: 'vivienda' },
          { id: 'mudanza', name: 'Mudanza (estimado)', amount: 150000, isMultiplierOfBase: false, category: 'vivienda' },
        ],
        expectedAdjustment: {
          type: 'ipc_accumulated',
        },
      },
      adjustsWithServices: false,
      adjustmentHistory: [],
      createdAt: twoYearsAgo.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'demo-expensas',
      name: 'Expensas',
      category: 'vivienda',
      baseAmount: 85000,
      currency: 'ARS',
      startDate: twoYearsAgo.toISOString().split('T')[0],
      paymentFrequency: 'monthly',
      paymentDay: 10,
      adjustmentRule: {
        type: 'ipc',
        frequency: 'bimonthly',
      },
      adjustsWithServices: true,
      adjustmentHistory: [],
      createdAt: twoYearsAgo.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'demo-luz',
      name: 'Edenor (Luz)',
      category: 'servicios',
      baseAmount: 35000,
      currency: 'ARS',
      startDate: twoYearsAgo.toISOString().split('T')[0],
      paymentFrequency: 'monthly',
      paymentDay: 15,
      adjustmentRule: {
        type: 'ipc',
        frequency: 'bimonthly',
      },
      adjustsWithServices: true,
      adjustmentHistory: [],
      createdAt: twoYearsAgo.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'demo-gas',
      name: 'Metrogas',
      category: 'servicios',
      baseAmount: 18000,
      currency: 'ARS',
      startDate: twoYearsAgo.toISOString().split('T')[0],
      paymentFrequency: 'monthly',
      paymentDay: 20,
      adjustmentRule: {
        type: 'ipc',
        frequency: 'bimonthly',
      },
      adjustsWithServices: true,
      adjustmentHistory: [],
      createdAt: twoYearsAgo.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'demo-internet',
      name: 'Fibertel',
      category: 'servicios',
      baseAmount: 28000,
      currency: 'ARS',
      startDate: twoYearsAgo.toISOString().split('T')[0],
      paymentFrequency: 'monthly',
      paymentDay: 5,
      adjustmentRule: {
        type: 'fixed_percent',
        value: 5, // 5% mensual
        frequency: 'monthly',
      },
      adjustsWithServices: true,
      adjustmentHistory: [],
      createdAt: twoYearsAgo.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'demo-prepaga',
      name: 'OSDE 310',
      description: 'Plan familiar (3 integrantes)',
      category: 'salud',
      baseAmount: 180000,
      currency: 'ARS',
      startDate: twoYearsAgo.toISOString().split('T')[0],
      paymentFrequency: 'monthly',
      paymentDay: 1,
      adjustmentRule: {
        type: 'ipc',
        frequency: 'monthly',
      },
      adjustsWithServices: false,
      adjustmentHistory: [],
      createdAt: twoYearsAgo.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'demo-colegio',
      name: 'Colegio Valentina',
      description: 'Cuota mensual colegio privado',
      category: 'educacion',
      baseAmount: 250000,
      currency: 'ARS',
      startDate: twoYearsAgo.toISOString().split('T')[0],
      paymentFrequency: 'monthly',
      paymentDay: 10,
      adjustmentRule: {
        type: 'fixed_percent',
        value: 4,
        frequency: 'monthly',
      },
      adjustsWithServices: false,
      notes: 'Incluye comedor. Matrícula en febrero.',
      adjustmentHistory: [],
      createdAt: twoYearsAgo.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'demo-seguro-auto',
      name: 'Seguro Auto',
      description: 'La Caja - Todo riesgo',
      category: 'seguros',
      baseAmount: 75000,
      currency: 'ARS',
      startDate: twoYearsAgo.toISOString().split('T')[0],
      paymentFrequency: 'monthly',
      paymentDay: 1,
      adjustmentRule: {
        type: 'fixed_percent',
        value: 6,
        frequency: 'quarterly',
      },
      adjustsWithServices: false,
      adjustmentHistory: [],
      createdAt: twoYearsAgo.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'demo-netflix',
      name: 'Netflix',
      category: 'suscripciones',
      baseAmount: 7000,
      currency: 'ARS',
      startDate: twoYearsAgo.toISOString().split('T')[0],
      paymentFrequency: 'monthly',
      paymentDay: 15,
      adjustmentRule: {
        type: 'none',
      },
      adjustsWithServices: false,
      adjustmentHistory: [],
      createdAt: twoYearsAgo.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'demo-spotify',
      name: 'Spotify Familiar',
      category: 'suscripciones',
      baseAmount: 4500,
      currency: 'ARS',
      startDate: twoYearsAgo.toISOString().split('T')[0],
      paymentFrequency: 'monthly',
      paymentDay: 20,
      adjustmentRule: {
        type: 'none',
      },
      adjustsWithServices: false,
      adjustmentHistory: [],
      createdAt: twoYearsAgo.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: 'demo-gimnasio',
      name: 'Gimnasio',
      category: 'salud',
      baseAmount: 35000,
      currency: 'ARS',
      startDate: twoYearsAgo.toISOString().split('T')[0],
      paymentFrequency: 'monthly',
      paymentDay: 1,
      adjustmentRule: {
        type: 'fixed_percent',
        value: 8,
        frequency: 'quarterly',
      },
      adjustsWithServices: false,
      adjustmentHistory: [],
      createdAt: twoYearsAgo.toISOString(),
      updatedAt: now.toISOString(),
    },
  ]
}
