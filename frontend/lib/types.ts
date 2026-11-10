import { z } from 'zod'

export const CATEGORIES = [
  'Sueldo',
  'Aguinaldo',
  'Alquiler',
  'Servicios',
  'Impuestos',
  'Educación',
  'Otros',
] as const

export const FREQUENCIES = [
  'unico',
  'mensual',
  'bimestral',
  'trimestral',
  'semestral',
  'anual',
] as const

export const FREQUENCY_LABELS: Record<(typeof FREQUENCIES)[number], string> = {
  unico: 'Único',
  mensual: 'Mensual',
  bimestral: 'Bimestral',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
}

export const FREQUENCY_STEP_MONTHS: Record<(typeof FREQUENCIES)[number], number> = {
  unico: 0,
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const financialEventSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(['ingreso', 'gasto']),
  name: z.string().min(1).max(80),
  category: z.enum(CATEGORIES),
  amount: z.number().positive().finite(),
  frequency: z.enum(FREQUENCIES),
  startDate: isoDate,
  endDate: isoDate.nullable(),
  adjustsForInflation: z.boolean(),
})

export const settingsSchema = z.object({
  monthlyInflation: z.number().min(0).max(100),
  currency: z.literal('ARS'),
})

export type FinancialEvent = z.infer<typeof financialEventSchema>
export type Settings = z.infer<typeof settingsSchema>
export type Category = (typeof CATEGORIES)[number]
export type Frequency = (typeof FREQUENCIES)[number]

export const DEFAULT_SETTINGS: Settings = {
  monthlyInflation: 4,
  currency: 'ARS',
}
