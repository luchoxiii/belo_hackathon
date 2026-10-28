import { z } from 'zod'

// Tipo de ajuste: IPC, porcentaje fijo, o sin ajuste
export const adjustmentTypeSchema = z.enum(['ipc', 'fixed_percent', 'none'])
export type AdjustmentType = z.infer<typeof adjustmentTypeSchema>

// Frecuencia de ajuste
export const adjustmentFrequencySchema = z.enum(['monthly', 'bimonthly', 'quarterly', 'semester', 'yearly'])
export type AdjustmentFrequency = z.infer<typeof adjustmentFrequencySchema>

// Regla de ajuste para un gasto recurrente
export const adjustmentRuleSchema = z.object({
  type: adjustmentTypeSchema,
  // Para fixed_percent: el porcentaje de aumento (ej: 5 = 5%)
  value: z.number().optional(),
  // Cada cuánto se aplica el ajuste (opcional si type es 'none')
  frequency: adjustmentFrequencySchema.optional(),
  // Mes de inicio del ciclo de ajuste (1-12)
  startMonth: z.number().min(1).max(12).optional(),
})
export type AdjustmentRule = z.infer<typeof adjustmentRuleSchema>

// Costo asociado a una renovación (ej: garantía, depósito, mudanza)
export const renewalCostSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Monto fijo o relativo al monto base
  amount: z.number(),
  // Si true, 'amount' es un multiplicador del monto base (ej: 2 = 2 meses de alquiler)
  isMultiplierOfBase: z.boolean().default(false),
  // Categoría para clasificar el gasto
  category: z.string().optional(),
})
export type RenewalCost = z.infer<typeof renewalCostSchema>

// Regla de renovación (ej: renovar alquiler cada 2 años)
export const renewalRuleSchema = z.object({
  // Cada cuántos meses se renueva
  frequencyMonths: z.number().min(1),
  // Fecha de la última/próxima renovación
  nextRenewalDate: z.string(),
  // Costos asociados a la renovación
  associatedCosts: z.array(renewalCostSchema),
  // Ajuste esperado en la renovación (ej: aumento del 30% en el alquiler base)
  expectedAdjustment: z.object({
    type: z.enum(['ipc_accumulated', 'fixed_percent', 'none']),
    value: z.number().optional(), // Para fixed_percent
  }).optional(),
})
export type RenewalRule = z.infer<typeof renewalRuleSchema>

// Gasto recurrente completo
export const recurringExpenseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  category: z.string(),

  // Monto base actual
  baseAmount: z.number(),
  // Moneda (por ahora solo ARS)
  currency: z.literal('ARS').default('ARS'),

  // Cuándo empezó este gasto
  startDate: z.string(),
  // Cuándo termina (opcional, para gastos temporales)
  endDate: z.string().optional(),

  // Frecuencia de pago
  paymentFrequency: z.enum(['monthly', 'bimonthly', 'quarterly', 'semester', 'yearly']),
  // Día del mes en que se paga (1-28 para evitar problemas con meses cortos)
  paymentDay: z.number().min(1).max(28).default(1),

  // Regla de ajuste periódico (ej: aumenta por IPC cada 3 meses)
  adjustmentRule: adjustmentRuleSchema.optional(),

  // Regla de renovación (ej: contrato de alquiler cada 2 años)
  renewalRule: renewalRuleSchema.optional(),

  // Si este gasto se ajusta junto con servicios (para el agente)
  adjustsWithServices: z.boolean().default(false),

  // Notas adicionales
  notes: z.string().optional(),

  // Historial de ajustes aplicados
  adjustmentHistory: z.array(z.object({
    date: z.string(),
    previousAmount: z.number(),
    newAmount: z.number(),
    reason: z.string(), // 'ipc', 'renewal', 'manual'
    ipcValue: z.number().optional(),
  })).default([]),

  // Timestamps
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type RecurringExpense = z.infer<typeof recurringExpenseSchema>

// Dato de IPC mensual
export const ipcDataPointSchema = z.object({
  // Formato "YYYY-MM"
  month: z.string(),
  // Variación mensual (ej: 4.2 = 4.2%)
  monthlyVariation: z.number(),
  // Variación interanual (ej: 142.7 = 142.7%)
  yearOverYear: z.number().optional(),
  // Fuente del dato
  source: z.enum(['indec', 'estimate', 'manual']).default('indec'),
})
export type IPCDataPoint = z.infer<typeof ipcDataPointSchema>

// Evento financiero programado (one-time)
export const scheduledExpenseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  category: z.string(),
  amount: z.number(),
  currency: z.literal('ARS').default('ARS'),
  // Fecha programada
  scheduledDate: z.string(),
  // Si está vinculado a un gasto recurrente (ej: renovación de alquiler)
  linkedRecurringExpenseId: z.string().optional(),
  // Estado
  status: z.enum(['pending', 'paid', 'cancelled']).default('pending'),
  // Timestamps
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ScheduledExpense = z.infer<typeof scheduledExpenseSchema>

// Store completo
export const recurringExpensesStoreSchema = z.object({
  recurringExpenses: z.array(recurringExpenseSchema),
  scheduledExpenses: z.array(scheduledExpenseSchema),
  ipcHistory: z.array(ipcDataPointSchema),
  settings: z.object({
    // Usar IPC real o estimación manual para proyecciones
    inflationSource: z.enum(['ipc', 'manual']).default('ipc'),
    // Estimación manual de inflación mensual (si no usa IPC)
    manualMonthlyInflation: z.number().default(4),
    // IPC estimado para meses futuros (cuando no hay dato oficial)
    estimatedFutureIPC: z.number().default(3.5),
  }),
})
export type RecurringExpensesStore = z.infer<typeof recurringExpensesStoreSchema>

// Categorías predefinidas para gastos recurrentes
export const RECURRING_EXPENSE_CATEGORIES = {
  vivienda: { label: 'Vivienda', icon: 'home' },
  servicios: { label: 'Servicios', icon: 'zap' },
  transporte: { label: 'Transporte', icon: 'car' },
  salud: { label: 'Salud', icon: 'heart' },
  educacion: { label: 'Educación', icon: 'graduation-cap' },
  entretenimiento: { label: 'Entretenimiento', icon: 'tv' },
  seguros: { label: 'Seguros', icon: 'shield' },
  impuestos: { label: 'Impuestos', icon: 'landmark' },
  suscripciones: { label: 'Suscripciones', icon: 'repeat' },
  otros: { label: 'Otros', icon: 'more-horizontal' },
} as const

export const ADJUSTMENT_FREQUENCY_LABELS: Record<AdjustmentFrequency, string> = {
  monthly: 'Mensual',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  semester: 'Semestral',
  yearly: 'Anual',
}

export const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
  ipc: 'Por IPC',
  fixed_percent: 'Porcentaje fijo',
  none: 'Sin ajuste',
}
