/**
 * Adaptador para integrar datos mock con la estructura existente de Belo/Cusco
 *
 * Convierte transacciones históricas al formato de FinancialEvent
 * y provee funciones para consultar el historial
 */

import { Transaction, MockDataset, TransactionCategory } from './types'
import { FinancialEvent, Category, Frequency } from '../types'

// ============================================
// MAPEO DE CATEGORÍAS
// ============================================

// Mapea categorías detalladas a categorías simples del sistema existente
const CATEGORY_MAP: Record<TransactionCategory, Category> = {
  // Ingresos
  salario: 'Sueldo',
  aguinaldo: 'Aguinaldo',
  freelance: 'Otros',
  alquiler_cobrado: 'Alquiler',
  reembolso: 'Otros',
  transferencia_recibida: 'Otros',
  interes_plazo_fijo: 'Otros',
  dividendos: 'Otros',
  venta_crypto: 'Otros',

  // Gastos fijos
  alquiler: 'Alquiler',
  expensas: 'Alquiler',
  luz: 'Servicios',
  gas: 'Servicios',
  agua: 'Servicios',
  internet: 'Servicios',
  telefono: 'Servicios',
  cable: 'Servicios',
  seguro_auto: 'Otros',
  seguro_hogar: 'Otros',
  patente: 'Impuestos',
  vtv: 'Otros',

  // Impuestos
  impuesto_ganancias: 'Impuestos',
  impuesto_bienes_personales: 'Impuestos',
  monotributo: 'Impuestos',
  iibb: 'Impuestos',
  abl: 'Impuestos',

  // Tarjeta de crédito
  tarjeta_resumen: 'Otros',
  tarjeta_supermercado: 'Otros',
  tarjeta_farmacia: 'Otros',
  tarjeta_indumentaria: 'Otros',
  tarjeta_restaurante: 'Otros',
  tarjeta_entretenimiento: 'Otros',
  tarjeta_tecnologia: 'Otros',
  tarjeta_viajes: 'Otros',
  tarjeta_combustible: 'Otros',
  tarjeta_otros: 'Otros',

  // Débitos automáticos
  debito_netflix: 'Servicios',
  debito_spotify: 'Servicios',
  debito_gimnasio: 'Otros',
  debito_obra_social: 'Otros',
  debito_prepaga: 'Otros',
  debito_colegio: 'Educación',
  debito_universidad: 'Educación',
  debito_streaming: 'Servicios',

  // Educación
  matricula_escolar: 'Educación',
  cuota_colegio: 'Educación',
  utiles_escolares: 'Educación',
  uniforme_escolar: 'Educación',
  actividad_extracurricular: 'Educación',

  // Crypto
  compra_crypto: 'Otros',
  swap_crypto: 'Otros',
  staking_reward: 'Otros',

  // Inversiones
  plazo_fijo_constitucion: 'Otros',
  plazo_fijo_vencimiento: 'Otros',
  compra_cedear: 'Otros',
  venta_cedear: 'Otros',
  compra_bono: 'Otros',
  venta_bono: 'Otros',
  fci_suscripcion: 'Otros',
  fci_rescate: 'Otros',

  // Transferencias
  transferencia_enviada: 'Otros',

  // Efectivo
  extraccion_cajero: 'Otros',
  deposito_efectivo: 'Otros',

  // Hogar y familia
  supermercado: 'Otros',
  farmacia: 'Otros',
  pediatra: 'Otros',
  medico: 'Otros',
  veterinario: 'Otros',
  mantenimiento_hogar: 'Otros',
  electrodomesticos: 'Otros',

  // Transporte
  combustible: 'Otros',
  estacionamiento: 'Otros',
  peaje: 'Otros',
  mantenimiento_auto: 'Otros',
  transporte_publico: 'Otros',
  uber_taxi: 'Otros',

  // Otros
  regalo: 'Otros',
  donacion: 'Otros',
  otros: 'Otros',
}

// ============================================
// FUNCIONES DE CONVERSIÓN
// ============================================

/**
 * Convierte una transacción mock a FinancialEvent (evento único)
 */
export function transactionToFinancialEvent(tx: Transaction): FinancialEvent {
  const date = tx.createdAt.split('T')[0]

  return {
    id: tx.id,
    type: tx.type === 'credit' ? 'ingreso' : 'gasto',
    name: tx.description,
    category: CATEGORY_MAP[tx.category] || 'Otros',
    amount: tx.amountArs,
    frequency: 'unico',
    startDate: date,
    endDate: null,
    adjustsForInflation: false,
  }
}

/**
 * Agrupa transacciones recurrentes y las convierte a eventos con frecuencia
 */
export function extractRecurringEvents(transactions: Transaction[]): FinancialEvent[] {
  // Agrupar por descripción/merchant para detectar patrones recurrentes
  const groups = new Map<string, Transaction[]>()

  for (const tx of transactions) {
    const key = `${tx.category}:${tx.merchant || tx.description}`
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(tx)
  }

  const events: FinancialEvent[] = []

  for (const [key, txs] of groups) {
    if (txs.length < 3) continue // Necesitamos al menos 3 para detectar patrón

    // Ordenar por fecha
    txs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

    // Calcular intervalo promedio entre transacciones
    const intervals: number[] = []
    for (let i = 1; i < txs.length; i++) {
      const diff = new Date(txs[i].createdAt).getTime() - new Date(txs[i - 1].createdAt).getTime()
      intervals.push(diff / (1000 * 60 * 60 * 24)) // Días
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length

    // Determinar frecuencia
    let frequency: Frequency = 'unico'
    if (avgInterval >= 25 && avgInterval <= 35) frequency = 'mensual'
    else if (avgInterval >= 55 && avgInterval <= 65) frequency = 'bimestral'
    else if (avgInterval >= 85 && avgInterval <= 95) frequency = 'trimestral'
    else if (avgInterval >= 175 && avgInterval <= 190) frequency = 'semestral'
    else if (avgInterval >= 350 && avgInterval <= 380) frequency = 'anual'

    if (frequency === 'unico') continue // No es recurrente

    // Calcular monto promedio
    const avgAmount = txs.reduce((sum, tx) => sum + tx.amountArs, 0) / txs.length
    const firstTx = txs[0]
    const lastTx = txs[txs.length - 1]

    events.push({
      id: `recurring-${firstTx.id}`,
      type: firstTx.type === 'credit' ? 'ingreso' : 'gasto',
      name: firstTx.merchant || firstTx.description,
      category: CATEGORY_MAP[firstTx.category] || 'Otros',
      amount: Math.round(avgAmount),
      frequency,
      startDate: firstTx.createdAt.split('T')[0],
      endDate: null, // Asumir que continúa
      adjustsForInflation: true,
    })
  }

  return events
}

// ============================================
// FUNCIONES DE CONSULTA
// ============================================

export interface TransactionFilter {
  from?: Date
  to?: Date
  type?: 'credit' | 'debit'
  category?: TransactionCategory | TransactionCategory[]
  minAmount?: number
  maxAmount?: number
  method?: string
  merchant?: string
  search?: string
}

/**
 * Filtra transacciones según criterios
 */
export function filterTransactions(
  transactions: Transaction[],
  filter: TransactionFilter
): Transaction[] {
  return transactions.filter(tx => {
    if (filter.from && new Date(tx.createdAt) < filter.from) return false
    if (filter.to && new Date(tx.createdAt) > filter.to) return false
    if (filter.type && tx.type !== filter.type) return false
    if (filter.minAmount && tx.amountArs < filter.minAmount) return false
    if (filter.maxAmount && tx.amountArs > filter.maxAmount) return false
    if (filter.method && tx.method !== filter.method) return false
    if (filter.merchant && tx.merchant !== filter.merchant) return false

    if (filter.category) {
      const categories = Array.isArray(filter.category) ? filter.category : [filter.category]
      if (!categories.includes(tx.category)) return false
    }

    if (filter.search) {
      const searchLower = filter.search.toLowerCase()
      const matches =
        tx.description.toLowerCase().includes(searchLower) ||
        (tx.merchant?.toLowerCase().includes(searchLower) ?? false) ||
        tx.category.toLowerCase().includes(searchLower)
      if (!matches) return false
    }

    return true
  })
}

/**
 * Agrupa transacciones por mes
 */
export function groupByMonth(transactions: Transaction[]): Map<string, Transaction[]> {
  const groups = new Map<string, Transaction[]>()

  for (const tx of transactions) {
    const month = tx.createdAt.substring(0, 7) // yyyy-MM
    if (!groups.has(month)) {
      groups.set(month, [])
    }
    groups.get(month)!.push(tx)
  }

  return groups
}

/**
 * Calcula totales por categoría
 */
export function sumByCategory(
  transactions: Transaction[]
): Record<TransactionCategory, number> {
  const result = {} as Record<TransactionCategory, number>

  for (const tx of transactions) {
    result[tx.category] = (result[tx.category] || 0) + tx.amountArs
  }

  return result
}

/**
 * Calcula balance acumulado día a día
 */
export function calculateDailyBalance(
  transactions: Transaction[],
  initialBalance: number = 0
): Array<{ date: string; balance: number; income: number; expense: number }> {
  // Agrupar por día
  const byDay = new Map<string, { income: number; expense: number }>()

  for (const tx of transactions) {
    const date = tx.createdAt.split('T')[0]
    if (!byDay.has(date)) {
      byDay.set(date, { income: 0, expense: 0 })
    }
    const day = byDay.get(date)!
    if (tx.type === 'credit') {
      day.income += tx.amountArs
    } else {
      day.expense += tx.amountArs
    }
  }

  // Ordenar y calcular balance acumulado
  const sortedDays = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  const result: Array<{ date: string; balance: number; income: number; expense: number }> = []
  let balance = initialBalance

  for (const [date, { income, expense }] of sortedDays) {
    balance = balance + income - expense
    result.push({ date, balance, income, expense })
  }

  return result
}

// ============================================
// INTEGRACIÓN CON BELO
// ============================================

/**
 * Formatea datos para la API de balance de Belo
 */
export function formatForBeloBalance(dataset: MockDataset) {
  const arsAccount = dataset.accounts.find(a => a.currency === 'ARS')

  return {
    amount: arsAccount?.balance.available ?? 0,
    currency: 'ARS' as const,
    updatedAt: new Date().toISOString(),
    source: 'belo-mock' as const,
  }
}

/**
 * Obtiene transacciones recientes para mostrar en el dashboard
 */
export function getRecentTransactions(
  transactions: Transaction[],
  limit: number = 10
): Transaction[] {
  return [...transactions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
}

/**
 * Calcula métricas mensuales para proyecciones
 */
export function calculateMonthlyMetrics(transactions: Transaction[]) {
  const byMonth = groupByMonth(transactions)
  const metrics: Array<{
    month: string
    income: number
    expenses: number
    net: number
    cryptoInvestment: number
    plazoFijo: number
  }> = []

  for (const [month, txs] of byMonth) {
    const income = txs
      .filter(t => t.type === 'credit')
      .reduce((sum, t) => sum + t.amountArs, 0)

    const expenses = txs
      .filter(t => t.type === 'debit')
      .reduce((sum, t) => sum + t.amountArs, 0)

    const cryptoInvestment = txs
      .filter(t => t.category === 'compra_crypto')
      .reduce((sum, t) => sum + t.amountArs, 0)

    const plazoFijo = txs
      .filter(t => t.category === 'plazo_fijo_constitucion')
      .reduce((sum, t) => sum + t.amountArs, 0)

    metrics.push({
      month,
      income,
      expenses,
      net: income - expenses,
      cryptoInvestment,
      plazoFijo,
    })
  }

  return metrics.sort((a, b) => a.month.localeCompare(b.month))
}
